import { api } from "./api";

export type Project = {
  id: string;
  name: string;
  member_ids: string[];
  cloud_provider_ids: string[];
};

export function listProjects(): Promise<Project[]> {
  return api<Project[]>("/projects");
}

export const UNASSIGNED_PROJECT = "unassigned";

export function matchesProject(
  projectId: string | null | undefined,
  scope: string,
): boolean {
  return (
    !scope || (scope === UNASSIGNED_PROJECT ? !projectId : projectId === scope)
  );
}

export function creationProject(scope: string): string | null {
  return !scope || scope === UNASSIGNED_PROJECT ? null : scope;
}

export function projectHref(path: string, scope: string): string {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("project", scope || "all");
  return `${pathname}?${params.toString()}`;
}
