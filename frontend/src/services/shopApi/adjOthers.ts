import { AdjOthers, AdjOthersListResponse, RtvAdjustOption } from "../../types";
import { request } from "./http";

export function adjOthersApi(base: string, token: string) {
  return {
    getAdjOthersRtvOptions: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<RtvAdjustOption[]>(`${base}/adj-others/rtv-options?${qs.toString()}`, token);
    },
    listAdjOthers: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<AdjOthersListResponse>(`${base}/adj-others?${qs.toString()}`, token);
    },
    getAdjOthers: (id: number) => request<AdjOthers>(`${base}/adj-others/${id}`, token),
    createAdjOthers: (data: Record<string, unknown>) =>
      request<AdjOthers>(`${base}/adj-others`, token, { method: "POST", body: JSON.stringify(data) }),
    updateAdjOthers: (id: number, data: Record<string, unknown>) =>
      request<AdjOthers>(`${base}/adj-others/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    approveAdjOthers: (id: number) => request<AdjOthers>(`${base}/adj-others/${id}/approve`, token, { method: "POST" }),
  };
}
