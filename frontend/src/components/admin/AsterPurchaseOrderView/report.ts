import { PurchaseOrder } from "../../../types";
import { fmt } from "../../../lib/format";

// =======================================================
// Shared report/PDF template — used by BOTH the List page's
// PDF button and the Detail page's REPORT button, so the two
// can never drift apart into two different-looking reports
// again. Requires the FULL order (with items) — the List page
// must fetch that first, since its own row data doesn't include
// items.
// =======================================================

export function buildPoReportHtml(params: {
  order: PurchaseOrder;
  shopName: string | null;
  logoUrl: string | null;
  preparedBySignatureUrl: string | null;
  reviewedBySignatureUrl: string | null;
  approvedBySignatureUrl: string | null;
  shopAddress: string | null;
  shopPhone: string | null;
}): string {
  const { order, shopName, logoUrl, preparedBySignatureUrl, reviewedBySignatureUrl, approvedBySignatureUrl, shopAddress, shopPhone } = params;
  const shopContactLine = [shopAddress, shopPhone].filter(Boolean).join(" — ");
  const items = order.items || [];
  const itemRows = items
    .map(
      (it, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${it.product.externalCode || ""}</td>
        <td>${it.product.name}</td>
        <td>${it.product.unit}</td>
        <td class="right">${it.product.boxQty}</td>
        <td class="right">${it.qtyBox}</td>
        <td class="right">${it.qtyPieces}</td>
        <td class="right">${fmt(it.ppPerPiece)}</td>
        <td class="right">${fmt(it.mrpPerPiece)}</td>
        <td class="right">${fmt(it.totalValue)}</td>
      </tr>`
    )
    .join("");
  return `
    <html><head><title>${order.orderNo || "Purchase Order"}</title>
    <style>
      * { box-sizing: border-box; }
      body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111;font-size:12px}
      .header{display:flex;align-items:center;gap:14px;margin-bottom:10px;border-bottom:2px solid #111;padding-bottom:10px}
      .header img{height:52px}
      h1{font-size:19px;margin:0;letter-spacing:.02em}
      .doc-title{font-size:14px;font-weight:bold;text-align:center;margin:14px 0}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:3px 24px;margin-bottom:14px;font-size:12px}
      .meta .row{display:flex;border-bottom:1px dotted #ddd;padding:3px 0}
      .meta .row span:first-child{color:#555;font-weight:bold;width:120px;shrink:0}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #d1d5db;padding:6px 8px;font-size:11px;text-align:left}
      th{background:#f1f5f9;font-weight:bold;text-transform:uppercase;font-size:10px}
      .right{text-align:right}
      tbody tr:nth-child(even){background:#fafafa}
      .total-row{display:flex;justify-content:flex-end;margin-top:8px;font-size:13px;font-weight:bold}
      .sign{display:flex;justify-content:space-between;margin-top:70px;font-size:12px}
      .sign div{border-top:1px solid #333;padding-top:5px;width:28%;text-align:center;color:#374151}
      .sign img{height:40px;margin-top:-46px;margin-bottom:4px;object-fit:contain}
      .terms{margin-top:40px;font-size:10.5px;color:#374151}
      .terms ol{margin:4px 0 0;padding-left:18px}
      .terms li{margin-bottom:2px}
    </style></head><body>
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" />` : ""}
      <div>
        <h1>${shopName || ""}</h1>
        ${shopContactLine ? `<div style="font-size:11px;color:#555">${shopContactLine}</div>` : ""}
      </div>
    </div>
    <div class="doc-title">Purchase Order (PO)</div>
    <div class="meta">
      <div class="row"><span>Vendor Name</span><span>${order.supplier?.name || ""}</span></div>
      <div class="row"><span>Order No</span><span>${order.orderNo || ""}</span></div>
      <div class="row"><span>Contact No</span><span>${order.supplier?.contact || ""}</span></div>
      <div class="row"><span>Date Time</span><span>${new Date(order.createdAt).toLocaleString()}</span></div>
      <div class="row"><span>Delivery Address</span><span>${shopAddress || ""}</span></div>
      <div class="row"><span>Delivery Date</span><span>${order.expectedDate ? new Date(order.expectedDate).toLocaleDateString() : ""}</span></div>
      <div class="row"><span>Delivery To</span><span>${shopName || ""}</span></div>
      <div class="row"><span>Remarks</span><span>${order.remarks || ""}</span></div>
    </div>
    <table><thead><tr>
      <th>Sl.</th><th>Item Code</th><th>Product Name</th><th>UOM</th><th class="right">Pack Size</th>
      <th class="right">Order Qty(Box)</th><th class="right">Order Qty(Pcs)</th>
      <th class="right">Unit Price</th><th class="right">MRP</th><th class="right">Total Price</th>
    </tr></thead><tbody>${itemRows}</tbody></table>
    <div class="total-row">Total: ${fmt(order.totalPPAmount)}</div>
    <div class="sign">
      <div>${preparedBySignatureUrl ? `<img src="${preparedBySignatureUrl}" /><br/>` : ""}Prepared By</div>
      <div>${reviewedBySignatureUrl ? `<img src="${reviewedBySignatureUrl}" /><br/>` : ""}Reviewed By</div>
      <div>${approvedBySignatureUrl ? `<img src="${approvedBySignatureUrl}" /><br/>` : ""}Approved By</div>
    </div>
    <div class="terms">
      <ol>
        <li>We reserve the right to cancel the order if the goods delivered are not up to the standard.</li>
        <li>The delivered products should have an expiry of at least 75% from the date of their manufacture.</li>
        <li>Please ensure that your rates comply with your quotation.</li>
        <li>Any remainder of a partially delivered purchase order will be invalid.</li>
        <li>If the quantity exceeds the purchase order, it will not be accepted unless the pack size has been changed.</li>
        <li>In order to ensure prompt payment, invoices and other documents related to the order must bear the purchase order number.</li>
        <li>Kindly attach the purchase order and challan along with the invoice.</li>
      </ol>
    </div>
    </body></html>
  `;
}
