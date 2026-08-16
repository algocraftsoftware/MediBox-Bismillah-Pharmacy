import { Rtv, RtvListResponse, VstItemForRtv, VstOption } from "../../types";
import { request } from "./http";

export function rtvApi(base: string, token: string) {
  return {
    getRtvVstOptions: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<VstOption[]>(`${base}/rtv/vst-options?${qs.toString()}`, token);
    },
    getRtvVstItems: (vstId: number) => request<VstItemForRtv[]>(`${base}/rtv/vst/${vstId}/items`, token),
    listRtv: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<RtvListResponse>(`${base}/rtv?${qs.toString()}`, token);
    },
    getRtv: (id: number) => request<Rtv>(`${base}/rtv/${id}`, token),
    createRtv: (data: Record<string, unknown>) =>
      request<Rtv>(`${base}/rtv`, token, { method: "POST", body: JSON.stringify(data) }),
    updateRtv: (id: number, data: Record<string, unknown>) =>
      request<Rtv>(`${base}/rtv/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    approveRtv: (id: number) => request<Rtv>(`${base}/rtv/${id}/approve`, token, { method: "POST" }),
  };
}
