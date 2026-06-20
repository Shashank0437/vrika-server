import apiClient from "./client";

export type LicenseFeature = "ai_agent" | "network_scanner" | "malware_analysis" | "forensics";

export type LicenseType = "free_trial" | "standard" | "premium" | "enterprise";

export type License = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_email: string;
  product: string;
  license_type: LicenseType;
  features: LicenseFeature[];
  allowed_tools: string[];
  machine_fingerprint: string;
  expires_at: string;
  status: "active" | "expired" | "revoked" | "suspended";
  created_at: string;
};

export type LicenseGenerate = {
  customer_id: string;
  product: string;
  license_type: LicenseType;
  features: LicenseFeature[];
  allowed_tools: string[];
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

  async download(id: string, format: "json" | "key" = "json"): Promise<Blob> {
    const { data } = await apiClient.get(`/license-admin/licenses/${id}/download`, {
      params: { format },
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

  async availableTools(): Promise<{ name: string; description: string; category: string; active: boolean }[]> {
    const { data } = await apiClient.get("/license-admin/available-tools");
    return data;
  },
};
