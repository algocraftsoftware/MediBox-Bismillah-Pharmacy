import { Grn, GrnListResponse, RequisitionItemsResponse } from "../../types";
<<<<<<< HEAD
import { API_BASE_URL, ApiError, request } from "./http";
=======
import { request } from "./http";
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77

export function grnWithoutPoApi(base: string, token: string) {
  return {
    listGrnw: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<GrnListResponse>(`${base}/grn-without-po?${qs.toString()}`, token);
    },
    getGrnwItems: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<RequisitionItemsResponse>(`${base}/grn-without-po/items?${qs.toString()}`, token);
    },
    getGrnw: (id: number) => request<Grn>(`${base}/grn-without-po/${id}`, token),
    createGrnw: (data: Record<string, unknown>) =>
      request<Grn>(`${base}/grn-without-po`, token, { method: "POST", body: JSON.stringify(data) }),
    updateGrnw: (id: number, data: Record<string, unknown>) =>
      request<Grn>(`${base}/grn-without-po/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    approveGrnw: (id: number) => request<Grn>(`${base}/grn-without-po/${id}/approve`, token, { method: "POST" }),
<<<<<<< HEAD
    uploadGrnwAttachment: async (id: number, file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_BASE_URL}${base}/grn-without-po/${id}/attachment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new ApiError(detail?.error || `Upload failed (${res.status})`);
      }
      return (await res.json()) as Grn;
    },
    unapproveGrnw: (id: number) => request<Grn>(`${base}/grn-without-po/${id}/unapprove`, token, { method: "POST" }),
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
    cancelGrnw: (id: number) => request<Grn>(`${base}/grn-without-po/${id}/cancel`, token, { method: "POST" }),
  };
}
