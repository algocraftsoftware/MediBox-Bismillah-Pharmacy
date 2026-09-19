import { Grn, GrnListResponse, GrnPoPreviewItem, PurchaseOrderOption } from "../../types";
import { API_BASE_URL, ApiError, request } from "./http";

export function grnApi(base: string, token: string) {
  return {
    getGrnPurchaseOrders: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<PurchaseOrderOption[]>(`${base}/grn/purchase-orders?${qs.toString()}`, token);
    },
    getGrnPurchaseOrderItems: (poId: number, storeId: number) =>
      request<GrnPoPreviewItem[]>(`${base}/grn/purchase-orders/${poId}/items?storeId=${storeId}`, token),
    listGrns: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<GrnListResponse>(`${base}/grn?${qs.toString()}`, token);
    },
    getGrn: (id: number) => request<Grn>(`${base}/grn/${id}`, token),
    createGrn: (data: Record<string, unknown>) =>
      request<Grn>(`${base}/grn`, token, { method: "POST", body: JSON.stringify(data) }),
    updateGrn: (id: number, data: Record<string, unknown>) =>
      request<Grn>(`${base}/grn/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    approveGrn: (id: number) => request<Grn>(`${base}/grn/${id}/approve`, token, { method: "POST" }),
    // Multipart, so no JSON Content-Type: the browser has to set its own
    // boundary or the server cannot parse the body.
    uploadGrnAttachment: async (id: number, file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_BASE_URL}${base}/grn/${id}/attachment`, {
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
    unapproveGrn: (id: number) => request<Grn>(`${base}/grn/${id}/unapprove`, token, { method: "POST" }),
  };
}
