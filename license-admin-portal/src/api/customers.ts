import apiClient from "./client";

export type Customer = {
  id: string;
  name: string;
  email: string;
  organization: string;
  created_at: string;
  licenses_count: number;
};

export type CustomerCreate = {
  name: string;
  email: string;
  organization: string;
};

export const customersApi = {
  async list(): Promise<Customer[]> {
    const { data } = await apiClient.get("/license-admin/customers");
    return data;
  },

  async get(id: string): Promise<Customer> {
    const { data } = await apiClient.get(`/license-admin/customers/${id}`);
    return data;
  },

  async create(body: CustomerCreate): Promise<Customer> {
    const { data } = await apiClient.post("/license-admin/customers", body);
    return data;
  },

  async update(id: string, body: Partial<CustomerCreate>): Promise<Customer> {
    const { data } = await apiClient.patch(`/license-admin/customers/${id}`, body);
    return data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/license-admin/customers/${id}`);
  },
};
