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
import time
from abc import ABC, abstractmethod

import httpx
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


class GraphEmailProvider(Provider):
    """Sends through Microsoft Graph as a registered application.

    This exists because Microsoft disables SMTP AUTH tenant-wide by default, so
    a perfectly valid mailbox password is refused before it is even checked.
    Graph authenticates the application instead, using client credentials and
    the Mail.Send application permission, and is what Microsoft actually
    recommends for unattended sending.

    The sending mailbox is the From address: Mail.Send as an application can
    send as any mailbox in the tenant, so that permission should be narrowed to
    the service desk mailbox with an application access policy.
    """
    name = "graph"

    TOKEN_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
    SEND_URL = "https://graph.microsoft.com/v1.0/users/{sender}/sendMail"

    #: (tenant, client_id) -> (access_token, expires_at). A token lasts an hour;
    #: fetching one per notification would triple the work of sending.
    _tokens: dict[tuple[str, str], tuple[str, float]] = {}

    def __init__(self, cfg):
        self.cfg = cfg

    def _token(self) -> str:
        cfg = self.cfg
        key = (cfg.graph_tenant_id, cfg.graph_client_id)
        cached = self._tokens.get(key)
        if cached and cached[1] > time.time() + 60:
            return cached[0]

        response = httpx.post(
            self.TOKEN_URL.format(tenant=cfg.graph_tenant_id),
            data={
                "client_id": cfg.graph_client_id,
                "client_secret": cfg.graph_client_secret,
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials",
            },
            timeout=20,
        )
        if response.status_code != 200:
            raise RuntimeError(_graph_error(response))
        payload = response.json()
        token = payload["access_token"]
        self._tokens[key] = (token, time.time() + int(payload.get("expires_in", 3600)))
        return token

    def send(self, recipient: str, subject: str, body: str) -> SendResult:
        cfg = self.cfg
        if not cfg.graph_ready:
            return SendResult(False, self.name, "חסרים פרטי חיבור ל-Microsoft Graph")
        try:
            message = {
                "subject": subject,
                "body": {"contentType": "Text", "content": body},
                "toRecipients": [{"emailAddress": {"address": recipient}}],
            }
            if cfg.support_inbox and cfg.support_inbox != cfg.from_address:
                message["replyTo"] = [{"emailAddress": {"address": cfg.support_inbox}}]

            response = httpx.post(
                self.SEND_URL.format(sender=cfg.from_address),
                headers={"Authorization": f"Bearer {self._token()}"},
                json={"message": message, "saveToSentItems": True},
                timeout=30,
            )
            # sendMail answers 202 with an empty body on success.
            if response.status_code not in (200, 202):
                return SendResult(False, self.name, _graph_error(response))
            return SendResult(True, self.name)
        except Exception as exc:                      # noqa: BLE001 - reported, not raised
            return SendResult(False, self.name, str(exc))

    def healthy(self) -> tuple[bool, str]:
        cfg = self.cfg
        missing = [label for label, value in (
            ("מזהה דייר", cfg.graph_tenant_id),
            ("מזהה יישום", cfg.graph_client_id),
            ("סוד יישום", cfg.graph_client_secret),
            ("כתובת השולח", cfg.from_address),
        ) if not value]
        if missing:
            return False, "חסר: " + ", ".join(missing)
        return True, f"Microsoft Graph כ־{cfg.from_address}"


def _graph_error(response) -> str:
    """Microsoft's own wording, which is what makes a misconfiguration
    diagnosable -- a missing admin consent and a wrong secret look identical
    otherwise."""
    try:
        payload = response.json()
    except ValueError:
        return f"HTTP {response.status_code}: {response.text[:200]}"
    detail = (payload.get("error_description")
              or (payload.get("error") or {}).get("message")
              or payload.get("error")
              or response.text[:200])
    if isinstance(detail, dict):
        detail = detail.get("message", str(detail))
    return f"HTTP {response.status_code}: {str(detail)[:300]}"


def provider_for(channel: str, db=None) -> Provider:
    """Resolved per call, because mail configuration now lives in the database
    and an administrator can change it without a restart."""
    if channel == Channel.EMAIL:
        cfg = mail_settings.resolve(db)
        if cfg.provider == "graph":
            return GraphEmailProvider(cfg)
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
