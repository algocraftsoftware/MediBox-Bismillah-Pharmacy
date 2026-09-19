import { Sale, SaleListResponse } from "../../types";
import { API_BASE_URL, ApiError, request } from "./http";

export function salesApi(base: string, token: string) {
  return {
    listSales: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<SaleListResponse>(`${base}/sales?${qs.toString()}`, token);
    },
    getSale: (id: number) => request<Sale>(`${base}/sales/${id}`, token),
    receiveDuePayment: (id: number, data: Record<string, unknown>) =>
      request<Sale>(`${base}/sales/${id}/receive`, token, { method: "POST", body: JSON.stringify(data) }),
    getSaleOrganizations: () => request<string[]>(`${base}/sales/organizations`, token),
    exportInvoiceList: async (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      const res = await fetch(`${API_BASE_URL}${base}/sales/export?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new ApiError(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "invoice-list.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    },

    lookupSaleByInvoiceNo: (invoiceNo: string) =>
      request<Sale>(`${base}/sales/by-invoice-no?invoiceNo=${encodeURIComponent(invoiceNo)}`, token),
    cancelSaleItems: (saleId: number, data: { reason: string; items: { saleItemId: number; qty: number }[] }) =>
      request<Sale>(`${base}/sales/${saleId}/cancel-items`, token, { method: "POST", body: JSON.stringify(data) }),
  };
}
