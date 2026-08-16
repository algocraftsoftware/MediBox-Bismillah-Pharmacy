import { Vst, VstListResponse, VstSearchItemRow } from "../../types";
import { request } from "./http";

export function vstApi(base: string, token: string) {
  return {
    searchVstItems: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<VstSearchItemRow[]>(`${base}/vst/search-items?${qs.toString()}`, token);
    },
    listVst: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<VstListResponse>(`${base}/vst?${qs.toString()}`, token);
    },
    getVst: (id: number) => request<Vst>(`${base}/vst/${id}`, token),
    createVst: (data: Record<string, unknown>) =>
      request<Vst>(`${base}/vst`, token, { method: "POST", body: JSON.stringify(data) }),
    updateVst: (id: number, data: Record<string, unknown>) =>
      request<Vst>(`${base}/vst/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    approveVst: (id: number) => request<Vst>(`${base}/vst/${id}/approve`, token, { method: "POST" }),
  };
}
