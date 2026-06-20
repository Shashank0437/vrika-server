"use client";

import { useEffect, useState, useMemo } from "react";
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
    license_type: "enterprise",
    features: [],
    allowed_tools: [],
    expires_at: "",
    machine_fingerprint: "",
  });

  const [toolSearch, setToolSearch] = useState("");
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  const [availableTools, setAvailableTools] = useState<{ name: string; description: string; category: string; active: boolean }[]>([]);
  const [loadingTools, setLoadingTools] = useState(true);

  useEffect(() => {
    customersApi
      .list()
      .then(setCustomers)
      .finally(() => setLoadingCustomers(false));
    licensesApi
      .availableTools()
      .then(setAvailableTools)
      .catch(() => setAvailableTools([]))
      .finally(() => setLoadingTools(false));
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

  const filteredAvailableTools = useMemo(() => {
    const q = toolSearch.toLowerCase();
    return availableTools.filter(
      (t) =>
        !form.allowed_tools.includes(t.name) &&
        (t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q))
    );
  }, [availableTools, form.allowed_tools, toolSearch]);

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
            {generated.allowed_tools.length > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Tools</span>
                <span className="font-medium text-on-surface">{generated.allowed_tools.length} tools licensed</span>
              </div>
            )}
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

        {/* License Type */}
        <div>
          <label className={labelCls}>License Type</label>
          <select
            value={form.license_type}
            onChange={(e) => setForm({ ...form, license_type: e.target.value as LicenseGenerate["license_type"] })}
            className={inputCls}
          >
            <option value="free_trial">Free Trial</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        {/* Allowed Tools */}
        <div>
          <label className={labelCls}>Allowed Tools</label>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            Select which tools the customer can use. Leave empty to allow all tools.
          </p>

          {/* Selected tools chips */}
          {form.allowed_tools.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {form.allowed_tools.map((tool) => (
                <span
                  key={tool}
                  className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-container px-3 py-1 text-xs font-medium text-on-primary-container"
                >
                  <MaterialSymbol name="construction" className="text-sm" />
                  {tool}
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, allowed_tools: f.allowed_tools.filter((t) => t !== tool) }))
                    }
                    className="ml-0.5 text-on-primary-container/60 transition hover:text-error"
                  >
                    <MaterialSymbol name="close" className="text-sm" />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, allowed_tools: [] }))}
                className="rounded-full px-2 py-1 text-xs text-on-surface-variant transition hover:text-error"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Searchable dropdown */}
          <div className="relative mt-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <MaterialSymbol name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-base text-on-surface-variant" />
                <input
                  type="text"
                  value={toolSearch}
                  onChange={(e) => {
                    setToolSearch(e.target.value);
                    setToolDropdownOpen(true);
                  }}
                  onFocus={() => setToolDropdownOpen(true)}
                  className={`${inputCls} pl-9`}
                  placeholder="Search tools by name, category..."
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  // Select all filtered tools
                  const newTools = filteredAvailableTools.map((t) => t.name);
                  setForm((f) => ({ ...f, allowed_tools: [...new Set([...f.allowed_tools, ...newTools])] }));
                  setToolDropdownOpen(false);
                }}
                className="shrink-0 rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-xs font-medium text-on-surface-variant transition hover:border-primary hover:text-on-surface"
                title="Select all visible tools"
              >
                Select All
              </button>
            </div>

            {toolDropdownOpen && (
              <>
                {/* Backdrop to close dropdown */}
                <div className="fixed inset-0 z-10" onClick={() => setToolDropdownOpen(false)} />
                <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lg">
                  {loadingTools ? (
                    <div className="flex items-center gap-2 px-4 py-3 text-sm text-on-surface-variant">
                      <LoaderSvg className="size-4" /> Loading tools…
                    </div>
                  ) : filteredAvailableTools.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-on-surface-variant">
                      {availableTools.length === 0
                        ? "No tools available (agent may be unreachable)"
                        : "No matching tools found"}
                    </div>
                  ) : (
                    filteredAvailableTools.map((tool) => (
                      <button
                        key={tool.name}
                        type="button"
                        onClick={() => {
                          setForm((f) => ({ ...f, allowed_tools: [...f.allowed_tools, tool.name] }));
                          setToolSearch("");
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-container"
                      >
                        <MaterialSymbol
                          name={tool.active ? "check_circle" : "cancel"}
                          className={`shrink-0 text-lg ${tool.active ? "text-tertiary" : "text-on-surface-variant/50"}`}
                          filled
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-on-surface">{tool.name}</span>
                            <span className="rounded-full bg-primary-container px-2 py-0.5 text-[10px] font-bold uppercase text-on-primary-container">
                              {tool.category}
                            </span>
                          </div>
                          {tool.description && (
                            <p className="mt-0.5 truncate text-xs text-on-surface-variant">{tool.description}</p>
                          )}
                        </div>
                        <MaterialSymbol name="add" className="shrink-0 text-base text-on-surface-variant" />
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {form.allowed_tools.length === 0 && (
            <p className="mt-2 flex items-center gap-1 text-xs text-tertiary">
              <MaterialSymbol name="info" className="text-sm" />
              No tools specified — all tools will be allowed
            </p>
          )}
          {form.allowed_tools.length > 0 && (
            <p className="mt-2 text-xs text-on-surface-variant">
              {form.allowed_tools.length} tool{form.allowed_tools.length === 1 ? "" : "s"} selected
            </p>
          )}
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
