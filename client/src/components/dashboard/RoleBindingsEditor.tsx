"use client";

import type { AccessRole, RoleBinding } from "@/lib/access";
import type { Project } from "@/lib/projects";

export const viewerBinding: RoleBinding = {
  role: "viewer",
  scope_type: "global",
  scope_id: null,
};

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
      <p className="text-sm">
        Roles apply only within their scope in this organization. Multiple
        bindings combine matching permissions.
      </p>
      {value.length === 0 && (
        <p>No bindings: this account will have no workspace access.</p>
      )}
      {value.map((binding, index) => (
        <div
          key={index}
          className="flex flex-wrap items-end gap-3 rounded border border-outline-variant p-3"
        >
          <label className="flex flex-col gap-1">
            Role {index + 1}
            <select
              className="rounded border p-2"
              value={binding.role}
              onChange={(e) => changeRole(index, e.target.value as AccessRole)}
            >
              <option value="viewer">Viewer — read only</option>
              <option value="analyst">Analyst — module operations</option>
              <option value="lead">
                Lead — project operations and members
              </option>
              <option value="admin">Admin — organization administration</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Scope {index + 1}
            <select
              className="rounded border p-2"
              required
              value={binding.scope_id ?? "global"}
              disabled={binding.scope_type === "global"}
              onChange={(e) =>
                replace(index, { ...binding, scope_id: e.target.value })
              }
            >
              {binding.scope_type === "global" && (
                <option value="global">Global — this organization</option>
              )}
              {binding.scope_type === "module" && (
                <>
                  <option value="web_security">Web Security</option>
                  <option value="cloud_security">Cloud Security</option>
                </>
              )}
              {binding.scope_type === "project" && (
                <>
                  <option value="">Select project</option>
                  {binding.scope_id &&
                    !projects.some((p) => p.id === binding.scope_id) && (
                      <option value={binding.scope_id}>
                        {binding.scope_id} (unavailable)
                      </option>
                    )}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          <button
            type="button"
            aria-label={`Remove binding ${index + 1}`}
            onClick={() => onChange(value.filter((_, i) => i !== index))}
            className="rounded border px-3 py-2"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { ...viewerBinding }])}
        className="rounded border px-3 py-2"
      >
        Add binding
      </button>
    </section>
  );
}
