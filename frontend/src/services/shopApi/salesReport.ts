import { SalesReportName, SalesReportResponse } from "../../types";
import { API_BASE_URL, ApiError, request } from "./http";

export function salesReportApi(base: string, token: string) {
  return {
    getSalesReport: (params: Record<string, string | number | undefined> & { reportName: SalesReportName }) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<SalesReportResponse>(`${base}/reports/sales?${qs.toString()}`, token);
    },
    exportSalesReport: async (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      const res = await fetch(`${API_BASE_URL}${base}/reports/sales/export?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new ApiError(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sales-report.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    },
  };
}
