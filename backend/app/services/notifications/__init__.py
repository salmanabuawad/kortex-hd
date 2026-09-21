"""Event-driven notification service.

Domain code calls emit(db, event_key, ...). This module decides who hears about
it, renders Hebrew copy, persists a notification_event plus one
notification_delivery per recipient/channel, and hands each to a provider.

Deliveries are always persisted, including in log mode, so the UI can show what
the system intended to send and whether it succeeded.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ...config import SUPPORT_INBOX
from ...constants import Channel, Events
from ...models import NotificationDelivery, NotificationEvent, User
from .providers import provider_for
from .templates import render

__all__ = ["emit", "Recipient"]


class Recipient:
    def __init__(self, name: str, *, email: str | None = None, phone: str | None = None,
                 channel: str = Channel.EMAIL):
        self.name = name
        self.email = email
        self.phone = phone
        self.channel = channel

    @classmethod
    def from_user(cls, user: User | None) -> "Recipient | None":
        if not user or not user.active:
            return None
        return cls(user.full_name, email=user.email, phone=user.phone, channel=Channel.EMAIL)

    def address_for(self, channel: str) -> str | None:
        return self.email if channel == Channel.EMAIL else self.phone


def emit(
    db: Session,
    event_key: str,
    *,
    recipients: list[Recipient | None],
    ticket=None,
    subtask=None,
    context: dict | None = None,
) -> NotificationEvent:
    context = context or {}
    event = NotificationEvent(
        event_key=event_key,
        ticket_id=ticket.id if ticket else None,
        subtask_id=subtask.id if subtask else None,
        payload=json.dumps(context, ensure_ascii=False, default=str),
    )
    db.add(event)
    db.flush()

    subject, body = render(event_key, ticket=ticket, subtask=subtask, context=context)

    # The service desk is copied on anything that happens to a ticket -- opened,
    # assigned, transferred, resolved, commented on -- so it holds a record
    # outside the application. Done here rather than at each call site so a new
    # event cannot quietly skip the desk. Deduplicated, because the desk address
    # is often also the resolver's.
    delivery_list = list(recipients)
    if ticket is not None and SUPPORT_INBOX:
        already = {
            (r.address_for(r.channel or Channel.EMAIL) or "").lower()
            for r in delivery_list if r is not None
        }
        if SUPPORT_INBOX.lower() not in already:
            delivery_list.append(
                Recipient("מוקד שירות", email=SUPPORT_INBOX, channel=Channel.EMAIL))

    for recipient in delivery_list:
        if recipient is None:
            continue
        channel = recipient.channel or Channel.EMAIL
        address = recipient.address_for(channel)
        delivery = NotificationDelivery(
            event_id=event.id,
            channel=channel,
            recipient=address or "",
            subject=subject,
            body=body,
        )
        if not address:
            delivery.status = "skipped"
            delivery.error = f"no {channel} address on record"
            db.add(delivery)
            continue

        provider = provider_for(channel)
        result = provider.send(address, subject, body)
        delivery.provider = result.provider
        delivery.attempts = 1
        if result.ok:
            delivery.status = "sent"
            delivery.sent_at = datetime.now(timezone.utc)
        else:
            delivery.status = "failed"
            delivery.error = result.error
        db.add(delivery)

    return event
