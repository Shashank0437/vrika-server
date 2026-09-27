"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { getRoleBindings, hasPermission, type RoleBinding } from "@/lib/access";
import { listProjects, type Project } from "@/lib/projects";
import { RoleBindingsEditor, viewerBinding } from "./RoleBindingsEditor";
import { SessionDialog } from "./SessionDialog";

export type MemberRow = {
  id: string;
  email: string;
  username: string;
  roles: string[];
  role_bindings?: RoleBinding[];
  access_version?: number;
};

export function DashboardUsersManagement() {
  const { user, refreshUser } = useAuth();
  const canManage = hasPermission(user, "manage_roles");
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [target, setTarget] = useState<MemberRow | "invite" | null>(null);
  const [bindings, setBindings] = useState<RoleBinding[]>([]);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<MemberRow[]>("/tenant/members"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load members");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!canManage) return;
    listProjects()
      .then(setProjects)
      .catch((e) =>
        setProjectError(
          e instanceof Error ? e.message : "Could not load projects",
        ),
      );
  }, [canManage]);
  function open(member: MemberRow | "invite") {
    setTarget(member);
    setFormError(null);
    setMessage(null);
    setBindings(
      member === "invite" ? [{ ...viewerBinding }] : getRoleBindings(member),
    );
    setEmail("");
    setUsername("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !target || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      if (target === "invite") {
        await api("/tenant/invitations", {
          method: "POST",
          json: {
            email: email.trim(),
            username: username.trim(),
            role_bindings: bindings,
          },
        });
        setMessage(`Invitation sent to ${email.trim()}`);
      } else {
        await api(`/tenant/members/${encodeURIComponent(target.id)}/bindings`, {
          method: "PUT",
          json: {
            role_bindings: bindings,
            expected_version: target.access_version ?? 0,
          },
        });
        if (target.id === user?.id) await refreshUser();
        setMessage("Role bindings updated.");
      }
      setTarget(null);
      await load();
    } catch (e) {
      setFormError(
        e instanceof ApiError && e.status === 409
          ? "This member changed while you were editing. Close this dialog and reopen their latest bindings."
          : e instanceof Error
            ? e.message
            : "Could not save bindings",
      );
      if (e instanceof ApiError && e.status === 409) await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-5xl space-y-6 p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Organization members</h1>
        {canManage && (
          <button
            onClick={() => open("invite")}
            className="rounded-lg bg-primary px-4 py-2 text-on-primary"
          >
            Invite user
          </button>
        )}
      </header>
      {!canManage && (
        <p>
          Read-only member directory. Only organization administrators can
          assign roles.
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <div role="alert">
          {error} <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {loading && rows.length === 0 ? (
        <p role="status">Loading members…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="p-3">Username</th>
                <th>Email</th>
                <th>Role bindings</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-outline-variant">
                  <td className="p-3">
                    {row.username}
                    {row.id === user?.id ? " (You)" : ""}
                  </td>
                  <td>{row.email}</td>
                  <td className="p-3">
                    {getRoleBindings(row).map((binding, i) => (
                      <div key={i}>
                        {binding.role} · {binding.scope_type}:{" "}
                        {binding.scope_id === null
                          ? "organization"
                          : (projects.find((p) => p.id === binding.scope_id)
                              ?.name ?? binding.scope_id)}
                      </div>
                    ))}
                    {getRoleBindings(row).length === 0 && "No access"}
                  </td>
                  {canManage && (
                    <td>
                      <button
                        className="rounded border px-3 py-2"
                        aria-label={`Edit bindings for ${row.email}`}
                        onClick={() => open(row)}
                      >
                        Edit bindings
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && !error && <p>No members found.</p>}
        </div>
      )}
      {target && (
        <SessionDialog
          open
          onClose={() => {
            if (!busy) setTarget(null);
          }}
          labelledBy="bindings-title"
        >
          <form onSubmit={submit} className="space-y-5 overflow-y-auto p-6">
            <h2 id="bindings-title" className="text-xl font-semibold">
              {target === "invite"
                ? "Invite teammate"
                : `Edit bindings — ${target.email}`}
            </h2>
            {formError && (
              <p role="alert" className="text-error">
                {formError}
              </p>
            )}
            {projectError && (
              <p role="alert">Project list unavailable: {projectError}</p>
            )}
            <fieldset disabled={busy} className="space-y-4">
              {target === "invite" && (
                <>
                  <label className="block">
                    Email
                    <input
                      className="ml-3 rounded border p-2"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    Display name / username
                    <input
                      className="ml-3 rounded border p-2"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </label>
                </>
              )}
              <RoleBindingsEditor
                value={bindings}
                onChange={setBindings}
                projects={projects}
              />
              <p className="text-sm">
                Project membership alone does not grant access. Role bindings
                can only be assigned by an organization administrator.
              </p>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setTarget(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-primary px-4 py-2 text-on-primary"
                >
                  {busy
                    ? "Saving…"
                    : target === "invite"
                      ? "Send invite"
                      : "Save bindings"}
                </button>
              </div>
            </fieldset>
          </form>
        </SessionDialog>
      )}
    </section>
  );
}
