import { CreatedStockRow, CreateStockInput } from "../../types";
import { request } from "./http";

export function createStockApi(base: string, token: string) {
  return {
    // Preview of the code the next created item will get. Read-only — the code
    // is allocated for real at creation time, so two people entering items at
    // once each still get their own.
    getNextItemNo: () => request<{ itemNo: string }>(`${base}/create-stock/next-item-no`, token),
    getDisplayCategories: () => request<string[]>(`${base}/products/display-categories`, token),
    getUnits: () => request<string[]>(`${base}/products/units`, token),
    createStock: (data: CreateStockInput) =>
      request<CreatedStockRow>(`${base}/create-stock`, token, {
        method: "POST",
        body: JSON.stringify(data),
      }),
  };
}
