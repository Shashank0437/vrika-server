"use client";

import { useEffect, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { ApiError, api } from "@/lib/api";
import { SettingsBadge, SettingsCard, SettingsStatus } from "./SettingsCard";
import type { SmtpSettingsIn, SmtpSettingsOut, TestSmtpIn } from "./types";

export function SmtpSettingsCard({
  smtp,
  onChange,
}: {
  smtp: SmtpSettingsOut | null;
  onChange: (next: SmtpSettingsOut) => void;
}) {
  const [host, setHost] = useState(smtp?.host ?? "");
  const [port, setPort] = useState(smtp?.port ?? 587);
  const [username, setUsername] = useState(smtp?.username ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [security, setSecurity] = useState<"starttls" | "ssl" | "none">(
    smtp?.security ?? "starttls"
  );
  const [fromEmail, setFromEmail] = useState(smtp?.from_email ?? "");
  const [fromName, setFromName] = useState(smtp?.from_name ?? "Vrika Security");
  const [enabled, setEnabled] = useState(smtp?.enabled ?? true);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ message?: string; error?: string } | null>(null);

  // Test tool state
  const [testRecipient, setTestRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<{ message?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!smtp) return;
    setHost(smtp.host ?? "");
    setPort(smtp.port ?? 587);
    setUsername(smtp.username ?? "");
    setSecurity(smtp.security ?? "starttls");
    setFromEmail(smtp.from_email ?? "");
    setFromName(smtp.from_name ?? "Vrika Security");
    setEnabled(smtp.enabled ?? true);
  }, [smtp]);

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload: SmtpSettingsIn = {
        host: host.trim(),
        port: Number(port) || 587,
        username: username.trim(),
        password: password.trim(),
        security,
        from_email: fromEmail.trim() || null,
        from_name: fromName.trim() || "Vrika Security",
        enabled,
      };

      const updated = await api<SmtpSettingsOut>("/org/settings/smtp", {
        method: "PATCH",
        json: payload,
      });

      onChange(updated);
      setPassword(""); // Clear plain text password from state after save
      setStatus({ message: "SMTP configuration saved successfully" });
    } catch (err) {
      setStatus({
        error: err instanceof ApiError ? err.message : "Failed to save SMTP settings",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!testRecipient.trim()) {
      setTestStatus({ error: "Please enter a test recipient email address." });
      return;
    }
    setTesting(true);
    setTestStatus(null);
    try {
      // First auto-save any unsaved changes if fields are filled
      if (host.trim()) {
        const payload: SmtpSettingsIn = {
          host: host.trim(),
          port: Number(port) || 587,
          username: username.trim(),
          password: password.trim(),
          security,
          from_email: fromEmail.trim() || null,
          from_name: fromName.trim() || "Vrika Security",
          enabled,
        };
        const updated = await api<SmtpSettingsOut>("/org/settings/smtp", {
          method: "PATCH",
          json: payload,
        });
        onChange(updated);
        setPassword("");
      }

      const testPayload: TestSmtpIn = {
        test_recipient: testRecipient.trim().toLowerCase(),
      };

      await api<{ status: string; detail: unknown }>("/org/settings/smtp/test", {
        method: "POST",
        json: testPayload,
      });

      setTestStatus({
        message: `✅ Test email successfully delivered to ${testRecipient.trim()}`,
      });
    } catch (err) {
      setTestStatus({
        error: err instanceof ApiError ? err.message : "SMTP connection test failed",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <SettingsCard
      icon="mail"
      title="Outbound SMTP Email Server"
      description="Configure your organization's custom SMTP mail server for sending user invitations, cloud security scan alerts, and attack graph summaries."
      badge={
        <SettingsBadge tone={enabled && host ? "active" : "muted"}>
          {enabled && host ? "Active" : "Disabled"}
        </SettingsBadge>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SettingsStatus message={status?.message} error={status?.error} />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !host.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? (
              <span className="size-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent" />
            ) : (
              <MaterialSymbol name="save" className="text-base" />
            )}
            Save SMTP Settings
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Connection Settings */}
        <div>
          <h3 className="text-sm font-bold text-on-surface">Server Connection</h3>
          <p className="text-xs text-on-surface-variant">
            Specify your SMTP gateway (Google Workspace, Microsoft 365, Mailgun, SendGrid, Amazon SES, or custom relay).
          </p>

          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-on-surface">
                SMTP Host <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="e.g. smtp.gmail.com or smtp.mailgun.org"
                className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface">
                Port <span className="text-error">*</span>
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => {
                  const p = Number(e.target.value);
                  setPort(p);
                  if (p === 465) setSecurity("ssl");
                  else if (p === 587) setSecurity("starttls");
                }}
                placeholder="587"
                className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-semibold text-on-surface">
              Security Protocol
            </label>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-on-surface">
                <input
                  type="radio"
                  name="smtp_sec"
                  value="starttls"
                  checked={security === "starttls"}
                  onChange={() => setSecurity("starttls")}
                  className="accent-primary"
                />
                STARTTLS (Port 587 - Recommended)
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-on-surface">
                <input
                  type="radio"
                  name="smtp_sec"
                  value="ssl"
                  checked={security === "ssl"}
                  onChange={() => setSecurity("ssl")}
                  className="accent-primary"
                />
                SSL / TLS (Port 465)
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-on-surface">
                <input
                  type="radio"
                  name="smtp_sec"
                  value="none"
                  checked={security === "none"}
                  onChange={() => setSecurity("none")}
                  className="accent-primary"
                />
                None (Insecure / Internal Relay)
              </label>
            </div>
          </div>
        </div>

        {/* Authentication */}
        <div className="border-t border-outline-variant/60 pt-5">
          <h3 className="text-sm font-bold text-on-surface">Authentication</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-on-surface">
                SMTP Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. user@domain.com or api"
                className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface">
                SMTP Password / App Secret
              </label>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={smtp?.has_password ? "••••••••••••  (Stored Encrypted)" : "Enter password"}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2 pr-10 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                >
                  <MaterialSymbol
                    name={showPassword ? "visibility_off" : "visibility"}
                    className="text-lg"
                  />
                </button>
              </div>
              {smtp?.has_password && !password && (
                <p className="mt-1 text-[11px] text-primary">
                  Stored securely with AES-256 / Fernet encryption. Leave blank to keep current password.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Sender Identity */}
        <div className="border-t border-outline-variant/60 pt-5">
          <h3 className="text-sm font-bold text-on-surface">Sender Identity</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-on-surface">
                From Email Address
              </label>
              <input
                type="email"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="e.g. security@company.com"
                className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface">
                From Display Name
              </label>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="e.g. Acme Corp Security"
                className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>

        {/* Status Toggle */}
        <div className="border-t border-outline-variant/60 pt-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant bg-surface-container p-3 transition hover:bg-surface-container-high">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <div>
              <div className="text-xs font-bold text-on-surface">Enable Custom Organization SMTP</div>
              <div className="text-[11px] text-on-surface-variant">
                When enabled, all invitations and security scan completion reports for this workspace will be delivered through this server.
              </div>
            </div>
          </label>
        </div>

        {/* Live Test Tool */}
        <div className="rounded-xl border border-primary/30 bg-surface-container-low p-4">
          <div className="flex items-center gap-2">
            <MaterialSymbol name="send" className="text-primary text-base" />
            <h4 className="text-xs font-bold text-on-surface">Test SMTP Connection &amp; Delivery</h4>
          </div>
          <p className="mt-1 text-[11px] text-on-surface-variant">
            Send an instant test email through this server to confirm credentials and network reachability.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="recipient@company.com"
              className="min-w-[240px] flex-1 rounded-lg border border-outline-variant bg-surface-container px-3 py-1.5 text-xs text-on-surface outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !testRecipient.trim() || !host.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-surface-container-highest px-3.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-surface-container-lowest active:scale-95 disabled:opacity-50"
            >
              {testing ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <MaterialSymbol name="mark_email_read" className="text-sm" />
              )}
              Send Test Email
            </button>
          </div>

          {testStatus && (
            <div className="mt-3">
              <SettingsStatus message={testStatus.message} error={testStatus.error} />
            </div>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}
