import { Grn } from "../../../types";
import { fmt, fmt4 } from "../../../lib/format";
import { amountInWords } from "../../../lib/numberToWords";
import { statusLabel, toDateInput } from "./types";

// =======================================================
// Shared report/PDF template — used by BOTH the Detail page's
// REPORT button (fed from live, possibly-unsaved local state so
// you can preview before SUBMIT) and the List page's PDF button
// (fed from the persisted Grn record) so the two always render
// byte-identical output.
// =======================================================

export interface GrnwReportItem {
  itemCode: string | null;
  itemName: string;
  batchNo: string | null;
  rcvQtyBox: number;
  rcvQtyPieces: number;
  bonusQtyPieces: number;
  tradePrice: number;
  totalValue: number;
  vatAmt: number;
  discAmt: number;
  mrp: number;
  gpPct: number;
  netTotal: number;
}

export interface GrnwReportTotals {
  totalTradeValue: number;
  totalVat: number;
  totalDiscount: number;
  netAmount: number;
}

export function buildGrnwReportHtml(params: {
  grn: Grn;
  shopName: string | null;
  logoUrl: string | null;
  adminName: string | null;
  items: GrnwReportItem[];
  totals: GrnwReportTotals;
  invoiceDiscount: number;
  invoiceVat: number;
  expiryAdjustmentAmount: number;
}): string {
  const { grn, shopName, logoUrl, adminName, items, totals, invoiceDiscount, invoiceVat, expiryAdjustmentAmount } = params;
  const storeAddr = [grn.store?.address, grn.store?.phone].filter(Boolean).join(" — ");
  const itemRows = items
    .map(
      (it, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${it.itemCode || ""}</td>
        <td>${it.itemName}</td>
        <td>${it.batchNo || ""}</td>
        <td class="right">${it.rcvQtyBox}</td>
        <td class="right">${it.rcvQtyPieces}</td>
        <td class="right">${it.bonusQtyPieces}</td>
        <td class="right">${fmt(it.tradePrice)}</td>
        <td class="right">${fmt(it.totalValue)}</td>
        <td class="right">${fmt(it.vatAmt)}</td>
        <td class="right">${fmt(it.discAmt)}</td>
        <td class="right">${fmt(it.mrp)}</td>
        <td class="right">${it.gpPct.toFixed(2)}</td>
        <td class="right">${fmt(it.netTotal)}</td>
      </tr>`
    )
    .join("");
  return `
    <html><head><title>${grn.transactionNo}</title>
    <style>
      * { box-sizing: border-box; }
      body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111;font-size:12px}
      .header{display:flex;align-items:center;gap:14px;margin-bottom:10px;border-bottom:2px solid #111;padding-bottom:10px}
      .header img{height:52px}
      h1{font-size:19px;margin:0;letter-spacing:.02em}
      .doc-title{font-size:13px;font-weight:bold;color:#374151;margin-top:2px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;margin-bottom:14px;font-size:12px}
      .meta .row{display:flex;justify-content:space-between;border-bottom:1px dotted #ddd;padding:3px 0}
      .meta .row span:first-child{color:#555;font-weight:bold}
      .meta .row span:last-child{font-weight:bold}
      .remarks{margin:8px 0 14px;font-size:12px;color:#374151}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #d1d5db;padding:6px 8px;font-size:11px;text-align:left}
      th{background:#f1f5f9;font-weight:bold;text-transform:uppercase;font-size:10px}
      .right{text-align:right}
      .center{text-align:center}
      tbody tr:nth-child(even){background:#fafafa}
      .totals-wrap{display:flex;justify-content:flex-end;margin-top:14px}
      .totals{width:280px;font-size:12px}
      .totals .row{display:flex;justify-content:space-between;padding:4px 10px;border-bottom:1px solid #eee}
      .totals .row.net{border-top:2px solid #111;border-bottom:none;font-weight:bold;font-size:13px;margin-top:4px;padding-top:8px}
      .words{margin-top:10px;font-size:11.5px;font-style:italic;color:#374151}
      .sign{display:flex;justify-content:space-between;margin-top:70px;font-size:12px}
      .sign div{border-top:1px solid #333;padding-top:5px;width:28%;text-align:center;color:#374151}
    </style></head><body>
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" />` : ""}
      <div>
        <h1>${shopName || ""}</h1>
        ${storeAddr ? `<div style="font-size:11px;color:#555">${storeAddr}</div>` : ""}
        <div class="doc-title">Goods Receipt Note (Without PO)</div>
      </div>
    </div>
    <div class="meta">
      <div class="row"><span>GRN No.</span><span>${grn.transactionNo}</span></div>
      <div class="row"><span>Status</span><span>${statusLabel(grn.status)}</span></div>
      <div class="row"><span>Invoice No.</span><span>${grn.invoiceNo}</span></div>
      <div class="row"><span>Invoice Date</span><span>${toDateInput(grn.invoiceDate)}</span></div>
      <div class="row"><span>Store</span><span>${grn.store?.name || ""}</span></div>
      <div class="row"><span>Supplier</span><span>${grn.supplier?.name || ""}</span></div>
      <div class="row"><span>Payment Mode</span><span>${grn.paymentType}</span></div>
      <div class="row"><span>Transaction Date</span><span>${new Date(grn.createdAt).toLocaleString()}</span></div>
    </div>
    ${grn.remarks ? `<div class="remarks"><b>Remarks:</b> ${grn.remarks}</div>` : ""}
    <table><thead><tr>
      <th>Sl</th><th>Item No</th><th>Item Name</th><th>Batch</th>
      <th class="right">Box</th><th class="right">Pcs</th><th class="right">Bonus</th>
      <th class="right">Unit Price</th><th class="right">Total</th><th class="right">VAT</th>
      <th class="right">Disc.</th><th class="right">MRP</th><th class="right">GP%</th><th class="right">Net Total</th>
    </tr></thead><tbody>${itemRows}</tbody></table>
    <div class="totals-wrap">
      <div class="totals">
        <div class="row"><span>Total Amount</span><span>${fmt4(totals.totalTradeValue)}</span></div>
        <div class="row"><span>Total VAT</span><span>${fmt4(totals.totalVat)}</span></div>
        <div class="row"><span>Total Discount</span><span>${fmt4(totals.totalDiscount)}</span></div>
        <div class="row"><span>Invoice Discount</span><span>${fmt4(invoiceDiscount)}</span></div>
        <div class="row"><span>Invoice VAT</span><span>${fmt4(invoiceVat)}</span></div>
        <div class="row"><span>Exp. Adjustment</span><span>${fmt4(expiryAdjustmentAmount)}</span></div>
        <div class="row net"><span>Net Amount</span><span>${fmt4(totals.netAmount)}</span></div>
      </div>
    </div>
    <div class="words">In Words: ${amountInWords(totals.netAmount)}</div>
    <div class="sign">
      <div>${grn.receivedBy?.name || ""}<br/>Received By</div>
      <div>${grn.createdBy?.name || adminName || ""}<br/>Entry By</div>
      <div>${grn.approvedBy?.name || ""}<br/>Approved By</div>
    </div>
    </body></html>
  `;
}
