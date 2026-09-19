import { AdjOthers, AdjOthersListResponse, RtvAdjustOption } from "../../types";
<<<<<<< HEAD
import { API_BASE_URL, ApiError, request } from "./http";
=======
import { request } from "./http";
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77

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
<<<<<<< HEAD
    unapproveAdjOthers: (id: number) => request<AdjOthers>(`${base}/adj-others/${id}/unapprove`, token, { method: "POST" }),
    uploadAdjOthersAttachment: async (id: number, file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_BASE_URL}${base}/adj-others/${id}/attachment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new ApiError(detail?.error || `Upload failed (${res.status})`);
      }
      return (await res.json()) as AdjOthers;
    },
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
  };
}
