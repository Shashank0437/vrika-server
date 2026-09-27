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
