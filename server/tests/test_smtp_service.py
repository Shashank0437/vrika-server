import smtplib
import socketserver
import threading
import time
from email import message_from_string
from unittest.mock import MagicMock, call

import pytest

from app.config import Settings
from app.services import smtp_service


def mail_args(**extra):
    return {
        "host": "smtp.example.test", "port": 2525, "username": "", "password": "",
        "security": "none", "from_addr": "sender@example.test",
        "to_addrs": ["recipient@example.test"], "cc_addrs": None, "bcc_addrs": None,
        "subject": "Test", "body_plain": "Synthetic SMTP regression", **extra,
    }


@pytest.mark.parametrize("security,port,constructor", [
    ("none", 2525, "SMTP"), ("starttls", 587, "SMTP"), ("ssl", 465, "SMTP_SSL"),
])
def test_pdf_transmission_uses_separate_timeout(monkeypatch, security, port, constructor):
    factory = MagicMock()
    server = factory.return_value.__enter__.return_value
    server.sendmail.return_value = {}
    monkeypatch.setattr(smtp_service.smtplib, constructor, factory)
    result = smtp_service._send_mail_sync(**mail_args(
        security=security, port=port, send_timeout_seconds=300,
        attachments=[{"filename": "report.pdf", "content": b"%PDF-test"}],
    ))
    assert factory.call_args.kwargs["timeout"] == 60
    assert server.sock.settimeout.call_args_list == [call(300), call(60)]
    timeout_index = server.mock_calls.index(call.sock.settimeout(300))
    send_index = next(i for i, event in enumerate(server.mock_calls) if event[0] == "sendmail")
    assert timeout_index < send_index
    message = message_from_string(server.sendmail.call_args.args[2])
    assert message["Message-ID"] == result["message_id"]
    assert message["Date"]
    assert result["status"] == "sent"


def test_partial_recipient_refusal_is_not_reported_as_sent(monkeypatch):
    factory = MagicMock()
    server = factory.return_value.__enter__.return_value
    server.sendmail.return_value = {"blocked@example.test": (550, b"Rejected")}
    monkeypatch.setattr(smtp_service.smtplib, "SMTP", factory)
    with pytest.raises(smtplib.SMTPRecipientsRefused):
        smtp_service._send_mail_sync(**mail_args(cc_addrs=["blocked@example.test"]))


def test_missing_smtp_socket_fails_explicitly(monkeypatch):
    factory = MagicMock()
    server = factory.return_value.__enter__.return_value
    server.sock = None
    monkeypatch.setattr(smtp_service.smtplib, "SMTP", factory)
    with pytest.raises(smtplib.SMTPServerDisconnected, match="before transmission"):
        smtp_service._send_mail_sync(**mail_args())
    server.sendmail.assert_not_called()


def test_timeout_configuration_has_a_finite_budget():
    assert Settings(_env_file=None).smtp_send_timeout_seconds == 300
    for timeout in (0, -1, 901, float("inf")):
        with pytest.raises(ValueError):
            Settings(_env_file=None, smtp_send_timeout_seconds=timeout)


@pytest.mark.parametrize("timeout,succeeds", [(0.05, False), (1.0, True)])
def test_real_smtp_wire_honors_message_timeout(timeout, succeeds):
    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            self.wfile.write(b"220 localhost test relay\r\n")
            while command := self.rfile.readline():
                if command.upper().startswith(b"DATA"):
                    self.wfile.write(b"354 Continue\r\n")
                    while line := self.rfile.readline():
                        if line == b".\r\n":
                            break
                    time.sleep(0.15)
                    try:
                        self.wfile.write(b"250 Message accepted\r\n")
                    except BrokenPipeError:
                        return
                elif command.upper().startswith(b"QUIT"):
                    self.wfile.write(b"221 Closing\r\n")
                    return
                else:
                    self.wfile.write(b"250 OK\r\n")

    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), Handler) as relay:
        thread = threading.Thread(target=relay.serve_forever)
        thread.start()
        try:
            args = mail_args(
                host="127.0.0.1", port=relay.server_address[1],
                send_timeout_seconds=timeout,
            )
            if succeeds:
                assert smtp_service._send_mail_sync(**args)["status"] == "sent"
            else:
                with pytest.raises(smtplib.SMTPServerDisconnected):
                    smtp_service._send_mail_sync(**args)
        finally:
            relay.shutdown()
            thread.join()
