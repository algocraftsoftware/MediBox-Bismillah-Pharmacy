import { DashboardResponse } from "../../types";
import { request } from "./http";

export function dashboardApi(base: string, token: string) {
  return {
    getDashboard: (params: { storeId?: number; from?: string; to?: string }) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<DashboardResponse>(`${base}/dashboard?${qs.toString()}`, token);
    },
  };
}
