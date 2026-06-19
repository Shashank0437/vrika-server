"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { LoaderSvg } from "@/components/ui/LoaderSvg";
import { customersApi, type Customer } from "@/api/customers";
import { licensesApi, type License, type LicenseFeature, type LicenseGenerate } from "@/api/licenses";

const inputCls =
  "mt-1 h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant";
const labelCls = "text-xs font-medium text-on-surface-variant";

const FEATURES: { key: LicenseFeature; label: string; icon: string }[] = [
  { key: "ai_agent", label: "AI Agent", icon: "smart_toy" },
  { key: "network_scanner", label: "Network Scanner", icon: "radar" },
  { key: "malware_analysis", label: "Malware Analysis", icon: "bug_report" },
  { key: "forensics", label: "Forensics", icon: "search" },
];

export default function LicenseGeneratePage() {
  const searchParams = useSearchParams();
  const preselectedCustomer = searchParams.get("customer") || "";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<License | null>(null);

  const [form, setForm] = useState<LicenseGenerate>({
    customer_id: preselectedCustomer,
    product: "vrika",
    features: [],
    max_users: 10,
    max_agents: 5,
    expires_at: "",
    machine_fingerprint: "",
  });

  useEffect(() => {
    customersApi
      .list()
      .then(setCustomers)
      .finally(() => setLoadingCustomers(false));
  }, []);

  useEffect(() => {
    if (preselectedCustomer) {
      setForm((f) => ({ ...f, customer_id: preselectedCustomer }));
    }
  }, [preselectedCustomer]);

  const toggleFeature = (feature: LicenseFeature) => {
    setForm((f) => ({
      ...f,
      features: f.features.includes(feature)
        ? f.features.filter((ff) => ff !== feature)
        : [...f.features, feature],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const license = await licensesApi.generate(form);
      setGenerated(license);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate license");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (format: "json" | "key" = "json") => {
    if (!generated) return;
    try {
      const blob = await licensesApi.download(generated.id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "key" ? "key" : "json";
      a.download = `vrika-license-${generated.id}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  if (generated) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-tertiary-container">
            <MaterialSymbol name="check_circle" className="text-4xl text-on-tertiary-container" filled />
          </div>
          <h2 className="mt-5 text-xl font-bold text-on-surface">License Generated</h2>
          <p className="mt-2 text-sm text-on-surface-variant">The license has been created successfully.</p>

          <div className="mt-6 space-y-3 rounded-lg bg-surface-container p-4 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">License ID</span>
              <span className="font-mono text-xs font-medium text-on-surface">{generated.id}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Status</span>
              <span className="rounded bg-tertiary-container px-2 py-0.5 text-xs font-bold text-on-tertiary-container">{generated.status}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Expires</span>
              <span className="font-medium text-on-surface">{new Date(generated.expires_at).toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-on-surface-variant">Features</span>
              <span className="font-medium text-on-surface">{generated.features.join(", ")}</span>
            </div>
          </div>

          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={() => handleDownload("json")}
              className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              <MaterialSymbol name="download" className="text-base" filled />
              Download .json
            </button>
            <button
              onClick={() => handleDownload("key")}
              className="flex items-center gap-2 rounded-lg border border-primary px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10"
            >
              <MaterialSymbol name="key" className="text-base" filled />
              Download .key
            </button>
            <button
              onClick={() => setGenerated(null)}
              className="rounded-lg border border-outline-variant px-5 py-2.5 text-sm font-medium text-on-surface-variant transition hover:bg-surface-container"
            >
              Generate Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-on-surface">Generate License</h2>
        <p className="mt-1 text-sm text-on-surface-variant">Create a new license for a customer</p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6">
        {/* Customer selection */}
        <div>
          <label className={labelCls}>Customer</label>
          {loadingCustomers ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-on-surface-variant">
              <LoaderSvg className="size-4" /> Loading customers…
            </div>
          ) : (
            <select
              required
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
              className={inputCls}
            >
              <option value="">Select a customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name} — {c.organization}</option>
              ))}
            </select>
          )}
        </div>

        {/* Product */}
        <div>
          <label className={labelCls}>Product</label>
          <select
            value={form.product}
            onChange={(e) => setForm({ ...form, product: e.target.value })}
            className={inputCls}
          >
            <option value="vrika">Vrika</option>
            <option value="vrika_enterprise">Vrika Enterprise</option>
          </select>
        </div>

        {/* Features */}
        <div>
          <label className={labelCls}>Features</label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {FEATURES.map((f) => {
              const active = form.features.includes(f.key);
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => toggleFeature(f.key)}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition ${
                    active
                      ? "border-primary bg-primary-container text-on-primary-container"
                      : "border-outline-variant bg-surface-container text-on-surface-variant hover:border-primary"
                  }`}
                >
                  <MaterialSymbol name={f.icon} className="text-lg" filled />
                  <span className="font-medium">{f.label}</span>
                  {active && <MaterialSymbol name="check" className="ml-auto text-base text-primary" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Limits */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Maximum Users</label>
            <input
              type="number"
              min={1}
              required
              value={form.max_users}
              onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) || 1 })}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Maximum Agents</label>
            <input
              type="number"
              min={1}
              required
              value={form.max_agents}
              onChange={(e) => setForm({ ...form, max_agents: parseInt(e.target.value) || 1 })}
              className={inputCls}
            />
          </div>
        </div>

        {/* Expiry */}
        <div>
          <label className={labelCls}>Expiry Date</label>
          <input
            type="date"
            required
            value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            className={inputCls}
            min={new Date().toISOString().split("T")[0]}
          />
        </div>

        {/* Fingerprint — upload machine-info.json */}
        <div>
          <label className={labelCls}>Machine Fingerprint</label>
          <div className="mt-1 space-y-3">
            {/* Upload button */}
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-outline-variant bg-surface-container px-4 py-2.5 text-sm font-medium text-on-surface-variant transition hover:border-primary hover:text-on-surface">
                <MaterialSymbol name="upload_file" className="text-lg" filled />
                Upload machine-info.json
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      const machineInfo = JSON.parse(text);
                      setError(null);
                      // Call backend to hash
                      const { fingerprint } = await licensesApi.hashMachineInfo(machineInfo);
                      setForm((f) => ({ ...f, machine_fingerprint: fingerprint }));
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed to process machine-info.json");
                    }
                    e.target.value = "";
                  }}
                />
              </label>
              {form.machine_fingerprint && (
                <span className="flex items-center gap-1 text-xs text-tertiary">
                  <MaterialSymbol name="check_circle" className="text-sm" filled />
                  Fingerprint generated
                </span>
              )}
            </div>
            {/* Display fingerprint hash */}
            <input
              type="text"
              required
              readOnly
              value={form.machine_fingerprint}
              className={`${inputCls} bg-surface-container font-mono text-xs`}
              placeholder="SHA256 fingerprint will appear here after upload"
            />
            <p className="text-xs text-on-surface-variant">
              Upload the machine-info.json file collected from the customer&apos;s server
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || form.features.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-sm font-bold text-on-primary shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <LoaderSvg className="size-4" /> Generating…
            </>
          ) : (
            <>
              <MaterialSymbol name="license" className="text-base" filled />
              Generate License
            </>
          )}
        </button>
      </form>
    </div>
  );
}
