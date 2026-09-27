"use client";

import { useAuth } from "@/lib/auth-context";

export default function NoAccessPage() {
  const { logout } = useAuth();
  return (
    <section className="p-10">
      <h1 className="text-2xl font-semibold">No workspace access</h1>
      <p className="my-4">
        Ask an organization administrator to assign a role and scope to your
        account.
      </p>
      <button
        onClick={logout}
        className="rounded-lg bg-primary px-4 py-2 text-on-primary"
      >
        Sign out
      </button>
    </section>
  );
}
