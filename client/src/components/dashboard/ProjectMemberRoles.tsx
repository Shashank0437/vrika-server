"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";

type ProjectRole = "viewer" | "analyst" | "lead";
type Member = {
  id: string;
  email: string;
  username: string;
  role: ProjectRole | null;
  is_member: boolean;
  access_version: number;
};
const roles: { value: ProjectRole; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "analyst", label: "Analyst" },
  { value: "lead", label: "Lead" },
];

export function ProjectMemberRoles({
  projectId,
  onChanged,
  onSelfChanged,
  onBusyChange,
}: {
  projectId: string;
  onChanged: () => void;
  onSelfChanged: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { user, refreshUser } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberId, setMemberId] = useState("");
  const [role, setRole] = useState<ProjectRole>("viewer");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMembers(
        await api<Member[]>(
          `/projects/${encodeURIComponent(projectId)}/member-roles`,
        ),
      );
      setError(null);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load project roles",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(member: Member, next: ProjectRole | null) {
    if (busy || loading) return;
    setBusy(true);
    onBusyChange(true);
    setError(null);
    try {
      const saved = await api<Member>(
        `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(member.id)}/role`,
        {
          method: "PUT",
          json: { role: next, expected_version: member.access_version },
        },
      );
      setMembers((current) =>
        current.map((row) => (row.id === saved.id ? saved : row)),
      );
      setMemberId("");
      onChanged();
      if (member.id === user?.id) {
        await refreshUser();
        onSelfChanged();
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await load();
        setError(
          "This member's access changed. Review the refreshed roles and try again.",
        );
      } else {
        setError(
          error instanceof Error
            ? error.message
            : "Could not update project role",
        );
      }
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  const assigned = members.filter((member) => member.is_member);
  return (
    <section className="space-y-4" aria-label="Project member roles">
      <div>
        <h3 className="text-sm font-semibold">Team access</h3>
        <p className="mt-1 text-xs leading-5 text-on-surface-variant">
          Assign Viewer, Analyst or Lead for this project only. Role changes
          save immediately. Other project, module and administrator access stays
          unchanged.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-error/8 p-3 text-sm text-error"
        >
          {error}{" "}
          <button
            type="button"
            disabled={busy}
            className="underline"
            onClick={() => void load()}
          >
            Reload roles
          </button>
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm">
          Loading project roles…
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <WorkspaceSelect
          label="Add organization member"
          className="min-w-48 flex-1"
          value={memberId}
          onChange={setMemberId}
          disabled={loading || busy}
          placeholder="Find a teammate…"
          options={members
            .filter((member) => !member.is_member)
            .map((member) => ({
              value: member.id,
              label: member.username || member.email,
              description: member.email,
            }))}
        />
        <WorkspaceSelect
          label="New member project role"
          value={role}
          onChange={setRole}
          options={roles}
          disabled={loading || busy}
        />
        <button
          type="button"
          disabled={loading || busy || !memberId}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-outline-variant px-3 text-sm font-semibold disabled:opacity-50"
          onClick={() => {
            const member = members.find((row) => row.id === memberId);
            if (member) void save(member, role);
          }}
        >
          <Plus className="size-4" />
          Add member
        </button>
      </div>
      <ul className="divide-y divide-outline-variant/60 rounded-xl border border-outline-variant/70">
        {assigned.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {member.username || member.email}
              </p>
              <p className="truncate text-xs text-on-surface-variant">
                {member.email}
              </p>
            </div>
            <WorkspaceSelect
              label={`Project role for ${member.email}`}
              value={member.role ?? ""}
              options={[{ value: "", label: "No project role" }, ...roles]}
              disabled={loading || busy}
              onChange={(next) => {
                const selected = roles.find((item) => item.value === next);
                void save(member, selected?.value ?? null);
              }}
            />
            <button
              type="button"
              aria-label={`Remove project access for ${member.email}`}
              disabled={loading || busy}
              className="rounded-lg p-2 text-on-surface-variant hover:bg-error/8 hover:text-error disabled:opacity-50"
              onClick={() => void save(member, null)}
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      {!loading && !assigned.length && (
        <p className="text-center text-sm text-on-surface-variant">
          No team members yet. Add a teammate above.
        </p>
      )}
    </section>
  );
}
