"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowUpRight,
  FolderKanban,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/access";
import { listProjects, type Project } from "@/lib/projects";
import { SessionDialog } from "@/components/dashboard/SessionDialog";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";

type Member = { id: string; email: string; username: string };
const primaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary shadow-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50";
const secondaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-outline-variant px-4 text-sm font-semibold text-on-surface transition hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50";

export default function ProjectsPage() {
  const { user } = useAuth();
  const canAdmin = hasPermission(user, "manage_roles");
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<Project | "new" | null>(null);
  const [name, setName] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberId, setMemberId] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
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
  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      setMembers(await api<Member[]>("/projects/member-options"));
      setMemberError(null);
    } catch (e) {
      setMemberError(e instanceof Error ? e.message : "Could not load members");
    } finally {
      setMembersLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    void loadMembers();
  }, [load, loadMembers]);
  function open(project: Project | "new") {
    setTarget(project);
    setName(project === "new" ? "" : project.name);
    setMemberIds(project === "new" ? [] : project.member_ids);
    setMemberId("");
    setFormError(null);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!target || busy || !name.trim()) return;
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
      }
      setTarget(null);
      await load();
    } catch (e) {
      setFormError(
        `${e instanceof Error ? e.message : "Could not save project"}. A previous change may already be saved; review and retry.`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  }
  const filtered = projects.filter((project) =>
    project.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Workspace / Projects
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface">
            Projects
          </h1>
          <p className="mt-2 text-sm text-on-surface-variant">
            Organize your security work and keep the right people together.
          </p>
        </div>
        {canAdmin && (
          <button className={primaryButton} onClick={() => open("new")}>
            <Plus className="size-4" />
            <span>Create project</span>
          </button>
        )}
      </header>
      <div className="overflow-hidden rounded-2xl border border-outline-variant/70 bg-surface-container-lowest shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/60 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold">Your projects</h2>
            <span className="rounded-md bg-primary/8 px-2 py-0.5 text-xs font-semibold text-primary">
              {projects.length}
            </span>
          </div>
          <label className="flex h-10 w-full items-center gap-2 rounded-xl border border-outline-variant/70 bg-surface px-3 sm:w-64">
            <Search className="size-4 text-on-surface-variant" />
            <input
              aria-label="Search projects"
              placeholder="Search projects…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
        </div>
        {error && (
          <div
            role="alert"
            className="m-5 rounded-xl bg-error/8 p-4 text-sm text-error"
          >
            {error}{" "}
            <button className="ml-2 underline" onClick={() => void load()}>
              Retry
            </button>
          </div>
        )}
        {loading && !projects.length ? (
          <div role="status" className="space-y-3 p-6">
            <span className="text-sm text-on-surface-variant">
              Loading projects…
            </span>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-xl bg-surface-container"
              />
            ))}
          </div>
        ) : filtered.length ? (
          <ul className="divide-y divide-outline-variant/60">
            {filtered.map((project) => {
              const canManage = hasPermission(user, "manage_members", {
                projectId: project.id,
              });
              return (
                <li
                  key={project.id}
                  className="flex items-center gap-4 px-5 py-5 transition hover:bg-primary/[0.025] sm:px-6"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-primary/10 bg-primary/8 text-primary">
                    <FolderKanban className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-on-surface">
                      {project.name}
                    </h3>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-on-surface-variant">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        {project.member_ids.length}{" "}
                        {project.member_ids.length === 1 ? "member" : "members"}
                      </span>
                      <span className="h-3 w-px bg-outline-variant" />
                      <span>{canManage ? "Can manage" : "Read only"}</span>
                    </div>
                  </div>
                  {canManage && (
                    <button
                      aria-label={`Manage ${project.name}`}
                      className={`${secondaryButton} shrink-0`}
                      onClick={() => open(project)}
                    >
                      Manage <ArrowUpRight className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          !error && (
            <div className="flex flex-col items-center px-6 py-16 text-center">
              <span className="mb-4 rounded-2xl bg-primary/8 p-4 text-primary">
                <FolderKanban className="size-7" />
              </span>
              <h3 className="font-semibold">
                {query
                  ? "No matching projects"
                  : "A home for your security work"}
              </h3>
              <p className="mb-5 mt-2 max-w-sm text-sm text-on-surface-variant">
                {query
                  ? "Try a different project name."
                  : canAdmin
                    ? "Create your first project, then bring your team together."
                    : "Projects you have access to will appear here."}
              </p>
              {query ? (
                <button
                  className={secondaryButton}
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              ) : (
                canAdmin && (
                  <button className={primaryButton} onClick={() => open("new")}>
                    <Plus className="size-4" />
                    Create project
                  </button>
                )
              )}
            </div>
          )
        )}
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-on-surface-variant">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Project leads manage their team. Organization admins assign access
        separately in User management.
      </p>
      {target && (
        <SessionDialog
          open
          size="compact"
          labelledBy="project-title"
          onClose={() => {
            if (!busy) setTarget(null);
          }}
        >
          <form onSubmit={save} className="flex min-h-0 flex-col">
            <header className="flex items-start gap-3 border-b border-outline-variant/60 px-6 py-5">
              <span className="rounded-xl bg-primary/8 p-2.5 text-primary">
                <FolderKanban className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="project-title" className="text-lg font-semibold">
                  {target === "new" ? "Create project" : "Manage project"}
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {target === "new"
                    ? "Give your team's work a clear name."
                    : "Update project details and team membership."}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setTarget(null)}
                aria-label="Close project"
                className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container"
              >
                <X className="size-5" />
              </button>
            </header>
            <fieldset
              disabled={busy}
              className="min-h-0 space-y-6 overflow-y-auto px-6 py-6"
            >
              {formError && (
                <p
                  role="alert"
                  className="rounded-xl bg-error/8 p-3 text-sm text-error"
                >
                  {formError}
                </p>
              )}
              <label className="block text-sm font-medium">
                Project name
                <input
                  required
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Customer platform"
                  className="mt-2 h-11 w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </label>
              {target !== "new" && (
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Team members</h3>
                    <span className="text-xs text-on-surface-variant">
                      {memberIds.length} assigned
                    </span>
                  </div>
                  {memberError && (
                    <p
                      role="alert"
                      className="mb-3 rounded-lg bg-error/8 p-3 text-sm text-error"
                    >
                      {memberError}{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void loadMembers()}
                      >
                        Retry
                      </button>
                    </p>
                  )}
                  <div className="mb-4 flex items-center gap-2">
                    <WorkspaceSelect
                      label="Add organization member"
                      value={memberId}
                      onChange={setMemberId}
                      disabled={membersLoading || !!memberError}
                      className="flex-1"
                      placeholder={
                        membersLoading ? "Loading members…" : "Find a teammate…"
                      }
                      options={members
                        .filter((member) => !memberIds.includes(member.id))
                        .map((member) => ({
                          value: member.id,
                          label: member.username || member.email,
                          description: member.email,
                        }))}
                    />
                    <button
                      type="button"
                      className={secondaryButton}
                      disabled={!memberId || memberIds.includes(memberId)}
                      onClick={() => {
                        setMemberIds([...memberIds, memberId]);
                        setMemberId("");
                      }}
                    >
                      <Plus className="size-4" />
                      Add member
                    </button>
                  </div>
                  <ul className="divide-y divide-outline-variant/60 rounded-xl border border-outline-variant/70">
                    {memberIds.map((id) => {
                      const member = members.find((item) => item.id === id);
                      return (
                        <li
                          key={id}
                          className="flex items-center gap-3 px-4 py-3"
                        >
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/8 text-xs font-bold text-primary">
                            {(member?.username || member?.email || "?")
                              .slice(0, 2)
                              .toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {member?.username ||
                                member?.email ||
                                "Member details unavailable"}
                            </p>
                            <p className="truncate text-xs text-on-surface-variant">
                              {member?.email}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove member ${id}`}
                            onClick={() =>
                              setMemberIds(
                                memberIds.filter((member) => member !== id),
                              )
                            }
                            className="rounded-lg p-2 text-on-surface-variant hover:bg-error/8 hover:text-error"
                          >
                            <X className="size-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {!memberIds.length && (
                    <p className="rounded-xl border border-dashed border-outline-variant p-6 text-center text-sm text-on-surface-variant">
                      No team members yet. Add a teammate above.
                    </p>
                  )}
                  <p className="mt-3 text-xs leading-5 text-on-surface-variant">
                    Adding a member does not change their permissions. An admin
                    can assign role bindings in User management.
                  </p>
                </section>
              )}
            </fieldset>
            <footer className="flex shrink-0 justify-end gap-3 border-t border-outline-variant/60 bg-surface-container-low/50 px-6 py-4">
              <button
                type="button"
                disabled={busy}
                className={secondaryButton}
                onClick={() => setTarget(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className={primaryButton}
              >
                {busy ? "Saving…" : "Save project"}
              </button>
            </footer>
          </form>
        </SessionDialog>
      )}
    </section>
  );
}
