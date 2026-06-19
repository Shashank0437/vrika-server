import apiClient from "./client";

export type LicenseFeature = "ai_agent" | "network_scanner" | "malware_analysis" | "forensics";

export type License = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  product: string;
  features: LicenseFeature[];
  max_users: number;
  max_agents: number;
  machine_fingerprint: string;
  expires_at: string;
  status: "active" | "expired" | "revoked";
  created_at: string;
};

export type LicenseGenerate = {
  customer_id: string;
  product: string;
  features: LicenseFeature[];
  max_users: number;
  max_agents: number;
  expires_at: string;
  machine_fingerprint: string;
};

export type LicenseDashboardStats = {
  total_customers: number;
  active_licenses: number;
  expired_licenses: number;
  enabled_features: Record<string, number>;
  recent_activity: LicenseActivity[];
};

export type LicenseActivity = {
  id: string;
  action: string;
  license_id: string;
  customer_name: string;
  timestamp: string;
};

export const licensesApi = {
  async list(): Promise<License[]> {
    const { data } = await apiClient.get("/license-admin/licenses");
    return data;
  },

  async get(id: string): Promise<License> {
    const { data } = await apiClient.get(`/license-admin/licenses/${id}`);
    return data;
  },

  async generate(body: LicenseGenerate): Promise<License> {
    const { data } = await apiClient.post("/license-admin/licenses/generate", body);
    return data;
  },

  async revoke(id: string): Promise<License> {
    const { data } = await apiClient.post(`/license-admin/licenses/${id}/revoke`);
    return data;
  },

  async download(id: string): Promise<Blob> {
    const { data } = await apiClient.get(`/license-admin/licenses/${id}/download`, {
      responseType: "blob",
    });
    return data;
  },

  async dashboardStats(): Promise<LicenseDashboardStats> {
    const { data } = await apiClient.get("/license-admin/dashboard");
    return data;
  },

  async hashMachineInfo(machineInfo: Record<string, string>): Promise<{ fingerprint: string }> {
    const { data } = await apiClient.post("/license-admin/machine-info/hash", machineInfo);
    return data;
  },

  async listByCustomer(customerId: string): Promise<License[]> {
    const { data } = await apiClient.get(`/license-admin/customers/${customerId}/licenses`);
    return data;
  },
};
