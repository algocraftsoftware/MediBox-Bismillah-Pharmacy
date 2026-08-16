import { Customer } from "../../types";
import { request } from "./http";

export function customerApi(base: string, token: string) {
  return {
    searchCustomers: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<Customer[]>(`${base}/customers?${qs.toString()}`, token);
    },
    createCustomer: (data: Partial<Customer>) =>
      request<Customer>(`${base}/customers`, token, { method: "POST", body: JSON.stringify(data) }),
    updateCustomer: (id: number, data: Partial<Customer>) =>
      request<Customer>(`${base}/customers/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
  };
}
