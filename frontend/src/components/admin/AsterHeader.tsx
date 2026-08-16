"use client";

import React, { useRef, useState, useEffect } from "react";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { Store } from "../../types";
import { MENU_FEATURES } from "../../lib/menuFeatures";
import { ShopLogoBadge } from "./ShopLogoBadge";

interface AsterHeaderProps {
  shopSlug: string;
  activeRoute: string;
  shopName: string;
  logoUrl: string | null;
  adminName: string;
  adminRole: string;
  permissions: string[];
  stores: Store[];
  selectedStoreId: number | null;
  setSelectedStoreId: (id: number) => void;
  onLogout: () => void;
}

const TITLES: Record<string, string> = {
  billing: "Billing",
  "customer-registration": "Customer Registration",
  dashboard: "Pharmacy Dashboard",
  "sales-report": "Pharmacy Sales Report",
  employees: "Employees",
  "employee-salary": "Employee Salary",
  expenses: "Expenses",
  settings: "Settings",
};

export const AsterHeader: React.FC<AsterHeaderProps> = ({
  shopSlug,
  activeRoute,
  shopName,
  logoUrl,
  adminName,
  adminRole,
  permissions,
  stores,
  selectedStoreId,
  setSelectedStoreId,
  onLogout,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Only show menu items this account is permitted to use — a flat,
  // auto-flowing grid (4 per column) so a Super Admin granting fewer
  // features just closes the gap and reflows, instead of leaving a fixed
  // column short or any blank space.
  // ADMIN role always sees every item, regardless of its stored permissions
  // array (matches the backend's requirePermission ADMIN bypass) — so a
  // brand-new feature is immediately visible to existing admin accounts.
  const visibleItems =
    adminRole === "ADMIN" ? MENU_FEATURES : MENU_FEATURES.filter((item) => permissions.includes(item.id));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const goTo = (routeId: string) => {
    setMenuOpen(false);
    router.push(`/${shopSlug}/${routeId}`);
  };

  return (
    <header className="select-none z-30 font-sans shadow-md">
      <div className="bg-[#ADEBB3] text-slate-900 h-14 px-4 flex items-center justify-between border-b border-[#047857]">
        <div className="flex items-center gap-4">
          <ShopLogoBadge name={shopName} logoUrl={logoUrl} />

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded bg-[#047857] hover:bg-[#065f46] text-white font-bold text-sm transition-colors shadow-inner"
            >
              <span>Menu</span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-full mt-2 min-w-140 w-max max-w-[95vw] bg-white text-slate-800 rounded-lg shadow-2xl border border-slate-200 p-6 z-50">
                <div className="grid grid-flow-col grid-rows-4 auto-cols-55 gap-2 text-sm">
                  {visibleItems.map((item) => {
                    const isCurrent = activeRoute === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => goTo(item.id)}
                        className={`w-full text-left px-3 py-2 rounded transition-colors font-bold flex items-center justify-between ${
                          isCurrent
                            ? "bg-emerald-50 text-emerald-800 font-bold border-l-4 border-[#ADEBB3]"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 pt-3 border-t border-slate-200 text-xs text-slate-500 font-semibold">
                  <span className="normal-case">MediBox Powered by Algo Craft Software LTD</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#10b981] text-white font-bold text-base px-5 py-2 rounded shadow-sm">
            {TITLES[activeRoute] || activeRoute.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </div>

          {stores.length > 1 && (
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-700" />
              <select
                value={selectedStoreId ?? ""}
                onChange={(e) => setSelectedStoreId(Number(e.target.value))}
                className="bg-emerald-800 border border-[#ADEBB3] rounded px-2.5 py-1.5 text-white font-bold text-sm outline-none"
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id} className="bg-white text-slate-900">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm font-semibold">
          <div className="flex items-center gap-2 text-slate-700 uppercase tracking-wide">
            <span>{shopName}</span>
            <span>|</span>
            <span className="text-slate-900 font-bold">{adminName}</span>
          </div>

          <button
            onClick={onLogout}
            className="p-1.5 rounded hover:bg-[#047857] text-slate-900 hover:text-white transition-colors"
            title="Logout"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="h-1 bg-[#1e40af]" />
    </header>
  );
};
