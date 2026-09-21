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

from ...config import SMS_PROVIDER, WHATSAPP_PROVIDER
from ...constants import Channel
from .. import mail_settings

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
    """Configured per send, from the settings the administrator edited in the
    application, falling back to .env."""
    name = "smtp"

    def __init__(self, cfg):
        self.cfg = cfg

    def send(self, recipient: str, subject: str, body: str) -> SendResult:
        cfg = self.cfg
        if not cfg.host:
            return SendResult(False, self.name, "לא הוגדר שרת דואר יוצא")
        try:
            message = EmailMessage()
            message["From"] = formataddr(
                (str(Header(cfg.from_name, "utf-8")), cfg.from_address))
            message["To"] = recipient
            message["Subject"] = subject
            # A requester who hits reply should reach the desk. Without this the
            # reply goes to the sending mailbox, which nobody reads.
            if cfg.support_inbox and cfg.support_inbox != cfg.from_address:
                message["Reply-To"] = cfg.support_inbox
            message.set_content(body)

            if cfg.use_ssl:
                with smtplib.SMTP_SSL(cfg.host, cfg.port, timeout=20) as smtp:
                    if cfg.username:
                        smtp.login(cfg.username, cfg.password)
                    smtp.send_message(message)
            else:
                with smtplib.SMTP(cfg.host, cfg.port, timeout=20) as smtp:
                    smtp.starttls()
                    if cfg.username:
                        smtp.login(cfg.username, cfg.password)
                    smtp.send_message(message)
            return SendResult(True, self.name)
        except Exception as exc:                      # noqa: BLE001 - reported, not raised
            return SendResult(False, self.name, str(exc))

    def healthy(self) -> tuple[bool, str]:
        cfg = self.cfg
        if not cfg.host:
            return False, "לא הוגדר שרת דואר יוצא"
        if cfg.username and not cfg.password:
            return False, f"חסרה סיסמה עבור {cfg.username}"
        mode = "SSL" if cfg.use_ssl else "STARTTLS"
        return True, f"{cfg.host}:{cfg.port} ({mode}) כ־{cfg.from_address}"


def provider_for(channel: str, db=None) -> Provider:
    """Resolved per call, because mail configuration now lives in the database
    and an administrator can change it without a restart."""
    if channel == Channel.EMAIL:
        cfg = mail_settings.resolve(db)
        if cfg.provider == "smtp":
            return SmtpEmailProvider(cfg)
        if cfg.provider != "log":
            log.warning("unknown email provider %r, falling back to log", cfg.provider)
        return LogProvider(Channel.EMAIL)
    if channel == Channel.SMS and SMS_PROVIDER != "log":
        log.warning("unknown sms provider %r, falling back to log", SMS_PROVIDER)
    if channel == Channel.WHATSAPP and WHATSAPP_PROVIDER != "log":
        log.warning("unknown whatsapp provider %r, falling back to log", WHATSAPP_PROVIDER)
    return LogProvider(channel)
