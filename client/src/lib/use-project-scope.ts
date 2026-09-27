"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AuthUser } from "./auth-context";
import { hasPermission, type AccessModule } from "./access";
import { listProjects, UNASSIGNED_PROJECT, type Project } from "./projects";

export function useProjectScope(
  user: AuthUser | null | undefined,
  module: AccessModule,
) {
  const params = useSearchParams();
  const parameter = params.get("project");
  const key = user
    ? `vrika:project:${user.tenant_id}:${user.id}:${module}`
    : null;
  const [selection, setSelection] = useState({ key: "", scope: "" });
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const scope = selection.key === key ? selection.scope : "";
  const ready = !!key && selection.key === key;

  useEffect(() => {
    if (!key) return;
    let next = parameter === "all" ? "" : parameter;
    try {
      if (next === null) next = localStorage.getItem(key) ?? "";
      else localStorage.setItem(key, next);
      setStorageError(null);
    } catch {
      setStorageError(
        "Project preference could not be saved on this device. Use the project link to keep your selection.",
      );
    }
    setSelection({ key, scope: next ?? "" });
    if (parameter === null && next) {
      const url = new URL(window.location.href);
      url.searchParams.set("project", next);
      window.history.replaceState(null, "", url);
    }
  }, [key, parameter]);

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      setProjects(await listProjects());
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load projects",
      );
    } finally {
      setLoading(false);
    }
  }, [key]);
  useEffect(() => {
    void load();
  }, [load]);

  const setScope = useCallback(
    (next: string, resetChat = false) => {
      if (!key) return;
      setSelection({ key, scope: next });
      try {
        localStorage.setItem(key, next);
        setStorageError(null);
      } catch {
        setStorageError(
          "Project preference could not be saved on this device. Use the project link to keep your selection.",
        );
      }
      const url = new URL(window.location.href);
      url.searchParams.set("project", next || "all");
      if (resetChat) {
        url.searchParams.delete("chat_id");
        url.searchParams.set("new", "1");
      }
      window.history.replaceState(null, "", url);
    },
    [key],
  );

  const allowUnassigned =
    module === "web_security" && hasPermission(user, "view", { module });
  const accessibleProjects = projects.filter((project) =>
    hasPermission(user, "view", { module, projectId: project.id }),
  );
  const validScope =
    !scope ||
    (scope === UNASSIGNED_PROJECT && allowUnassigned) ||
    accessibleProjects.some((project) => project.id === scope);
  const error =
    loadError ??
    storageError ??
    (!loading && !validScope
      ? "This project is unavailable. Choose another accessible project."
      : null);
  const options = [
    {
      value: "",
      label: "All projects",
      description:
        module === "cloud_security"
          ? "View all accessible cloud resources."
          : hasPermission(user, "execute", { module })
            ? "View all sessions. New scans are saved to Unassigned."
            : allowUnassigned
              ? "View all accessible sessions."
              : "View accessible projects. Select a project to start a scan.",
    },
    ...(allowUnassigned
      ? [
          {
            value: UNASSIGNED_PROJECT,
            label: "Unassigned",
            description: "Sessions without a project, including older scans.",
          },
        ]
      : []),
    ...accessibleProjects.map((project) => ({
      value: project.id,
      label: project.name,
    })),
    ...(scope && !validScope
      ? [
          {
            value: scope,
            label: loading ? "Loading project…" : "Unavailable project",
          },
        ]
      : []),
  ];
  return {
    scope,
    setScope,
    ready,
    projects: accessibleProjects,
    loading,
    error,
    options,
    reload: load,
  };
}

export type ProjectScope = ReturnType<typeof useProjectScope>;
