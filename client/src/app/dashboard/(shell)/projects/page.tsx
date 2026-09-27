"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/access";
import { listProjects, type Project } from "@/lib/projects";
import type { MemberRow } from "@/components/dashboard/DashboardUsersManagement";
import { SessionDialog } from "@/components/dashboard/SessionDialog";

export default function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Project | "new" | null>(null);
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberId, setMemberId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [providers, setProviders] = useState<
    { id: string; alias: string; provider: string; project_id: string | null }[]
  >([]);
  const [providerIds, setProviderIds] = useState<string[]>([]);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<
    { id: string; title: string; project_id: string | null }[]
  >([]);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const assignmentsLoading =
    hasPermission(user, "manage_roles") &&
    (providersLoading || sessionsLoading);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProjects(await listProjects());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load projects");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    api<MemberRow[]>("/projects/member-options")
      .then(setMembers)
      .catch((e) =>
        setMemberError(
          e instanceof Error
            ? e.message
            : "Could not load organization members",
        ),
      );
    if (hasPermission(user, "manage_roles")) {
      api<typeof providers>("/projects/cloud-providers")
        .then(setProviders)
        .catch((e) =>
          setProviderError(
            e instanceof Error ? e.message : "Could not load cloud providers",
          ),
        )
        .finally(() => setProvidersLoading(false));
      api<typeof sessions>("/workspace/agent-chat/sessions")
        .then(setSessions)
        .catch((e) =>
          setSessionError(
            e instanceof Error ? e.message : "Could not load web sessions",
          ),
        )
        .finally(() => setSessionsLoading(false));
    }
  }, [user]);
  function open(project: Project | "new") {
    setTarget(project);
    setName(project === "new" ? "" : project.name);
    setMemberIds(project === "new" ? [] : project.member_ids);
    setMemberId("");
    setFormError(null);
    setProviderIds(
      project === "new"
        ? []
        : providers.filter((p) => p.project_id === project.id).map((p) => p.id),
    );
    setSessionIds(
      project === "new"
        ? []
        : sessions.filter((s) => s.project_id === project.id).map((s) => s.id),
    );
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!target || busy || assignmentsLoading || !name.trim()) return;
    if (
      !hasPermission(
        user,
        target === "new" ? "manage_roles" : "manage_members",
        target === "new" ? {} : { projectId: target.id },
      )
    )
      return;
    setBusy(true);
    setFormError(null);
    try {
      if (target === "new")
        await api("/projects", { method: "POST", json: { name: name.trim() } });
      else {
        await api(`/projects/${encodeURIComponent(target.id)}`, {
          method: "PATCH",
          json: { name: name.trim() },
        });
        await api(`/projects/${encodeURIComponent(target.id)}/members`, {
          method: "PUT",
          json: { member_ids: memberIds },
        });
        const assigned = providers
          .filter((p) => p.project_id === target.id)
          .map((p) => p.id);
        const providerAssignmentChanged =
          assigned.length !== providerIds.length ||
          assigned.some((id) => !providerIds.includes(id));
        if (
          hasPermission(user, "manage_roles") &&
          !providerError &&
          providerAssignmentChanged
        ) {
          await api(`/projects/${encodeURIComponent(target.id)}/providers`, {
            method: "PUT",
            json: { provider_ids: providerIds },
          });
          setProviders((prev) =>
            prev.map((p) => ({
              ...p,
              project_id: providerIds.includes(p.id)
                ? target.id
                : p.project_id === target.id
                  ? null
                  : p.project_id,
            })),
          );
        }
        if (hasPermission(user, "manage_roles") && !sessionError) {
          for (const session of sessions) {
            const projectId = sessionIds.includes(session.id)
              ? target.id
              : session.project_id === target.id
                ? null
                : session.project_id;
            if (projectId !== session.project_id) {
              await api(
                `/workspace/agent-chat/sessions/${encodeURIComponent(session.id)}/project`,
                { method: "PATCH", json: { project_id: projectId } },
              );
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === session.id ? { ...s, project_id: projectId } : s,
                ),
              );
            }
          }
        }
      }
      setTarget(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save project");
      await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mx-auto max-w-5xl space-y-5 p-8">
      <header className="flex justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {hasPermission(user, "manage_roles") && (
          <button
            className="rounded bg-primary px-4 py-2 text-on-primary"
            onClick={() => open("new")}
          >
            Create project
          </button>
        )}
      </header>
      <p>
        Project membership does not grant role bindings. Only an organization
        administrator can grant access; project leads can manage membership
        within their own projects.
      </p>
      {error && (
        <p role="alert">
          {error} <button onClick={() => void load()}>Retry</button>
        </p>
      )}
      {loading && projects.length === 0 ? (
        <p role="status">Loading projects…</p>
      ) : projects.length ? (
        <ul className="space-y-3">
          {projects.map((project) => (
            <li
              className="rounded-xl border border-outline-variant p-4"
              key={project.id}
            >
              <h2 className="font-semibold">{project.name}</h2>
              <p className="text-sm">ID: {project.id}</p>
              <p>{project.member_ids.length} members</p>
              {hasPermission(user, "manage_members", {
                projectId: project.id,
              }) && (
                <button
                  disabled={assignmentsLoading}
                  className="mt-2 rounded border px-3 py-2"
                  onClick={() => open(project)}
                >
                  {assignmentsLoading
                    ? "Loading assignments…"
                    : `Manage ${project.name}`}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !error && <p>No accessible projects.</p>
      )}
      {target && (
        <SessionDialog
          open
          labelledBy="project-title"
          onClose={() => {
            if (!busy) setTarget(null);
          }}
        >
          <form className="space-y-4 overflow-y-auto p-6" onSubmit={save}>
            <h2 id="project-title" className="text-xl font-semibold">
              {target === "new" ? "Create project" : "Manage project"}
            </h2>
            {formError && (
              <p role="alert">
                {formError} A name change may already have saved; review and
                retry.
              </p>
            )}
            <fieldset disabled={busy} className="space-y-4">
              <label className="block">
                Project name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="ml-3 rounded border p-2"
                />
              </label>
              {target !== "new" && (
                <section className="space-y-3">
                  <h3 className="font-semibold">Members</h3>
                  {memberError && <p role="alert">{memberError}</p>}
                  <p className="text-sm">
                    Adding a member does not grant access. Ask an administrator
                    to assign role bindings separately.
                  </p>
                  <ul>
                    {memberIds.map((id) => (
                      <li key={id} className="flex items-center gap-3">
                        {members.find((m) => m.id === id)?.email ?? id}
                        <button
                          type="button"
                          aria-label={`Remove member ${id}`}
                          onClick={() =>
                            setMemberIds(memberIds.filter((m) => m !== id))
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  {members.length ? (
                    <label>
                      Add organization member
                      <select
                        value={memberId}
                        onChange={(e) => setMemberId(e.target.value)}
                        className="ml-3 rounded border p-2"
                      >
                        <option value="">Select member</option>
                        {members
                          .filter((m) => !memberIds.includes(m.id))
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.email}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Member ID
                      <input
                        value={memberId}
                        onChange={(e) => setMemberId(e.target.value)}
                        className="ml-3 rounded border p-2"
                      />
                      <span className="block text-sm">
                        No member choices are available. An administrator can
                        provide the organization member ID.
                      </span>
                    </label>
                  )}
                  <button
                    type="button"
                    disabled={
                      !memberId.trim() || memberIds.includes(memberId.trim())
                    }
                    onClick={() => {
                      setMemberIds([...memberIds, memberId.trim()]);
                      setMemberId("");
                    }}
                    className="rounded border px-3 py-2"
                  >
                    Add member
                  </button>
                </section>
              )}
              {target !== "new" && hasPermission(user, "manage_roles") && (
                <section>
                  <h3 className="font-semibold">Web sessions</h3>
                  {sessionError ? (
                    <p role="alert">{sessionError}</p>
                  ) : (
                    sessions.map((session) => (
                      <label key={session.id} className="block">
                        <input
                          type="checkbox"
                          checked={sessionIds.includes(session.id)}
                          onChange={(event) =>
                            setSessionIds(
                              event.target.checked
                                ? [...sessionIds, session.id]
                                : sessionIds.filter((id) => id !== session.id),
                            )
                          }
                        />{" "}
                        {session.title}
                        {session.project_id && session.project_id !== target.id
                          ? " — assigned to another project"
                          : ""}
                      </label>
                    ))
                  )}
                  <h3 className="font-semibold">Cloud accounts/providers</h3>
                  <p className="text-sm">
                    Assign accounts to this project. Moving an account removes
                    it from its previous project.
                  </p>
                  {providerError ? (
                    <p role="alert">{providerError}</p>
                  ) : (
                    providers.map((provider) => (
                      <label key={provider.id} className="block">
                        <input
                          type="checkbox"
                          checked={providerIds.includes(provider.id)}
                          onChange={(event) =>
                            setProviderIds(
                              event.target.checked
                                ? [...providerIds, provider.id]
                                : providerIds.filter(
                                    (id) => id !== provider.id,
                                  ),
                            )
                          }
                        />{" "}
                        {provider.alias} ({provider.provider}){" "}
                        {provider.project_id &&
                        provider.project_id !== target.id
                          ? "— assigned to another project"
                          : ""}
                      </label>
                    ))
                  )}
                </section>
              )}
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setTarget(null)}>
                  Cancel
                </button>
                <button
                  disabled={assignmentsLoading}
                  className="rounded bg-primary px-4 py-2 text-on-primary"
                  type="submit"
                >
                  {busy ? "Saving…" : "Save project"}
                </button>
              </div>
            </fieldset>
          </form>
        </SessionDialog>
      )}
    </section>
  );
}
