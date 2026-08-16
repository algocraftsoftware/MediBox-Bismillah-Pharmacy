import { Department, ShopAdminRole, Store, Supplier } from "../../types";
import { request } from "./http";

export interface SettingsAccount {
  id: number;
  name: string;
  username: string;
  role: ShopAdminRole;
  status: "ACTIVE" | "INACTIVE";
}

export function coreApi(base: string, token: string) {
  return {
    me: () => request<{ admin: { id: number; name: string; username: string }; shop: any }>(`${base}/me`, token),

    getStores: () => request<Store[]>(`${base}/stores`, token),

    getDepartments: () => request<Department[]>(`${base}/departments`, token),
    getSuppliers: () => request<Supplier[]>(`${base}/suppliers`, token),
    getAdmins: () => request<{ id: number; name: string; username: string }[]>(`${base}/admins`, token),

    listSettingsAccounts: () => request<SettingsAccount[]>(`${base}/settings/accounts`, token),
    updateSettingsAccount: (id: number, data: { username?: string; password?: string }) =>
      request<SettingsAccount>(`${base}/settings/accounts/${id}`, token, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  };
}
