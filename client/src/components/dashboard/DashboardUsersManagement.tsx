"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Search, ShieldCheck, SlidersHorizontal, UserPlus } from "lucide-react";
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
  const [query, setQuery] = useState("");
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
    if (
      bindings.some(
        (binding) => binding.scope_type === "project" && !binding.scope_id,
      )
    ) {
      setFormError(
        "Select a project for each project-scoped binding before saving.",
      );
      return;
    }
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
    <section className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Workspace / Access
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Organization members
          </h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            The right access for every person on your team.
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => open("invite")}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-sm transition hover:opacity-90"
          >
            <UserPlus className="size-4" />
            Invite user
          </button>
        )}
      </header>
      {!canManage && (
        <p className="rounded-xl border border-outline-variant/70 bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
          Read-only member directory. Only organization administrators can
          assign roles.
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-primary/20 bg-primary/8 p-4 text-sm text-primary"
        >
          {message}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-error/8 p-4 text-sm text-error"
        >
          {error} <button onClick={() => void load()}>Retry</button>
        </div>
      )}
      {loading && rows.length === 0 ? (
        <p role="status">Loading members…</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/60 px-5 py-4">
            <span className="text-sm font-semibold">
              Team directory{" "}
              <span className="ml-2 rounded-md bg-primary/8 px-2 py-0.5 text-xs text-primary">
                {rows.length}
              </span>
            </span>
            <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-outline-variant/70 bg-surface px-3 sm:w-64">
              <Search className="size-4 text-on-surface-variant" />
              <input
                aria-label="Search members"
                placeholder="Search name or email…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-surface-container-low/50 text-xs text-on-surface-variant">
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Access</th>
                  {canManage && (
                    <th className="px-5 py-3 text-right font-medium">Manage</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter((row) =>
                    `${row.username} ${row.email}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-outline-variant/60 transition hover:bg-primary/[0.025]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/8 text-xs font-bold text-primary">
                            {(row.username || row.email)
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <div>
                            <p className="font-semibold">
                              {row.username}
                              {row.id === user?.id && (
                                <span className="ml-2 rounded bg-surface-container px-1.5 py-0.5 text-[10px] font-medium text-on-surface-variant">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="mt-1 text-xs text-on-surface-variant">
                              {row.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex max-w-md flex-wrap gap-2">
                          {getRoleBindings(row).map((binding, i) => (
                            <div
                              key={i}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-outline-variant/70 bg-surface px-2.5 py-1.5 text-xs"
                            >
                              <ShieldCheck className="size-3.5 text-primary" />
                              <span className="font-semibold capitalize">
                                {binding.role === "lead"
                                  ? "Project lead"
                                  : binding.role}
                              </span>
                              <span className="text-on-surface-variant">
                                /{" "}
                                {binding.scope_id === null
                                  ? "Organization"
                                  : binding.scope_id === "web_security"
                                    ? "Web Security"
                                    : binding.scope_id === "cloud_security"
                                      ? "Cloud Security"
                                      : (projects.find(
                                          (p) => p.id === binding.scope_id,
                                        )?.name ?? "Project")}
                              </span>
                            </div>
                          ))}
                          {getRoleBindings(row).length === 0 && "No access"}
                        </div>
                      </td>
                      {canManage && (
                        <td className="px-5 py-4 text-right">
                          <button
                            className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-xs font-semibold transition hover:border-primary/40 hover:bg-primary/5"
                            aria-label={`Edit bindings for ${row.email}`}
                            onClick={() => open(row)}
                          >
                            <SlidersHorizontal className="size-3.5" />
                            Edit bindings
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {!rows.some((row) =>
            `${row.username} ${row.email}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          ) &&
            !error && (
              <p className="px-5 py-12 text-center text-sm text-on-surface-variant">
                No members found.
              </p>
            )}
        </div>
      )}
      {target && (
        <SessionDialog
          open
          size="compact"
          onClose={() => {
            if (!busy) setTarget(null);
          }}
          labelledBy="bindings-title"
        >
          <form
            onSubmit={submit}
            className="space-y-5 overflow-y-auto p-6 sm:p-8"
          >
            <div className="border-b border-outline-variant/60 pb-5">
              <h2 id="bindings-title" className="text-xl font-semibold">
                {target === "invite"
                  ? "Invite teammate"
                  : `Edit bindings — ${target.email}`}
              </h2>
              <p className="mt-2 text-sm text-on-surface-variant">
                Choose a role, then define where it applies.
              </p>
            </div>
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
                  <label className="block text-sm font-medium">
                    Email
                    <input
                      className="mt-2 h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Display name / username
                    <input
                      className="mt-2 h-11 w-full rounded-xl border border-outline-variant bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
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
              <p className="text-xs leading-5 text-on-surface-variant">
                Organization and module access is managed here by
                administrators. Project leads can manage Viewer, Analyst and
                Lead bindings for their own projects from Projects.
              </p>
              <div className="flex justify-end gap-3 border-t border-outline-variant/60 pt-5">
                <button
                  className="rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold hover:bg-surface-container"
                  type="button"
                  onClick={() => setTarget(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary shadow-sm hover:opacity-90"
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
