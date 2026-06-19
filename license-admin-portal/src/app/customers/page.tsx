"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { LoaderSvg } from "@/components/ui/LoaderSvg";
import { customersApi, type Customer, type CustomerCreate } from "@/api/customers";

const inputCls =
  "mt-1 h-10 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface outline-none transition focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant";
const labelCls = "text-xs font-medium text-on-surface-variant";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CustomerCreate>({ name: "", email: "", organization: "" });

  const fetchCustomers = () => {
    setLoading(true);
    customersApi
      .list()
      .then(setCustomers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await customersApi.create(form);
      setForm({ name: "", email: "", organization: "" });
      setShowCreate(false);
      fetchCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create customer");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoaderSvg className="size-10" label="Loading customers" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Customers</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{customers.length} total customers</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm transition hover:opacity-90 active:scale-[0.99]"
        >
          <MaterialSymbol name="add" className="text-base" filled />
          Add Customer
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
      )}

      {/* Create form */}
      {showCreate && (
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <h3 className="mb-4 text-sm font-semibold text-on-surface">New Customer</h3>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelCls}>Name</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputCls}
                placeholder="Customer name"
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputCls}
                placeholder="contact@company.com"
              />
            </div>
            <div>
              <label className={labelCls}>Organization</label>
              <input
                type="text"
                required
                value={form.organization}
                onChange={(e) => setForm({ ...form, organization: e.target.value })}
                className={inputCls}
                placeholder="Company Inc."
              />
            </div>
            <div className="flex items-end gap-2 sm:col-span-3">
              <button
                type="submit"
                disabled={creating}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Customer"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-outline-variant px-4 py-2 text-sm font-medium text-on-surface-variant transition hover:bg-surface-container"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customers table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container">
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Name</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Email</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Organization</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Created</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Licenses</th>
              <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-on-surface-variant">
                  No customers yet. Add your first customer above.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-surface-container">
                  <td className="px-5 py-3 font-medium text-on-surface">{c.name}</td>
                  <td className="px-5 py-3 text-on-surface-variant">{c.email}</td>
                  <td className="px-5 py-3 text-on-surface-variant">{c.organization}</td>
                  <td className="px-5 py-3 text-on-surface-variant">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-container px-2 text-xs font-bold text-primary">
                      {c.licenses_count}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/licenses/generate?customer=${c.id}`}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary transition hover:opacity-90"
                      >
                        Create License
                      </Link>
                      <Link
                        href={`/licenses/manage?customer=${c.id}`}
                        className="rounded-md border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-surface-container"
                      >
                        View Licenses
                      </Link>
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
