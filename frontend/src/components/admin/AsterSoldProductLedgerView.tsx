"use client";

import React, { useMemo, useState } from "react";
import { Calendar, Download, Search } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import { CustomerType, SoldLedgerRow, Supplier } from "../../types";
import { ItemEntryTypeahead } from "./ItemEntryTypeahead";
import { PaginationBar } from "./PaginationBar";
import { ComboSelect } from "./ComboSelect";

const PAGE_SIZE = 10;
const CUST_TYPES: CustomerType[] = ["GENERAL", "EMPLOYEE", "OTHER", "VVIP"];

export const AsterSoldProductLedgerView: React.FC = () => {
  const { shopSlug, token, stores } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [warehouseId, setWarehouseId] = useState("");
  const [item, setItem] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [custType, setCustType] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [mobile, setMobile] = useState("");
  const [eidPfNo, setEidPfNo] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [showDate, setShowDate] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const [rows, setRows] = useState<SoldLedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  React.useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filters = {
    storeId: warehouseId || undefined,
    item: item || undefined,
    supplierId: supplierId || undefined,
    custType: custType || undefined,
    customerCode: customerCode || undefined,
    mobile: mobile || undefined,
    employeeId: eidPfNo || undefined,
    invoiceNo: invoiceNo || undefined,
    batchNo: batchNo || undefined,
    from: showDate ? from || undefined : undefined,
    to: showDate ? to || undefined : undefined,
  };

  const runSearch = (targetPage = 1) => {
    if (!warehouseId) {
      setError("Select a Warehouse first");
      return;
    }
    setError(null);
    setLoading(true);
    setSearched(true);
    api
      .getSoldProductLedger({ ...filters, page: targetPage, pageSize: PAGE_SIZE })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
        setPage(res.page);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Search failed"))
      .finally(() => setLoading(false));
  };

  const handleClear = () => {
    setWarehouseId("");
    setItem("");
    setSupplierId("");
    setCustType("");
    setCustomerCode("");
    setMobile("");
    setEidPfNo("");
    setInvoiceNo("");
    setBatchNo("");
    setShowDate(false);
    setFrom("");
    setTo("");
    setRows([]);
    setTotal(0);
    setPage(1);
    setSearched(false);
    setError(null);
  };

  const handleExport = async () => {
    if (!warehouseId) {
      setError("Select a Warehouse first");
      return;
    }
    setExporting(true);
    try {
      await api.exportSoldProductLedger(filters);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-5 gap-2.5 items-end text-xs mb-2.5">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Warehouse*</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">Select...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Item</label>
            <ItemEntryTypeahead<{ id: number; name: string }>
              value={item}
              onValueChange={setItem}
              fetchResults={(q) => api.searchProductNames(q)}
              onSelect={(row) => setItem(row.name)}
              getKey={(r) => r.id}
              getLabel={(r) => r.name}
              placeholder="Search item..."
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Company</label>
            <ComboSelect
              value={supplierId}
              onChange={setSupplierId}
              options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
              placeholder="ALL"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Cust.Type</label>
            <select
              value={custType}
              onChange={(e) => setCustType(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            >
              <option value="">Select...</option>
              {CUST_TYPES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Cust.ID</label>
            <input
              value={customerCode}
              onChange={(e) => setCustomerCode(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2.5 items-end text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Mobile</label>
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">EID/PF No</label>
            <input value={eidPfNo} onChange={(e) => setEidPfNo(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Inv.No</label>
            <input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Batch</label>
            <input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              type="button"
              title="Filter by date range"
              onClick={() => setShowDate((v) => !v)}
              className={`shrink-0 border rounded p-1.5 ${
                showDate ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <Calendar className="w-4 h-4" />
            </button>
            {showDate && (
              <>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold" />
              </>
            )}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={handleExport}
              disabled={exporting}
              title="Download as Excel"
              className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-bold py-1.5 rounded flex items-center justify-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => runSearch(1)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 rounded flex items-center justify-center gap-1"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleClear} className="flex-1 bg-[#dc2626] hover:bg-red-700 text-white font-bold py-1.5 rounded">
              CLEAR
            </button>
          </div>
        </div>

        {error && <p className="text-red-600 font-bold text-xs mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[4%] truncate">Store</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Invoice No</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Invoice Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Customer ID</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Customer Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Contact No</th>
              <th className="py-4 px-3 border border-slate-300 w-[7%] truncate">Customer Type</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">EID/PF No</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Item Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Batch No</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">Qty</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[4%] truncate">MRP</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[6%] truncate">Total Value</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Remarks</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Company</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">GRN No</th>
              <th className="py-4 px-3 border border-slate-300 w-[10%] truncate">Company Invoice No</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Served By</th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((r, i) => (
              <tr key={`${r.invoiceNo}-${r.batchNo}-${i}`} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.store}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.invoiceNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{new Date(r.invoiceDate).toLocaleString()}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.customerId || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.customerName || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.contactNo || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.custType || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.eidPfNo || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{r.itemName}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.batchNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.qty}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{r.mrp.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{r.totalValue.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.remarks || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.company || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.grnNo || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.companyInvoiceNo || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{r.servedBy}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={18} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading...
                    </span>
                  ) : !searched ? (
                    "Select a Warehouse and click Search."
                  ) : (
                    "No sold items found for the selected filters."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        onFirst={() => runSearch(1)}
        onPrevious={() => runSearch(page - 1)}
        onNext={() => runSearch(page + 1)}
        onLast={() => runSearch(totalPages)}
        onPageChange={runSearch}
      />
    </div>
  );
};
