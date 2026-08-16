"use client";

import React from "react";
import { X, Printer } from "lucide-react";
import { useShopSession } from "../context/ShopSessionContext";
import { Sale } from "../types";

interface InvoiceModalProps {
  sale: Sale;
  onClose: () => void;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}
function threeDigitWords(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return (h ? ONES[h] + " Hundred" + (rest ? " " : "") : "") + (rest ? twoDigitWords(rest) : "");
}
// Bangladeshi numbering (Lakh/Crore) — this is a BDT invoice.
function amountInWords(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return "Zero";
  let remaining = n;
  const crore = Math.floor(remaining / 10000000);
  remaining %= 10000000;
  const lakh = Math.floor(remaining / 100000);
  remaining %= 100000;
  const thousand = Math.floor(remaining / 1000);
  remaining %= 1000;
  const hundred = remaining;
  const parts: string[] = [];
  if (crore) parts.push(threeDigitWords(crore) + " Crore");
  if (lakh) parts.push(threeDigitWords(lakh) + " Lakh");
  if (thousand) parts.push(threeDigitWords(thousand) + " Thousand");
  if (hundred) parts.push(threeDigitWords(hundred));
  return parts.join(" ").trim() || "Zero";
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ sale, onClose }) => {
  const { shopName, logoUrl } = useShopSession();
  const handlePrint = () => window.print();

  const created = new Date(sale.createdAt);
  const prdmCount = sale.items.filter((i) => i.isPrdm).length;
  const selfOrHd = sale.deliveryMode === "DELIVERY" ? "HD" : "Self";

  return (
    <div id="invoice-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 select-none">
      {/* A real 58mm thermal-receipt page, not a shrunk-onto-A4 printout —
          that mismatch (full-size page + tiny fonts trying to compensate)
          is what made prior prints both oversized and blurry. Constraining
          the page itself is what makes the receipt small; the text stays a
          normal, legible size. The card wrapper's max-h-[90vh]/overflow-y-auto
          (needed for the on-screen preview) clips whatever wasn't scrolled
          into view — including Conditions Apply near the bottom — when
          printed, so both get reset to visible/none for print specifically. */}
      <style>{`
        @media print {
          @page { size: 58mm auto; margin: 3mm; }
          body * { visibility: hidden; }
          #printable-receipt, #printable-receipt * { visibility: visible; }
          #invoice-modal-overlay {
            position: static !important;
            display: block !important;
            background: none !important;
            backdrop-filter: none !important;
            padding: 0 !important;
          }
          #invoice-modal-card {
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          #printable-receipt {
            width: 100%;
            max-width: 100%;
            font-size: 11px;
            border: none !important;
            border-radius: 0 !important;
          }
          /* A long, unbroken item/generic name (common on pharmacy labels)
             could otherwise force the items table — and with it the whole
             receipt, since the card above sizes to fit its content — wider
             than the 58mm page. Anything past the page edge on a thermal
             roll printer doesn't wrap to a "next page" like on paper, it's
             just gone — which is what was silently swallowing the
             Conditions Apply block at the bottom. Forcing every line to
             wrap within the page width, not just the table, closes that off
             for any other unusually long field too (address, org name). */
          #printable-receipt, #printable-receipt * {
            word-break: break-word;
            overflow-wrap: break-word;
          }
        }
      `}</style>
      <div id="invoice-modal-card" className="bg-white border border-slate-300 rounded-xl max-w-sm w-full p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4 print:hidden">
          <span className="text-base font-black text-slate-900">Billing Invoice Ready</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div id="printable-receipt" className="bg-white text-slate-900 p-3 border border-slate-300 rounded-lg text-[11px] font-semibold space-y-2">
          <div className="text-center pb-2 relative">
            {logoUrl && <img src={logoUrl} alt={shopName} className="absolute right-0 top-0 h-9 w-auto object-contain" />}
            <h2 className="text-base font-black tracking-tight text-slate-900 uppercase">{shopName}</h2>
            {sale.store?.name && <p className="text-[10px] text-slate-600 font-bold">{sale.store.name}</p>}
          </div>

          <div className="border-t border-b border-dashed border-slate-400 py-1.5 space-y-0.5">
            <div className="flex justify-between">
              <span>Inv.No. : {sale.invoiceNo}</span>
              <span>Cust.ID : {sale.customer?.customerCode || ""}</span>
            </div>
            <div>Name : {sale.customer?.name || "WALK-IN CUSTOMER"}</div>
            <div className="flex justify-between">
              <span>Mobile : {sale.customer?.mobile || ""}</span>
              <span>Gender : {sale.customer?.gender ? sale.customer.gender.charAt(0) + sale.customer.gender.slice(1).toLowerCase() : ""}</span>
            </div>
            <div className="flex justify-between">
              <span>Address : {sale.customer?.address || ""}</span>
              <span>Self/HD : {selfOrHd}</span>
            </div>
            <div className="flex justify-between">
              <span>Org.Name : {sale.customer?.orgName || ""}</span>
              <span>EID/PF : {sale.customer?.employeeId || ""}</span>
            </div>
            <div className="flex justify-between">
              <span>{created.toLocaleDateString("en-GB")}</span>
              <span>{created.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true })}</span>
            </div>
          </div>

          <table className="w-full table-fixed text-[10px]">
            <thead>
              <tr className="border-b border-slate-400 font-black uppercase">
                <th className="text-left py-1 w-[8%]">Sl</th>
                <th className="text-left py-1 w-[38%]">Item Name</th>
                <th className="text-right py-1 w-[16%]">Batch</th>
                <th className="text-right py-1 w-[12%]">Qty</th>
                <th className="text-right py-1 w-[12%]">MRP</th>
                <th className="text-right py-1 w-[14%]">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, i) => (
                <tr key={item.id} className="align-top">
                  <td className="py-1">{i + 1}.</td>
                  <td className="py-1 wrap-break-word">
                    {item.productNameSnapshot}
                    {item.isFree && <span className="text-red-600"> (FREE)</span>}
                  </td>
                  <td className="text-right py-1 wrap-break-word">{item.batchNoSnapshot}</td>
                  <td className="text-right py-1">{item.qty}</td>
                  <td className="text-right py-1">{item.mrp.toFixed(0)}</td>
                  <td className="text-right py-1">{item.total.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-dashed border-slate-400 pt-1.5">
            In Words: {amountInWords(sale.receivable)} Taka Only.
          </div>

          <div className="border-t border-dashed border-slate-400 pt-1.5 flex justify-between gap-2">
            <div className="text-[10px] space-y-0.5">
              {sale.paidCash > 0 && <div>Cash : {sale.paidCash.toFixed(0)}</div>}
              {sale.paidCard > 0 && <div>Card : {sale.paidCard.toFixed(0)}</div>}
              {sale.paidMobileBanking > 0 && <div>Mobile Banking : {sale.paidMobileBanking.toFixed(0)}</div>}
            </div>
            <div className="text-right space-y-0.5 flex-1">
              <div className="flex justify-between"><span>Sub Total :</span><span>{sale.itemAmount.toFixed(0)}</span></div>
              <div className="flex justify-between"><span>Promo. Cost :</span><span>{sale.discAmt.toFixed(0)}</span></div>
              <div className="flex justify-between"><span>VAT :</span><span>{sale.vatAmount.toFixed(0)}</span></div>
              <div className="flex justify-between"><span>Adjustment :</span><span>{sale.adjustAmount.toFixed(2)}</span></div>
              <div className="flex justify-between font-black border-t border-slate-300 pt-0.5"><span>Net Payable :</span><span>{sale.receivable.toFixed(0)}</span></div>
              <div className="flex justify-between"><span>Paid :</span><span>{sale.paidAmount.toFixed(0)}</span></div>
              <div className="flex justify-between"><span>Due :</span><span>{sale.dueAmount.toFixed(0)}</span></div>
              <div className="flex justify-between"><span>Change :</span><span>0</span></div>
              <div className="flex justify-between"><span>Rwd. Points :</span><span>0</span></div>
              <div className="flex justify-between"><span>PRDM :</span><span>{prdmCount}</span></div>
              <div className="flex justify-between"><span>Rwd. Balance :</span><span>{(sale.customer?.rewardBalance ?? 0).toFixed(0)}</span></div>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-400 pt-1.5 text-[9px] text-slate-600 space-y-0.5">
            <p className="font-black text-slate-800">Conditions Apply :</p>
            <p>1. We don&apos;t receive return / exchange after 72 hours of sold</p>
            <p>2. Without invoice copy no return or exchange is applicable</p>
            <p>3. In-case of strip/packaging damage, no return/exchange is applicable</p>
            <p>4. Cold chain-maintained products cannot be returned / exchanged</p>
            <p>5. We don&apos;t receive return/exchange of FREE/OFFERED/PRDM products</p>
            <p>6. Return Policy: instead of cash, product exchange is applicable</p>
          </div>

          <div className="text-center pt-1.5 space-y-0.5 text-slate-700 text-[10px]">
            <p className="font-black text-slate-900">Thanks For Coming At {shopName}</p>
            <p>Srvd by : {sale.cashier?.name || ""}</p>
            <p>Powered by Algo Craft Software LTD</p>
            <p>{created.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} {created.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}</p>
            <p className="font-black text-slate-900 pt-1">We&apos;ll Treat You Well</p>
          </div>

          {(sale.store?.address || sale.store?.phone) && (
            <div className="border-t border-dashed border-slate-400 pt-1.5 text-center text-[9px] text-slate-600">
              {sale.store?.name ? `${sale.store.name}: ` : ""}
              {sale.store?.address}
              {sale.store?.phone ? `, Phone: ${sale.store.phone}` : ""}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 mt-5 print:hidden">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-sm"
          >
            Close
          </button>
          <button
            onClick={handlePrint}
            className="px-6 py-2.5 rounded-lg bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-black text-sm shadow-md flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Print Thermal Bill</span>
          </button>
        </div>
      </div>
    </div>
  );
};
