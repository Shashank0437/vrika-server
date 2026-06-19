"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { useAuth } from "@/lib/auth-context";

const inputCls =
  "mt-2 h-11 w-full rounded-lg border border-neutral-200 bg-white px-3.5 text-[15px] text-neutral-900 outline-none transition-[border,box-shadow] placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900";
const labelCls = "text-[13px] font-medium text-neutral-600";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard");
    }
  }, [loading, user, router]);

  if (loading || user) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface-container-low font-sans text-on-surface">
        <p className="text-on-surface-variant">Loading…</p>
      </main>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-white font-sans text-neutral-900 lg:flex-row">
      {/* Marketing panel - left side */}
      <div className="hidden w-full max-w-[520px] flex-col justify-between bg-surface-container-low p-10 lg:flex xl:max-w-[580px]">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
              <MaterialSymbol name="shield" className="text-lg" filled />
            </span>
            <span className="text-lg font-bold tracking-tight text-on-surface">Vrika</span>
            <span className="rounded bg-primary-container px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">Admin</span>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-on-surface">License Administration Portal</h2>
          <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
            Manage customer licenses, monitor activation status, and control feature access for the Vrika cybersecurity platform.
          </p>
        </div>
        <p className="text-xs text-on-surface-variant">© {new Date().getFullYear()} Vrika. Internal use only.</p>
      </div>

      {/* Form panel - right side */}
      <section className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-16 xl:px-20">
        <div className="mx-auto w-full max-w-[400px]">
          <header className="mb-8">
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">Admin Portal</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 sm:text-[1.75rem]">Sign in to continue</h1>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
              Access restricted to license administrators.
            </p>
          </header>

          {error && (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className={labelCls} htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="admin@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 h-12 w-full rounded-lg bg-neutral-900 text-[15px] font-semibold text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
