"use client";

import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { AccessRole, RoleBinding } from "@/lib/access";
import type { Project } from "@/lib/projects";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";

export const viewerBinding: RoleBinding = {
  role: "viewer",
  scope_type: "global",
  scope_id: null,
};
const roles: { value: AccessRole; label: string; description: string }[] = [
  {
    value: "viewer",
    label: "Viewer",
    description: "Read-only access across the organization",
  },
  {
    value: "analyst",
    label: "Analyst",
    description: "Run scans and manage one security module",
  },
  {
    value: "lead",
    label: "Project lead",
    description: "Manage work and members within one project",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Full organization access, including roles",
  },
];

export function RoleBindingsEditor({
  value,
  onChange,
  projects,
}: {
  value: RoleBinding[];
  onChange: (bindings: RoleBinding[]) => void;
  projects: Project[];
}) {
  function replace(index: number, binding: RoleBinding) {
    onChange(value.map((item, i) => (i === index ? binding : item)));
  }
  function changeRole(index: number, role: AccessRole) {
    replace(index, {
      role,
      scope_type:
        role === "analyst" ? "module" : role === "lead" ? "project" : "global",
      scope_id:
        role === "analyst"
          ? "web_security"
          : role === "lead"
            ? (projects[0]?.id ?? "")
            : null,
    });
  }
  return (
    <section className="space-y-3" aria-label="Role bindings">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Roles & access</h3>
        <span className="text-xs text-on-surface-variant">
          {value.length} {value.length === 1 ? "binding" : "bindings"}
        </span>
      </div>
      {!value.length && (
        <p className="rounded-xl border border-dashed border-outline-variant p-5 text-sm text-on-surface-variant">
          No bindings: this account will have no workspace access.
        </p>
      )}
      {value.map((binding, index) => (
        <div
          key={index}
          className="rounded-xl border border-outline-variant/70 bg-surface-container-low/40 p-4"
        >
          <div className="flex items-end gap-3">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold text-on-surface-variant">
                  Role {index + 1}
                </p>
                <WorkspaceSelect
                  label={`Role ${index + 1}`}
                  value={binding.role}
                  options={roles}
                  onChange={(role) => changeRole(index, role)}
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold text-on-surface-variant">
                  Scope {index + 1}
                </p>
                <WorkspaceSelect
                  label={`Scope ${index + 1}`}
                  value={binding.scope_id ?? "global"}
                  disabled={binding.scope_type === "global"}
                  onChange={(scope_id) =>
                    replace(index, { ...binding, scope_id })
                  }
                  options={
                    binding.scope_type === "global"
                      ? [{ value: "global", label: "Entire organization" }]
                      : binding.scope_type === "module"
                        ? [
                            { value: "web_security", label: "Web Security" },
                            {
                              value: "cloud_security",
                              label: "Cloud Security",
                            },
                          ]
                        : [
                            { value: "", label: "Select project" },
                            ...(binding.scope_id &&
                            !projects.some(
                              (project) => project.id === binding.scope_id,
                            )
                              ? [
                                  {
                                    value: binding.scope_id,
                                    label: "Unavailable project",
                                  },
                                ]
                              : []),
                            ...projects.map((project) => ({
                              value: project.id,
                              label: project.name,
                            })),
                          ]
                  }
                />
              </div>
            </div>
            <button
              type="button"
              aria-label={`Remove binding ${index + 1}`}
              onClick={() => onChange(value.filter((_, i) => i !== index))}
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-on-surface-variant transition hover:bg-error/8 hover:text-error"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-on-surface-variant">
            <ShieldCheck className="size-3.5 shrink-0" />
            {roles.find((role) => role.value === binding.role)?.description}
          </p>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { ...viewerBinding }])}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-primary transition hover:bg-primary/8"
      >
        <Plus className="size-4" />
        Add binding
      </button>
    </section>
  );
}
