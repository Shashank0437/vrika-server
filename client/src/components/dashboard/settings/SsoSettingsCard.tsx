"use client";

import { useEffect, useState } from "react";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { ApiError, api } from "@/lib/api";
import { SettingsBadge, SettingsCard, SettingsStatus } from "./SettingsCard";
import type { SsoSettingsIn, SsoSettingsOut } from "./types";

export function SsoSettingsCard({
  sso,
  onChange,
}: {
  sso: SsoSettingsOut | null;
  onChange: (next: SsoSettingsOut) => void;
}) {
  const [enabled, setEnabled] = useState(sso?.enabled ?? false);
  const [enforced, setEnforced] = useState(sso?.enforced ?? false);
  const [domain, setDomain] = useState(sso?.domain ?? "");
  const [idpEntityId, setIdpEntityId] = useState(sso?.idp_entity_id ?? "");
  const [idpSsoUrl, setIdpSsoUrl] = useState(sso?.idp_sso_url ?? "");
  const [idpCert, setIdpCert] = useState(sso?.idp_x509_cert ?? "");

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ message?: string; error?: string } | null>(null);

  useEffect(() => {
    if (!sso) return;
    setEnabled(sso.enabled ?? false);
    setEnforced(sso.enforced ?? false);
    setDomain(sso.domain ?? "");
    setIdpEntityId(sso.idp_entity_id ?? "");
    setIdpSsoUrl(sso.idp_sso_url ?? "");
    setIdpCert(sso.idp_x509_cert ?? "");
  }, [sso]);

  const copyToClipboard = (text: string, fieldId: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload: SsoSettingsIn = {
        enabled,
        enforced,
        domain: domain.trim(),
        idp_entity_id: idpEntityId.trim(),
        idp_sso_url: idpSsoUrl.trim(),
        idp_x509_cert: idpCert.trim(),
      };

      const updated = await api<SsoSettingsOut>("/org/settings/sso", {
        method: "PATCH",
        json: payload,
      });

      onChange(updated);
      setStatus({ message: "SAML SSO settings saved successfully" });
    } catch (err) {
      setStatus({
        error: err instanceof ApiError ? err.message : "Failed to save SSO settings",
      });
    } finally {
      setSaving(false);
    }
  };

  // Always derive SP URLs from the current browser origin — the backend api_base_url
  // may default to localhost:8000 which is wrong for the public-facing IdP config.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const spEntityId = `${origin}/be/auth/saml/metadata`;
  const spAcsUrl = `${origin}/be/auth/saml/acs`;
  const spMetadataUrl = `${origin}/be/auth/saml/metadata`;

  return (
    <SettingsCard
      icon="key"
      title="Single Sign-On (SAML 2.0)"
      description="Configure enterprise SAML 2.0 authentication for Okta, Azure AD (Entra ID), Auth0, Google Workspace, and OneLogin."
      badge={
        <SettingsBadge tone={enabled ? "active" : "muted"}>
          {enforced ? "Enforced" : enabled ? "Active" : "Disabled"}
        </SettingsBadge>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-4">
          <SettingsStatus message={status?.message} error={status?.error} />
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary shadow transition hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? (
              <span className="size-4 animate-spin rounded-full border-2 border-on-primary border-t-transparent" />
            ) : (
              <MaterialSymbol name="save" className="text-base" />
            )}
            Save SSO Configuration
          </button>
        </div>
      }
    >
      {/* Service Provider (SP) Information */}
      <div className="mb-6 rounded-xl border border-outline-variant bg-surface-container p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/60 pb-3">
          <div>
            <h3 className="text-sm font-bold text-on-surface">Service Provider (Vrika) Metadata</h3>
            <p className="text-xs text-on-surface-variant">
              Provide these endpoints to your Identity Provider (IdP) SAML application configuration.
            </p>
          </div>
          <a
            href={spMetadataUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-outline-variant bg-surface-container-high px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-surface-container-lowest"
          >
            <MaterialSymbol name="download" className="text-sm" />
            SP Metadata XML
          </a>
        </div>

        <div className="mt-3 space-y-3">
          {/* SP Entity ID */}
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant">
              SP Entity ID / Audience URI
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={spEntityId}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 font-mono text-xs text-on-surface outline-none"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(spEntityId, "entity_id")}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-high px-2.5 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-lowest"
              >
                <MaterialSymbol
                  name={copiedField === "entity_id" ? "check" : "content_copy"}
                  className="text-sm"
                />
                {copiedField === "entity_id" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* SP ACS URL */}
          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant">
              Assertion Consumer Service (ACS) URL / Single Sign-On URL
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={spAcsUrl}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-1.5 font-mono text-xs text-on-surface outline-none"
              />
              <button
                type="button"
                onClick={() => copyToClipboard(spAcsUrl, "acs_url")}
                className="flex shrink-0 items-center gap-1 rounded-lg border border-outline-variant bg-surface-container-high px-2.5 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-lowest"
              >
                <MaterialSymbol
                  name={copiedField === "acs_url" ? "check" : "content_copy"}
                  className="text-sm"
                />
                {copiedField === "acs_url" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Identity Provider Form */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-on-surface">Identity Provider (IdP) Details</h3>

        {/* Domain */}
        <div>
          <label className="block text-xs font-semibold text-on-surface">
            Corporate Email Domain <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. acme.com or company.corp"
            className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-[11px] text-on-surface-variant">
            Users signing in with an email matching this domain will be routed to your SAML IdP.
          </p>
        </div>

        {/* IdP SSO URL */}
        <div>
          <label className="block text-xs font-semibold text-on-surface">
            IdP Single Sign-On URL <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={idpSsoUrl}
            onChange={(e) => setIdpSsoUrl(e.target.value)}
            placeholder="https://login.microsoftonline.com/.../saml2 or https://dev-xxx.auth0.com/samlp/..."
            className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* IdP Entity ID */}
        <div>
          <label className="block text-xs font-semibold text-on-surface">
            IdP Entity ID / Issuer <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={idpEntityId}
            onChange={(e) => setIdpEntityId(e.target.value)}
            placeholder="urn:auth0:my-tenant or https://sts.windows.net/.../"
            className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 font-mono text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* IdP X.509 Certificate */}
        <div>
          <label className="block text-xs font-semibold text-on-surface">
            IdP X.509 Public Certificate <span className="text-error">*</span>
          </label>
          <textarea
            rows={5}
            value={idpCert}
            onChange={(e) => setIdpCert(e.target.value)}
            placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDpDCCAoygAwIBAgIGAY...&#10;-----END CERTIFICATE-----"
            className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface-container px-3.5 py-2.5 font-mono text-xs text-on-surface outline-none transition placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Toggles */}
        <div className="space-y-3 pt-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant bg-surface-container p-3 transition hover:bg-surface-container-high">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <div>
              <div className="text-xs font-bold text-on-surface">Enable SAML SSO</div>
              <div className="text-[11px] text-on-surface-variant">
                Allows organization members to log in using SAML Single Sign-On.
              </div>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-outline-variant bg-surface-container p-3 transition hover:bg-surface-container-high">
            <input
              type="checkbox"
              checked={enforced}
              onChange={(e) => setEnforced(e.target.checked)}
              disabled={!enabled}
              className="mt-0.5 size-4 accent-primary disabled:opacity-50"
            />
            <div>
              <div className="text-xs font-bold text-on-surface">Enforce SSO (Recommended for Enterprise)</div>
              <div className="text-[11px] text-on-surface-variant">
                Disables password login for users with matching domain, requiring SAML authentication.
              </div>
            </div>
          </label>
        </div>
      </div>
    </SettingsCard>
  );
}
