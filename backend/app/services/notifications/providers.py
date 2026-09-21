"""Notification provider interfaces and adapters.

Domain code never imports an adapter. It calls notifications.emit(...) with an
event key; the service resolves recipients, renders a message, and hands it to
whichever provider is configured for that channel.

Adding a real provider means implementing Provider.send and registering it in
PROVIDERS -- no change to ticket or subtask logic.
"""
from __future__ import annotations

import logging
import smtplib
from abc import ABC, abstractmethod
from email.header import Header
from email.message import EmailMessage
from email.utils import formataddr

from ...config import (
    EMAIL_PROVIDER, SMS_PROVIDER, SMTP_FROM, SMTP_FROM_NAME, SMTP_HOST, SMTP_PASSWORD,
    SMTP_PORT, SMTP_SSL, SMTP_USER, SUPPORT_INBOX, WHATSAPP_PROVIDER,
)
from ...constants import Channel

log = logging.getLogger("helpdesk.notifications")


class SendResult:
    def __init__(self, ok: bool, provider: str, error: str | None = None):
        self.ok = ok
        self.provider = provider
        self.error = error


class Provider(ABC):
    name: str = "abstract"

    @abstractmethod
    def send(self, recipient: str, subject: str, body: str) -> SendResult:
        ...

    def healthy(self) -> tuple[bool, str]:
        return True, "configured"


class LogProvider(Provider):
    """Default. Records what would have been sent without contacting anyone.

    This is a real, deliberate implementation -- not a stub pretending to
    deliver. Deliveries are persisted with status 'logged' so the UI can show
    exactly what the system intended to send.
    """
    name = "log"

    def __init__(self, channel: str):
        self.channel = channel
        self.name = f"log:{channel}"

    def send(self, recipient: str, subject: str, body: str) -> SendResult:
        log.info("[%s] -> %s | %s | %s", self.channel, recipient, subject, body[:200])
        return SendResult(True, self.name)

    def healthy(self) -> tuple[bool, str]:
        return True, "מצב יומן - הודעות נרשמות ואינן נשלחות"


class SmtpEmailProvider(Provider):
    name = "smtp"

    def _use_ssl(self) -> bool:
        """465 is TLS from the first byte, 587 upgrades with STARTTLS."""
        if SMTP_SSL in {"1", "true", "yes"}:
            return True
        if SMTP_SSL in {"0", "false", "no"}:
            return False
        return SMTP_PORT == 465

    def send(self, recipient: str, subject: str, body: str) -> SendResult:
        if not SMTP_HOST:
            return SendResult(False, self.name, "SMTP_HOST is not configured")
        try:
            message = EmailMessage()
            message["From"] = formataddr((str(Header(SMTP_FROM_NAME, "utf-8")), SMTP_FROM))
            message["To"] = recipient
            message["Subject"] = subject
            # A requester who hits reply should reach the desk. Without this the
            # reply goes to the sending mailbox, which nobody reads.
            if SUPPORT_INBOX and SUPPORT_INBOX != SMTP_FROM:
                message["Reply-To"] = SUPPORT_INBOX
            message.set_content(body)

            if self._use_ssl():
                with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
                    if SMTP_USER:
                        smtp.login(SMTP_USER, SMTP_PASSWORD)
                    smtp.send_message(message)
            else:
                with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
                    smtp.starttls()
                    if SMTP_USER:
                        smtp.login(SMTP_USER, SMTP_PASSWORD)
                    smtp.send_message(message)
            return SendResult(True, self.name)
        except Exception as exc:                      # noqa: BLE001 - reported, not raised
            return SendResult(False, self.name, str(exc))

    def healthy(self) -> tuple[bool, str]:
        if not SMTP_HOST:
            return False, "SMTP_HOST חסר"
        mode = "SSL" if self._use_ssl() else "STARTTLS"
        return True, f"SMTP {SMTP_HOST}:{SMTP_PORT} ({mode}) כ־{SMTP_FROM}"


_EMAIL = {"log": lambda: LogProvider(Channel.EMAIL), "smtp": SmtpEmailProvider}
_SMS = {"log": lambda: LogProvider(Channel.SMS)}
_WHATSAPP = {"log": lambda: LogProvider(Channel.WHATSAPP)}


def _resolve(table: dict, key: str, channel: str) -> Provider:
    factory = table.get(key)
    if factory is None:
        log.warning("unknown provider %r for %s, falling back to log", key, channel)
        return LogProvider(channel)
    return factory()


PROVIDERS: dict[str, Provider] = {
    Channel.EMAIL: _resolve(_EMAIL, EMAIL_PROVIDER, Channel.EMAIL),
    Channel.SMS: _resolve(_SMS, SMS_PROVIDER, Channel.SMS),
    Channel.WHATSAPP: _resolve(_WHATSAPP, WHATSAPP_PROVIDER, Channel.WHATSAPP),
}


def provider_for(channel: str) -> Provider:
    return PROVIDERS.get(channel, LogProvider(channel))
