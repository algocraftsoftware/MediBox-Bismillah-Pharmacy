"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, UserPlus } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Spinner } from "../../../components/Spinner";
import { BatchSearchResult, CartLine, Customer, Sale } from "../../../types";
import { InvoiceModal } from "../../InvoiceModal";
import { AddCustomerModal } from "../AsterCustomerRegistrationView";
import { DELIVERY_TYPES } from "./constants";
import { BANGLADESH_BANKS, CARD_TYPES, MOBILE_BANKING_TYPES } from "../../../lib/bdPaymentOptions";
import { blockNegativeKeys, blockNonIntegerKeys, calcAge } from "./helpers";
import { TypeaheadInput } from "../TypeaheadInput";
import { ErrorBanner } from "../ErrorBanner";
import { MobileNumberInput } from "../MobileNumberInput";

export const AsterBillingView: React.FC = () => {
  const { shopSlug, token, selectedStoreId, stores, setSelectedStoreId } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  // Customer — looked up by Cust Id or Mobile No, both press-Enter to fetch.
  const [custId, setCustId] = useState("");
  const [mobileNo, setMobileNo] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custError, setCustError] = useState<string | null>(null);
  const [drName, setDrName] = useState("");
  const [drAddress, setDrAddress] = useState("");
  const [prescriptionId, setPrescriptionId] = useState("");
  const [consultationId, setConsultationId] = useState("");

  // Item search
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [results, setResults] = useState<BatchSearchResult[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const resultRowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<BatchSearchResult | null>(null);
  const [itemQty, setItemQty] = useState<string>("");
  const [isFree, setIsFree] = useState(false);
  const [isPrdm, setIsPrdm] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [itemDropdownOpen, setItemDropdownOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemNameRef = useRef<HTMLInputElement | null>(null);
  const itemQtyRef = useRef<HTMLInputElement | null>(null);
  const itemSearchContainerRef = useRef<HTMLDivElement | null>(null);

  // Cart
  const [cart, setCart] = useState<CartLine[]>([]);

  // Discount / payment / footer
  const [discountType, setDiscountType] = useState("General Discount");
  const [discAmt, setDiscAmt] = useState<number>(0);
  const [discPct, setDiscPct] = useState<number>(0);
  const [remarks, setRemarks] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [deliveryType, setDeliveryType] = useState("");
  const [paidCash, setPaidCash] = useState<number>(0);
  const [givenAmount, setGivenAmount] = useState<number>(0);
  const [paidMobileBanking, setPaidMobileBanking] = useState<number>(0);
  const [mobileBankingType, setMobileBankingType] = useState("");
  const [transactionNumber, setTransactionNumber] = useState("");
  const [paidCard, setPaidCard] = useState<number>(0);
  const [cardType, setCardType] = useState("");
  const [bankName, setBankName] = useState("");
  const cashAmountRef = useRef<HTMLInputElement | null>(null);
  const givenAmountRef = useRef<HTMLInputElement | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<Sale | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);

  const showBanner = (message: string) => {
    setBanner(message);
    window.setTimeout(() => setBanner((cur) => (cur === message ? null : cur)), 4500);
  };

  useEffect(() => {
    if (query.trim().length < 2 || !selectedStoreId) {
      setResults([]);
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      api
        .searchProducts(query, selectedStoreId)
        .then((res) => {
          setResults(res);
          setHighlightedIndex(0);
          setItemDropdownOpen(true);
        })
        .catch(() => setResults([]));
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, selectedStoreId, api]);

  // Hide the item-search dropdown on outside click; it reopens on focus/typing.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (itemSearchContainerRef.current && !itemSearchContainerRef.current.contains(e.target as Node)) {
        setItemDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectResult = (r: BatchSearchResult) => {
    setSelectedBatch(r);
    setQuery(r.productName);
    setResults([]);
    setItemDropdownOpen(false);
    setItemQty("");
    // Move straight into quantity entry so the cashier never needs the mouse.
    setTimeout(() => {
      itemQtyRef.current?.focus();
    }, 0);
  };

  // Keyboard nav moves the highlight, but the results list needs to be told
  // to scroll — without this the highlighted row can move past the visible
  // area while the scrollbar stays put, hiding the very item being picked.
  useEffect(() => {
    resultRowRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const handleItemNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0 || !itemDropdownOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[highlightedIndex] || results[0];
      if (r) selectResult(r);
    }
  };

  const handleItemQtyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    blockNonIntegerKeys(e);
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddItem();
    }
  };

  const lookupCustomer = async (field: "id" | "mobile") => {
    const value = field === "id" ? custId.trim() : mobileNo.trim();
    if (!value) return;
    setCustError(null);
    try {
      const matches = await api.searchCustomers(field === "id" ? { customerCode: value } : { mobile: value });
      if (matches.length === 0) {
        const { default: Swal } = await import("sweetalert2");
        Swal.fire({
          icon: "warning",
          title: "Customer Not Found",
          text: "No customer found — proceeding as walk-in",
          confirmButtonColor: "#ADEBB3",
        });
        setCustError("No customer found — proceeding as walk-in");
        setCustomer(null);
        return;
      }
      const found = matches[0];
      setCustomer(found);
      setCustId(found.customerCode);
      setMobileNo(found.mobile);
    } catch (err) {
      setCustError(err instanceof ApiError ? err.message : "Lookup failed");
    }
  };

  const handleBarcodeEnter = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !barcode.trim() || !selectedStoreId) return;
    try {
      const batch = await api.findByBarcode(barcode.trim(), selectedStoreId);
      setSelectedBatch(batch);
      setQuery(batch.productName);
      setResults([]);
      setItemQty("");
      setTimeout(() => itemQtyRef.current?.focus(), 0);
    } catch {
      setAddError("No product found for that barcode");
    }
  };

  const handleAddItem = () => {
    setAddError(null);
    if (!selectedBatch) return;
    const qtyNum = Math.floor(Number(itemQty));
    if (!itemQty || !qtyNum || qtyNum <= 0) {
      setAddError("Enter an item quantity");
      itemQtyRef.current?.focus();
      return;
    }
    const qty = qtyNum;
    if (qty > selectedBatch.stockQty) {
      showBanner("please enter item qty less then stock qty.");
      return;
    }
    const alreadyInCart = cart.some((c) => c.batchId === selectedBatch.batchId);
    if (alreadyInCart) {
      showBanner("Item already added!");
      return;
    }

    setCart([
      ...cart,
      {
        batchId: selectedBatch.batchId,
        productId: selectedBatch.productId,
        productName: selectedBatch.productName,
        genericName: selectedBatch.genericName,
        // Carried straight through from the search result, so the cart shows
        // exactly the category the dropdown showed for the same batch.
        displayCategory: selectedBatch.displayCategory,
        supplierName: selectedBatch.supplierName,
        uom: selectedBatch.unit,
        vatPct: selectedBatch.vatPct,
        discPct: selectedBatch.discPct,
        batchNo: selectedBatch.batchNo,
        expiryDate: selectedBatch.expiryDate,
        stockQty: selectedBatch.stockQty,
        mrp: selectedBatch.mrp,
        sellingPrice: selectedBatch.sellingPrice,
        qty,
        isFree,
        isPrdm,
        controlledClass: selectedBatch.controlledClass,
      },
    ]);
    setSelectedBatch(null);
    setQuery("");
    setBarcode("");
    setItemQty("");
    setIsFree(false);
    setIsPrdm(false);
    setResults([]);
    setItemDropdownOpen(false);
    setTimeout(() => itemNameRef.current?.focus(), 0);
  };

  // Allows the box to sit at 0 (visually empty, via value={item.qty || ""})
  // while the cashier is mid-edit — e.g. backspacing "10" down to retype a
  // new number — instead of snapping back to 1 on every keystroke. The
  // floor of 1 is only enforced once editing finishes, in onBlur below.
  const handleUpdateQty = (batchId: number, qty: number) => {
    setCart(cart.map((c) => (c.batchId === batchId ? { ...c, qty: Math.max(0, Math.min(qty, c.stockQty)) } : c)));
  };

  const handleQtyBlur = (batchId: number) => {
    setCart(cart.map((c) => (c.batchId === batchId && c.qty < 1 ? { ...c, qty: 1 } : c)));
  };

  const handleRemove = (batchId: number) => {
    setCart(cart.filter((c) => c.batchId !== batchId));
  };

  const lineAmt = (c: CartLine) => (c.isFree ? 0 : c.sellingPrice * c.qty);
  const lineDiscAmt = (c: CartLine) => (lineAmt(c) * c.discPct) / 100;
  const lineVatAmt = (c: CartLine) => ((lineAmt(c) - lineDiscAmt(c)) * c.vatPct) / 100;
  const lineTotal = (c: CartLine) => lineAmt(c) - lineDiscAmt(c) + lineVatAmt(c);

  const itemAmount = useMemo(() => cart.reduce((acc, c) => acc + lineAmt(c), 0), [cart]);
  const vatAmount = useMemo(() => cart.reduce((acc, c) => acc + lineVatAmt(c), 0), [cart]);
  const totalAmount = itemAmount + vatAmount;
  const resolvedDiscAmt = Number(discAmt) || 0;
  // The overall bill discount (Disc. Amt / Disc. Pct in the footer) is spread
  // proportionally across every line by its share of the pre-discount total,
  // so the cart grid's Disc./Disc% columns show how much of that one discount
  // landed on each item — e.g. a 5% invoice discount shows as 5% + its taka
  // share on every line, not each batch's own (usually zero) discPct.
  const overallDiscPctApplied = totalAmount > 0 ? (resolvedDiscAmt / totalAmount) * 100 : 0;
  const lineProportionalDiscAmt = (c: CartLine) => (lineAmt(c) * overallDiscPctApplied) / 100;
  const netAmount = Math.max(0, totalAmount - resolvedDiscAmt);
  // Auto round to the nearest whole currency unit — cash tender convenience.
  const receivable = Math.round(netAmount);
  const adjustAmount = receivable - netAmount;
  const paidAmount = (Number(paidCash) || 0) + (Number(paidMobileBanking) || 0) + (Number(paidCard) || 0);
  const dueAmount = Math.max(0, receivable - paidAmount);
  const changeAmount = Math.max(0, (Number(givenAmount) || 0) - (Number(paidCash) || 0));

  const handleDiscPctChange = (val: number) => {
    setDiscPct(val);
    const computed = val ? (totalAmount * val) / 100 : 0;
    setDiscAmt(Math.round(computed * 100) / 100);
  };

  const handleClearCustomer = () => {
    setCustId("");
    setMobileNo("");
    setCustomer(null);
    setCustError(null);
    setDrName("");
    setDrAddress("");
  };

  const handleNewOrder = () => {
    setCart([]);
    setDiscAmt(0);
    setDiscPct(0);
    setDeliveryMode("PICKUP");
    setDeliveryType("");
    setPaidCash(0);
    setGivenAmount(0);
    setPaidMobileBanking(0);
    setMobileBankingType("");
    setTransactionNumber("");
    setPaidCard(0);
    setCardType("");
    setBankName("");
    setSubmitError(null);
    handleClearCustomer();
  };

  const validateBeforeSubmit = (): string | null => {
    if (cart.length === 0 || !selectedStoreId) return "Add at least one item before submitting.";
    if (deliveryMode === "DELIVERY" && !deliveryType) return "Please select Delivery provider";
    if (paidMobileBanking > 0 && !mobileBankingType) return "Select a Mobile Banking Type for the Mobile Banking amount entered.";
    if (paidCard > 0 && (!cardType || !bankName)) return "Select a Card Type and Bank Name for the Card Payment amount entered.";
    if (paidAmount > receivable + 0.01) return "Over amount, Can't Billing";
    if (dueAmount > 0.01) {
      if (!customer || customer.creditLimit <= 0) {
        return "This customer not eligible for Credit billing, Please fill the amount section";
      }
      const availableCredit = customer.creditLimit - (customer.creditBalance || 0);
      if (dueAmount > availableCredit + 0.01) {
        return "Credit Limit Over, Can't Process The Bill";
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    const validationError = validateBeforeSubmit();
    if (validationError) {
      showBanner(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const sale = await api.createSale({
        storeId: selectedStoreId,
        customerId: customer?.id,
        doctorName: drName || undefined,
        doctorAddress: drAddress || undefined,
        prescriptionId: prescriptionId || undefined,
        consultationId: consultationId || undefined,
        discountType,
        discAmt: resolvedDiscAmt,
        discPct,
        adjustAmount,
        paidCash,
        paidMobileBanking,
        paidCard,
        mobileBankingType: mobileBankingType || undefined,
        transactionNumber: transactionNumber || undefined,
        cardType: cardType || undefined,
        bankName: bankName || undefined,
        deliveryMode,
        deliveryType: deliveryMode === "DELIVERY" ? deliveryType || undefined : undefined,
        remarks,
        items: cart.map((c) => ({ batchId: c.batchId, qty: c.qty, isFree: c.isFree, isPrdm: c.isPrdm })),
      });
      setLastSale(sale);
      setShowInvoice(true);
      handleNewOrder();
      // Lets an already-mounted Pharmacy Dashboard refresh its Collection
      // numbers immediately instead of waiting on its next poll/focus.
      window.dispatchEvent(new CustomEvent("medibox:sale-created"));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not complete sale";
      setSubmitError(message);
      showBanner(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGivenAmountEnter = async () => {
    const validationError = validateBeforeSubmit();
    if (validationError) {
      showBanner(validationError);
      return;
    }
    const { default: Swal } = await import("sweetalert2");
    const result = await Swal.fire({
      icon: "warning",
      title: "Critical Warning!",
      text: "Do you want to submit?",
      showCancelButton: true,
      confirmButtonText: "YES",
      cancelButtonText: "NO",
      confirmButtonColor: "#ADEBB3",
      cancelButtonColor: "#dc2626",
      reverseButtons: false,
    });
    if (result.isConfirmed) {
      handleSubmit();
    }
  };

  const custTypeLabel = customer
    ? `${customer.custType}${customer.orgName ? ` (${customer.orgName})` : ""}`
    : "WALK-IN";

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-[#f8fafc] text-slate-900 font-sans overflow-y-auto select-none pr-1">
      {banner && <ErrorBanner message={banner} onClose={() => setBanner(null)} />}

      {/* Customer Information */}
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-12 gap-2.5 items-center text-xs">
          {/* Row 1 */}
          <div className="col-span-3 flex items-center gap-1.5">
            <label className="w-24 font-bold text-slate-800">Cust. Id<span className="text-red-600">*</span></label>
            <button
              onClick={() => setShowAddCustomerModal(true)}
              className="bg-[#ADEBB3] text-slate-900 p-1 rounded flex items-center justify-center shadow-sm"
              title="Register new customer"
            >
              <UserPlus className="w-4 h-4" />
            </button>
            <input
              type="text"
              value={custId}
              onChange={(e) => setCustId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupCustomer("id")}
              className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-900 focus:border-[#ADEBB3] outline-none"
            />
          </div>

          <div className="col-span-3 flex items-center gap-1.5">
            <label className="w-24 font-bold text-slate-800">Mobile No.<span className="text-red-600">*</span></label>
            <MobileNumberInput
              value={mobileNo}
              onChange={setMobileNo}
              onKeyDown={(e) => e.key === "Enter" && lookupCustomer("mobile")}
              placeholder="Enter phone & press Enter"
              className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-900 focus:border-[#ADEBB3] outline-none"
            />
          </div>

          <div className="col-span-2 flex items-center gap-1.5">
            <label className="w-20 font-bold text-slate-800">Emp. Id/PF</label>
            <input
              type="text"
              readOnly
              value={customer?.employeeId || ""}
              className="w-full bg-slate-100 border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-900"
            />
          </div>

          <div className="col-span-3 flex items-center gap-1.5">
            <label className="w-24 font-bold text-slate-800">Cust. Type<span className="text-red-600">*</span></label>
            <div className="flex-1 bg-slate-100 border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-900 truncate">
              {custTypeLabel}
            </div>
          </div>

          <div className="col-span-1 text-right">
            <button
              onClick={handleClearCustomer}
              className="w-full bg-[#dc2626] hover:bg-red-700 text-white font-extrabold py-1 rounded text-xs shadow-sm"
            >
              CLEAR
            </button>
          </div>

          {/* Row 2 */}
          <div className="col-span-3 flex items-center gap-1.5 mt-1">
            <label className="w-24 font-bold text-slate-800">Cust. Name<span className="text-red-600">*</span></label>
            <input
              type="text"
              readOnly
              value={customer?.name || ""}
              className="flex-1 bg-slate-100 border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-900"
            />
          </div>

          <div className="col-span-3 flex items-center gap-1.5 mt-1">
            <label className="w-24 font-bold text-slate-800">Cust. Address</label>
            <input
              type="text"
              readOnly
              value={customer?.address || ""}
              className="flex-1 bg-slate-100 border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-900"
            />
          </div>

          <div className="col-span-2 flex items-center gap-1.5 mt-1">
            <label className="w-20 font-bold text-slate-800">Org. Name</label>
            <input
              type="text"
              readOnly
              value={customer?.orgName || ""}
              className="w-full bg-slate-100 border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-900"
            />
          </div>

          <div className="col-span-4 flex items-center gap-1.5 mt-1">
            <label className="w-24 font-bold text-slate-800">Desig./Dept.</label>
            <input
              type="text"
              readOnly
              value={customer?.designation || ""}
              className="flex-1 bg-slate-100 border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-900"
            />
          </div>

          {custError && (
            <div className="col-span-12 text-amber-700 font-bold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {custError}
            </div>
          )}

          {/* Row 3 */}
          <div className="col-span-3 flex items-center gap-1.5 mt-1">
            <label className="w-24 font-bold text-slate-800">Gender & Age</label>
            <input
              type="text"
              readOnly
              value={customer?.gender || ""}
              className="w-24 bg-slate-100 border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-900"
            />
            <input
              type="text"
              readOnly
              placeholder="Age"
              value={calcAge(customer?.birthDate ?? null)}
              className="flex-1 bg-slate-100 border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-900"
            />
          </div>

          <div className="col-span-3 flex items-center gap-1.5 mt-1">
            <label className="w-24 font-bold text-slate-800">Dr. Name</label>
            <input
              type="text"
              value={drName}
              onChange={(e) => setDrName(e.target.value)}
              className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1 font-bold"
            />
          </div>

          <div className="col-span-2 flex items-center gap-1.5 mt-1">
            <label className="w-24 font-bold text-slate-800">Dr. Address</label>
            <input
              type="text"
              value={drAddress}
              onChange={(e) => setDrAddress(e.target.value)}
              className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1 font-bold"
            />
          </div>

          <div className="col-span-4 flex items-center gap-1.5 mt-1">
            <label className="w-24 font-bold text-slate-800">Pres/Con No.</label>
            <input
              type="text"
              placeholder="Prescription Id"
              value={prescriptionId}
              onChange={(e) => setPrescriptionId(e.target.value)}
              className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 font-semibold"
            />
            <input
              type="text"
              placeholder="Consultation Id"
              value={consultationId}
              onChange={(e) => setConsultationId(e.target.value)}
              className="flex-1 bg-white border border-slate-300 rounded px-2 py-1 text-slate-700 font-semibold"
            />
          </div>
        </div>
      </div>

      {/* Item Entry */}
      <div className="bg-[#f1f5f9] border-b border-slate-300 px-4 py-3 flex items-center justify-between text-sm gap-3">
        <div className="flex items-center gap-4 flex-1">
          <div ref={itemSearchContainerRef} className="flex-1 max-w-2xl relative">
            <label className="text-xs font-extrabold text-slate-700 block mb-1">Item Name</label>
            <input
              ref={itemNameRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedBatch(null);
                setItemDropdownOpen(true);
              }}
              onFocus={() => {
                if (results.length > 0) setItemDropdownOpen(true);
              }}
              onKeyDown={handleItemNameKeyDown}
              placeholder="Type product name or generic name..."
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-bold text-slate-900 focus:border-[#ADEBB3] outline-none"
            />
            {itemDropdownOpen && results.length > 0 && !selectedBatch && (
              <div className="absolute left-0 top-full mt-1 w-180 bg-white border border-slate-300 rounded shadow-xl z-40 max-h-72 overflow-y-auto">
                <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-bold uppercase sticky top-0">
                      <th className="py-4 px-2.5 border border-slate-300 w-[18%] truncate">Item Name</th>
                      <th className="py-4 px-2.5 border border-slate-300 w-[17%] truncate">Generic Name</th>
                      <th className="py-4 px-2.5 border border-slate-300 w-[16%] truncate">Category Name</th>
                      <th className="py-4 px-2.5 border border-slate-300 w-[14%] truncate">Supplier</th>
                      <th className="py-4 px-2.5 border border-slate-300 w-[10%] truncate">Batch</th>
                      <th className="py-4 px-2.5 border border-slate-300 text-right w-[9%] truncate">Stock</th>
                      <th className="py-4 px-2.5 border border-slate-300 w-[10%] truncate">Exp.Date</th>
                      <th className="py-4 px-2.5 border border-slate-300 text-right w-[6%] truncate">MRP</th>
                    </tr>
                  </thead>
                  <tbody className="whitespace-nowrap">
                    {results.map((r, i) => (
                      <tr
                        key={r.batchId}
                        ref={(el) => {
                          resultRowRefs.current[i] = el;
                        }}
                        onMouseEnter={() => setHighlightedIndex(i)}
                        onClick={() => selectResult(r)}
                        className={`cursor-pointer ${
                          i === highlightedIndex ? "bg-emerald-100" : "odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50"
                        }`}
                      >
                        <td className="py-4 px-2.5 border border-slate-200 font-black text-slate-900 truncate">{r.productName}</td>
                        <td className="py-4 px-2.5 border border-slate-200 text-slate-500 font-semibold truncate">{r.genericName}</td>
                        <td className="py-4 px-2.5 border border-slate-200 text-slate-600 truncate">{r.displayCategory || "—"}</td>
                        <td className="py-4 px-2.5 border border-slate-200 text-slate-600 truncate max-w-30">{r.supplierName || "—"}</td>
                        <td className="py-4 px-2.5 border border-slate-200 font-bold text-slate-700 truncate">{r.batchNo}</td>
                        <td className="py-4 px-2.5 border border-slate-200 text-right font-bold truncate">{r.stockQty}</td>
                        <td className="py-4 px-2.5 border border-slate-200 text-slate-500 truncate">{r.expiryDate.split("T")[0]}</td>
                        <td className="py-4 px-2.5 border border-slate-200 text-right font-bold truncate">{r.sellingPrice.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="w-32">
            <label className="text-xs font-extrabold text-slate-700 block mb-1">Barcode</label>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={handleBarcodeEnter}
              placeholder="Scan / enter"
              className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-bold"
            />
          </div>

          <div className="w-28">
            <label className="text-xs font-extrabold text-slate-700 block mb-1">Sales Price</label>
            <input
              type="text"
              readOnly
              value={selectedBatch ? selectedBatch.sellingPrice.toFixed(2) : ""}
              className="w-full bg-slate-200 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-extrabold"
            />
          </div>

          <div className="w-28">
            <label className="text-xs font-extrabold text-slate-700 block mb-1">Stock Qty.</label>
            <input
              type="text"
              readOnly
              value={selectedBatch ? selectedBatch.stockQty : ""}
              className="w-full bg-slate-200 border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-extrabold"
            />
          </div>

          <div className="w-24">
            <label className="text-xs font-extrabold text-slate-700 block mb-1">Item Qty.</label>
            <input
              ref={itemQtyRef}
              type="number"
              min="1"
              step="1"
              value={itemQty}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") {
                  setItemQty("");
                  return;
                }
                const n = Number(v);
                if (!Number.isFinite(n) || n < 0) return;
                // Whole units only — a pasted/dragged decimal (keydown
                // blocking alone can't catch those) is floored rather than
                // silently rejected, so the box always ends up with a sensible value.
                setItemQty(String(Math.floor(n)));
              }}
              onKeyDown={handleItemQtyKeyDown}
              className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 font-black text-slate-900 text-center text-base focus:border-[#ADEBB3] outline-none"
            />
          </div>

          <div className="flex items-end gap-2 pt-5">
            <button
              onClick={handleAddItem}
              disabled={!selectedBatch}
              className="bg-[#16a34a] hover:bg-green-700 disabled:opacity-40 text-white font-black px-5 py-1.5 rounded shadow text-sm"
            >
              ADD
            </button>
            <button
              onClick={() => {
                setSelectedBatch(null);
                setQuery("");
                setBarcode("");
                setItemQty("");
                setAddError(null);
              }}
              className="bg-[#dc2626] hover:bg-red-700 text-white font-bold px-4 py-1.5 rounded shadow text-sm"
            >
              CLEAR ITEM
            </button>
          </div>

          <div className="flex items-start gap-4 text-sm font-bold text-slate-800 ml-2">
            <label className="flex flex-col items-center gap-1 cursor-pointer">
              <span className="text-xs font-extrabold text-red-600">Free?</span>
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => setIsFree(e.target.checked)}
                className="w-4 h-4 accent-[#ADEBB3]"
              />
            </label>
            <label className="flex flex-col items-center gap-1 cursor-pointer">
              <span className="text-xs font-extrabold text-[#16a34a]">PRDM?</span>
              <input
                type="checkbox"
                checked={isPrdm}
                onChange={(e) => setIsPrdm(e.target.checked)}
                className="w-4 h-4 accent-[#ADEBB3]"
              />
            </label>
          </div>
        </div>

        <div className="bg-[#dc2626] text-white font-black text-base px-4 py-1 rounded-full shadow-md">
          {cart.length}
        </div>
      </div>

      {addError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs font-bold text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {addError}
        </div>
      )}

      {/* Table + Summary */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-white">
          <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
            <thead>
              <tr className="bg-slate-200/90 text-slate-800 font-extrabold uppercase whitespace-nowrap">
                <th className="py-3.5 px-3 border border-slate-300 w-[9%] truncate">Item Name</th>
                <th className="py-3.5 px-2.5 border border-slate-300 w-[8%] truncate">Display Category</th>
                <th className="py-3.5 px-2.5 border border-slate-300 w-[6%] truncate">Supplier</th>
                <th className="py-3.5 px-2.5 border border-slate-300 w-[4%] truncate">UOM</th>
                <th className="py-3.5 px-2.5 border border-slate-300 text-right w-[5%] truncate">VAT</th>
                <th className="py-3.5 px-2.5 border border-slate-300 text-right w-[5%] truncate">VAT%</th>
                <th className="py-3.5 px-2.5 border border-slate-300 text-right w-[5%] truncate">Disc.</th>
                <th className="py-3.5 px-2.5 border border-slate-300 text-right w-[5%] truncate">Disc%</th>
                <th className="py-3.5 px-2.5 border border-slate-300 w-[5%] truncate">Batch</th>
                <th className="py-3.5 px-2.5 border border-slate-300 w-[6%] truncate">Exp. Date</th>
                <th className="py-3.5 px-2.5 border border-slate-300 text-center w-[5%] truncate">Stock</th>
                <th className="py-3.5 px-2.5 border border-slate-300 text-right w-[5%] truncate">MRP</th>
                <th className="py-3.5 px-2.5 border border-slate-300 text-center w-[6%] truncate">Item Qty.</th>
                <th className="py-3.5 px-3 border border-slate-300 text-right w-[7%] truncate">Total Amount</th>
                <th className="py-3.5 px-1.5 border border-slate-300 text-center w-[4%] truncate">FREE?</th>
                <th className="py-3.5 px-1.5 border border-slate-300 text-center w-[4%] truncate">Reward</th>
                <th className="py-3.5 px-1.5 border border-slate-300 text-center w-[4%] truncate">PRDM</th>
                <th className="py-3.5 px-2.5 border border-slate-300 text-center w-[7%] truncate"></th>
              </tr>
            </thead>
            <tbody className="font-semibold text-base whitespace-nowrap">
              {cart.map((item) => (
                <tr key={item.batchId} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50 transition-colors">
                  <td className="py-4 px-3 border border-slate-200 font-extrabold text-slate-900 truncate">{item.productName}</td>
                  <td
                    className="py-4 px-2.5 border border-slate-200 text-slate-700 truncate"
                    title={item.displayCategory || undefined}
                  >
                    {item.displayCategory || "—"}
                  </td>
                  <td className="py-4 px-2.5 border border-slate-200 text-slate-700 truncate max-w-[140px]">{item.supplierName || "—"}</td>
                  <td className="py-4 px-2.5 border border-slate-200 truncate">{item.uom}</td>
                  <td className="py-4 px-2.5 border border-slate-200 text-right truncate">{lineVatAmt(item).toFixed(2)}</td>
                  <td className="py-4 px-2.5 border border-slate-200 text-right truncate">{item.vatPct ? `${item.vatPct}%` : ""}</td>
                  <td className="py-4 px-2.5 border border-slate-200 text-right truncate">
                    {resolvedDiscAmt > 0 ? lineProportionalDiscAmt(item).toFixed(2) : ""}
                  </td>
                  <td className="py-4 px-2.5 border border-slate-200 text-right truncate">
                    {resolvedDiscAmt > 0 ? `${Number(overallDiscPctApplied.toFixed(2))}%` : ""}
                  </td>
                  <td className="py-4 px-2.5 border border-slate-200 font-bold truncate">{item.batchNo}</td>
                  <td className="py-4 px-2.5 border border-slate-200 text-slate-700 truncate">{item.expiryDate.split("T")[0]}</td>
                  <td className="py-4 px-2.5 border border-slate-200 text-center font-extrabold text-slate-800 truncate">{item.stockQty}</td>
                  <td className="py-4 px-2.5 border border-slate-200 text-right font-bold truncate">{item.mrp.toFixed(2)}</td>
                  <td className="py-2 px-2.5 border border-slate-200 text-center truncate">
                    <input
                      type="number"
                      min="1"
                      step="1"
                      max={item.stockQty}
                      value={item.qty || ""}
                      onKeyDown={blockNonIntegerKeys}
                      onChange={(e) => {
                        const raw = e.target.value;
                        handleUpdateQty(item.batchId, raw === "" ? 0 : parseInt(raw, 10) || 0);
                      }}
                      onBlur={() => handleQtyBlur(item.batchId)}
                      className="w-20 bg-white border border-slate-400 rounded px-2 py-1.5 text-center text-base font-black text-slate-900 focus:border-[#ADEBB3]"
                    />
                  </td>
                  <td className="py-4 px-3 border border-slate-200 text-right font-black text-slate-900 truncate">{lineTotal(item).toFixed(2)}</td>
                  <td className="py-4 px-1.5 border border-slate-200 text-center truncate">
                    {item.isFree ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" /> : 0}
                  </td>
                  <td className="py-4 px-1.5 border border-slate-200 text-center truncate">0</td>
                  <td className="py-4 px-1.5 border border-slate-200 text-center truncate">
                    {item.isPrdm ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-600" /> : 0}
                  </td>
                  <td className="py-4 px-2.5 border border-slate-200 text-center truncate">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        title={`${item.productName} — ${item.genericName}`}
                        className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold"
                      >
                        i
                      </button>
                      <button
                        onClick={() => handleRemove(item.batchId)}
                        className="w-6 h-6 rounded-full bg-[#dc2626] hover:bg-red-700 text-white flex items-center justify-center text-xs font-bold"
                      >
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {cart.length === 0 && (
                <tr>
                  <td colSpan={18} className="py-20 border border-slate-200 text-center text-slate-400 text-base font-bold">
                    No medicines currently in billing list. Search &amp; select from above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="w-72 bg-[#f8fafc] px-2 py-1.5 flex flex-col border-l border-slate-300 min-h-0 select-none">
          <div className="space-y-1 flex-1">
            {/* Store Selection */}
            <div className="grid grid-cols-12 items-center gap-x-1.5 text-xs">
              <span className="col-span-5 text-slate-700 font-semibold">Store</span>
              <select
                value={selectedStoreId ?? ""}
                onChange={(e) => setSelectedStoreId(Number(e.target.value))}
                className="col-span-7 bg-white border border-slate-300 rounded px-1.5 h-6 text-slate-900 font-bold w-full text-xs outline-none focus:border-[#ADEBB3]"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Financial Summary Fields */}
            <div className="space-y-[3px] text-xs font-semibold text-slate-800">
              <div className="grid grid-cols-12 items-center gap-x-1.5">
                <span className="col-span-5 text-slate-700">Item Amount</span>
                <div className="col-span-7 bg-[#f1f5f9] border border-slate-300 rounded px-2 h-6 flex items-center justify-end font-bold text-slate-900">
                  {itemAmount.toFixed(2)}
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-x-1.5">
                <span className="col-span-5 text-slate-700">VAT</span>
                <div className="col-span-7 bg-[#f1f5f9] border border-slate-300 rounded px-2 h-6 flex items-center justify-end font-bold text-slate-900">
                  {vatAmount.toFixed(2)}
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-x-1.5">
                <span className="col-span-5 text-slate-700">Total Amount</span>
                <div className="col-span-7 bg-[#f1f5f9] border border-slate-300 rounded px-2 h-6 flex items-center justify-end font-bold text-slate-900">
                  {totalAmount.toFixed(2)}
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-x-1.5">
                <span className="col-span-5 text-slate-700">Discount</span>
                <div className="col-span-7 bg-[#f1f5f9] border border-slate-300 rounded px-2 h-6 flex items-center justify-end font-bold text-slate-900">
                  {resolvedDiscAmt.toFixed(2)}
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-x-1.5">
                <span className="col-span-5 text-slate-700">Net Amount</span>
                <div className="col-span-7 bg-[#f1f5f9] border border-slate-300 rounded px-2 h-6 flex items-center justify-end font-bold text-slate-900">
                  {netAmount.toFixed(2)}
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-x-1.5">
                <span className="col-span-5 text-slate-700">Adjust</span>
                <div className="col-span-7 bg-[#f1f5f9] border border-slate-300 rounded px-2 h-6 flex items-center justify-end font-bold text-slate-900">
                  {adjustAmount.toFixed(2)}
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-x-1.5">
                <span className="col-span-5 text-slate-700">Receivable</span>
                <div className="col-span-7 bg-[#f1f5f9] border border-slate-300 rounded px-2 h-6 flex items-center justify-end font-bold text-slate-900">
                  {receivable.toFixed(2)}
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-x-1.5">
                <span className="col-span-5 text-[#16a34a] font-bold">Paid Amount</span>
                <div className="col-span-7 bg-[#f1f5f9] border border-slate-300 rounded px-2 h-6 flex items-center justify-end font-bold text-slate-900">
                  {paidAmount.toFixed(2)}
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-x-1.5">
                <span className="col-span-5 text-[#dc2626] font-bold">Due Amount</span>
                <div className="col-span-7 bg-[#f1f5f9] border border-slate-300 rounded px-2 h-6 flex items-center justify-end font-bold text-slate-900">
                  {dueAmount.toFixed(2)}
                </div>
              </div>
              <div className="grid grid-cols-12 items-center gap-x-1.5">
                <span className="col-span-5 text-slate-700">Reward</span>
                <div className="col-span-7 bg-[#f1f5f9] border border-slate-300 rounded px-2 h-6 flex items-center justify-end font-bold text-slate-900">
                  0
                </div>
              </div>
            </div>

            {/* Customer Balances & Limits */}
            <div className="border border-slate-300 bg-white rounded p-2 space-y-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[#16a34a] font-bold">Reward Balance</span>
                <span className="font-extrabold text-slate-900">{customer ? customer.rewardBalance : 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#dc2626] font-bold">Credit Limit</span>
                <span className="font-extrabold text-slate-900">{customer ? customer.creditLimit : 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#16a34a] font-bold">Credit Balance</span>
                <span className="font-extrabold text-slate-900">{customer ? customer.creditBalance : 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#dc2626] font-bold">Available Credit</span>
                <span className="font-extrabold text-slate-900">{customer ? (customer.creditLimit - (customer.creditBalance || 0)) : 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Payment Bar */}
      <div className="bg-[#e2e8f0] border-t border-slate-300 p-3.5 flex items-start justify-between text-sm gap-4 shrink-0">

        {/* Left Side: Discounts, Remarks, Buttons */}
        <div className="flex-1 grid grid-cols-2 gap-x-6 gap-y-3 max-w-2xl">
          {/* Column 1: Discount Type, Remarks, Submit/New */}
          <div className="space-y-3 flex flex-col justify-between">
            <div>
              <label className="text-xs font-extrabold text-slate-700 block mb-0.5">Discount Type</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-bold"
              >
                <option>General Discount</option>
                <option>Employee Discount</option>
                <option>Doctor Reference</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-extrabold text-slate-700 block mb-0.5">Remarks</label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional billing note..."
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 font-semibold"
              />
            </div>

            {submitError && <p className="text-xs font-bold text-red-600">{submitError}</p>}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSubmit}
                disabled={cart.length === 0 || submitting}
                className="bg-[#ADEBB3] hover:bg-emerald-700 disabled:opacity-50 text-slate-900 hover:text-white font-black px-7 py-2 rounded text-sm shadow-md active:scale-95 transition-all"
              >
                {submitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <Spinner size="xs" /> Submitting...
                  </span>
                ) : (
                  "SUBMIT"
                )}
              </button>
              <button
                onClick={handleNewOrder}
                className="bg-[#dc2626] hover:bg-red-700 text-white font-black px-6 py-2 rounded text-sm shadow-md active:scale-95 transition-all"
              >
                NEW
              </button>
            </div>
          </div>

          {/* Column 2: Disc Amts, Delivery, Invoice/Reprint */}
          <div className="space-y-3 flex flex-col justify-between">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs font-extrabold text-slate-700 block mb-0.5">Disc. Amt.</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={discAmt || ""}
                  onKeyDown={blockNegativeKeys}
                  onChange={(e) => setDiscAmt(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-bold"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-extrabold text-slate-700 block mb-0.5">Disc. Pct. (%)</label>
                <input
                  type="number"
                  min="0"
                  value={discPct || ""}
                  onKeyDown={blockNegativeKeys}
                  onChange={(e) => handleDiscPctChange(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 font-bold"
                />
              </div>
              <button
                onClick={() => {
                  setDiscAmt(0);
                  setDiscPct(0);
                }}
                title="Clear Discount"
                className="bg-[#dc2626] hover:bg-red-700 text-white font-bold px-3 py-1 rounded text-xs shadow shrink-0 mb-[1px]"
              >
                CLEAR DISC
              </button>
            </div>

            <div className="flex items-center gap-3 font-extrabold text-slate-800 pt-1">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={deliveryMode === "PICKUP"}
                  onChange={() => {
                    setDeliveryMode("PICKUP");
                    setDeliveryType("");
                  }}
                  className="w-4 h-4 accent-blue-600"
                />
                <span>Pickup</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="radio"
                  checked={deliveryMode === "DELIVERY"}
                  onChange={() => setDeliveryMode("DELIVERY")}
                  className="w-4 h-4 accent-blue-600"
                />
                <span>Delivery</span>
              </label>
              {deliveryMode === "DELIVERY" && (
                <select
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value)}
                  className="bg-white border border-slate-300 rounded px-2 py-0.5 font-bold text-xs flex-1 ml-1"
                >
                  <option value="">Select...</option>
                  {DELIVERY_TYPES.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs font-extrabold text-slate-700 block mb-0.5">Invoice Number</label>
                <input
                  type="text"
                  readOnly
                  className="w-full bg-slate-200 border border-slate-300 rounded px-2.5 py-1 font-bold text-slate-500"
                />
              </div>
              <button
                onClick={() => lastSale && setShowInvoice(true)}
                disabled={!lastSale}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold px-5 py-1.5 rounded text-sm shadow mb-[1px]"
              >
                RE-PRINT
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Payment Details Grid & MY MEDICINE */}
        <div className="flex-1 flex items-end gap-5 shrink-0 border-l border-slate-300 pl-5 ml-2">
          <div className="flex-1 grid grid-cols-3 gap-x-4 gap-y-2.5 font-extrabold">
            {/* Row 1 */}
            <div>
              <label className="text-xs text-slate-700 block mb-0.5">Cash Amount</label>
              <input
                ref={cashAmountRef}
                type="number"
                min="0"
                value={paidCash || ""}
                onChange={(e) => setPaidCash(Math.max(0, parseFloat(e.target.value) || 0))}
                onKeyDown={(e) => {
                  blockNegativeKeys(e);
                  if (e.key === "Enter") {
                    e.preventDefault();
                    givenAmountRef.current?.focus();
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-900 font-bold"
              />
            </div>
            <div>
              <label className="text-xs text-slate-700 block mb-0.5">Given Amount</label>
              <input
                ref={givenAmountRef}
                type="number"
                min="0"
                value={givenAmount || ""}
                onChange={(e) => setGivenAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                onKeyDown={(e) => {
                  blockNegativeKeys(e);
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleGivenAmountEnter();
                  }
                }}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-900 font-bold"
              />
            </div>
            <div>
              <label className="text-xs text-slate-700 block mb-0.5">Change Amount</label>
              <input
                type="text"
                readOnly
                value={changeAmount ? changeAmount.toFixed(2) : ""}
                className="w-full bg-slate-200 border border-slate-300 rounded px-2.5 py-1 text-slate-800 font-extrabold"
              />
            </div>

            {/* Row 2 */}
            <div>
              <label className="text-xs text-slate-700 block mb-0.5">Mobile Banking</label>
              <input
                type="number"
                min="0"
                value={paidMobileBanking || ""}
                onKeyDown={blockNegativeKeys}
                onChange={(e) => setPaidMobileBanking(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-900 font-bold"
              />
            </div>
            {paidMobileBanking > 0 && (
              <>
                <div>
                  <label className="text-xs text-slate-700 block mb-0.5">Mobile Banking Type</label>
                  <TypeaheadInput
                    value={mobileBankingType}
                    onChange={setMobileBankingType}
                    options={MOBILE_BANKING_TYPES}
                    placeholder="Type or select..."
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-700 block mb-0.5">Transaction Number</label>
                  <input
                    type="text"
                    value={transactionNumber}
                    onChange={(e) => setTransactionNumber(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-900 font-bold"
                  />
                </div>
              </>
            )}

            {/* Row 3 */}
            <div>
              <label className="text-xs text-slate-700 block mb-0.5">Card Payment</label>
              <input
                type="number"
                min="0"
                value={paidCard || ""}
                onKeyDown={blockNegativeKeys}
                onChange={(e) => setPaidCard(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-slate-900 font-bold"
              />
            </div>
            {paidCard > 0 && (
              <>
                <div>
                  <label className="text-xs text-slate-700 block mb-0.5">Card Type</label>
                  <TypeaheadInput
                    value={cardType}
                    onChange={setCardType}
                    options={CARD_TYPES}
                    placeholder="Type or select..."
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-700 block mb-0.5">Bank Name</label>
                  <TypeaheadInput
                    value={bankName}
                    onChange={setBankName}
                    options={BANGLADESH_BANKS}
                    placeholder="Type or select..."
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-slate-900 font-bold"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col justify-end self-end pb-1 shrink-0">
            <button className="bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white font-black px-5 py-2 rounded text-sm shadow-md active:scale-95 transition-all">
              MY MEDICINE
            </button>
          </div>
        </div>
      </div>

      {showInvoice && lastSale && <InvoiceModal sale={lastSale} onClose={() => setShowInvoice(false)} />}

      {showAddCustomerModal && (
        <AddCustomerModal
          stores={stores}
          onClose={() => setShowAddCustomerModal(false)}
          onCreate={async (data) => {
            if (data.mobile) {
              const existing = await api.searchCustomers({ mobile: data.mobile });
              if (existing.length > 0) {
                throw new Error("ALREADY_EXISTS");
              }
            }
            const created = await api.createCustomer(data);

            setCustomer(created);
            setCustId(created.customerCode);
            setMobileNo(created.mobile);
            setCustError(null);
            setShowAddCustomerModal(false);
          }}
        />
      )}
    </div>
  );
};
