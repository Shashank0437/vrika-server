"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { LoaderSvg } from "@/components/ui/LoaderSvg";
import { licensesApi, type License } from "@/api/licenses";

function StatusBadge({ status }: { status: License["status"] }) {
  const styles: Record<string, string> = {
    active: "bg-tertiary-container text-on-tertiary-container",
    expired: "bg-surface-variant text-on-surface-variant",
    revoked: "bg-red-50 text-red-800",
    suspended: "bg-amber-50 text-amber-800",
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function LicenseManagePage() {
  const searchParams = useSearchParams();
  const customerFilter = searchParams.get("customer") || "";

  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchLicenses = () => {
    setLoading(true);
    const promise = customerFilter
      ? licensesApi.listByCustomer(customerFilter)
      : licensesApi.list();
    promise
      .then(setLicenses)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchLicenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerFilter]);

  const handleRevoke = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this license? This action cannot be undone.")) return;
    setRevoking(id);
    try {
      await licensesApi.revoke(id);
      fetchLicenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke license");
    } finally {
      setRevoking(null);
    }
  };

  const handleDownload = async (id: string, format: "json" | "key" = "json") => {
    try {
      const blob = await licensesApi.download(id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "key" ? "key" : "json";
      a.download = `vrika-license-${id}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoaderSvg className="size-10" label="Loading licenses" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-on-surface">License Management</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {licenses.length} license{licenses.length !== 1 && "s"}
            {customerFilter && " for this customer"}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container">
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">License ID</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Customer</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Fingerprint</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Features</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Expiry</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Status</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {licenses.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-on-surface-variant">
                  No licenses found.
                </td>
              </tr>
            ) : (
              licenses.map((lic) => (
                <tr key={lic.id} className="transition-colors hover:bg-surface-container">
                  <td className="px-4 py-3 font-mono text-xs text-on-surface">{lic.id.slice(0, 12)}…</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-on-surface">{lic.customer_name}</p>
                    <p className="text-xs text-on-surface-variant">{lic.customer_email}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-on-surface-variant">
                    {lic.machine_fingerprint.slice(0, 16)}…
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {lic.features.map((f) => (
                        <span key={f} className="rounded bg-primary-container px-1.5 py-0.5 text-[10px] font-medium text-primary capitalize">
                          {f.replace(/_/g, " ")}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">{new Date(lic.expires_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3"><StatusBadge status={lic.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDownload(lic.id, "json")}
                        className="rounded p-1.5 text-on-surface-variant transition hover:bg-surface-container hover:text-primary"
                        title="Download .json"
                      >
                        <MaterialSymbol name="download" className="text-lg" />
                      </button>
                      <button
                        onClick={() => handleDownload(lic.id, "key")}
                        className="rounded p-1.5 text-on-surface-variant transition hover:bg-surface-container hover:text-primary"
                        title="Download .key"
                      >
                        <MaterialSymbol name="key" className="text-lg" />
                      </button>
                      {lic.status === "active" && (
                        <button
                          onClick={() => handleRevoke(lic.id)}
                          disabled={revoking === lic.id}
                          className="rounded p-1.5 text-on-surface-variant transition hover:bg-red-50 hover:text-error disabled:opacity-50"
                          title="Revoke"
                        >
                          <MaterialSymbol name="block" className="text-lg" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
