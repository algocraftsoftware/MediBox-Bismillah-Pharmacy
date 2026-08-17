"use client";

import React from "react";
import { ChevronRight, Receipt, Settings, Users, Wallet2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useShopSession } from "../../context/ShopSessionContext";
import { DASHBOARD_FEATURES } from "../../lib/menuFeatures";

const DASHBOARD_BUTTON_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  employees: Users,
  "employee-salary": Wallet2,
  expenses: Receipt,
};

// Shared across the Dashboard page and the three pages its own buttons link
// to (Employees / Employee Salary / Expenses) so this row stays visible no
// matter which of the four you're on, instead of only existing on Dashboard
// itself. Collection / Due Collection always jump back to the Dashboard's
// respective tab (with a live in-place switch if already there); the other
// three highlight whichever one is currently open.
export const DashboardTabBar: React.FC<{
  activeRoute: "dashboard" | "employees" | "employee-salary" | "expenses" | "settings";
  collectionTab?: "collection" | "due";
  onCollectionTabChange?: (tab: "collection" | "due") => void;
}> = ({ activeRoute, collectionTab, onCollectionTabChange }) => {
  const router = useRouter();
  const { shopSlug, permissions, adminRole } = useShopSession();
  // Granted features decide these buttons for every role, ADMIN included —
  // matches AsterHeader's MENU grid so a restricted feature disappears from
  // both places at once.
  const visibleDashboardButtons = DASHBOARD_FEATURES.filter((f) => permissions.includes(f.id));

  const goCollection = (targetTab: "collection" | "due") => {
    if (activeRoute === "dashboard" && onCollectionTabChange) {
      onCollectionTabChange(targetTab);
    } else {
      router.push(`/${shopSlug}/dashboard?tab=${targetTab}`);
    }
  };

  return (
    <div className="bg-white border-b border-slate-300 px-6 py-2.5 flex items-center gap-2 shrink-0 flex-wrap">
      <button
        onClick={() => goCollection("collection")}
        className={`px-4 py-1.5 rounded-lg font-bold text-sm ${
          activeRoute === "dashboard" && collectionTab === "collection"
            ? "bg-[#ADEBB3] text-slate-900"
            : "bg-slate-100 hover:bg-slate-200 text-slate-600"
        }`}
      >
        Collection
      </button>
      <button
        onClick={() => goCollection("due")}
        className={`px-4 py-1.5 rounded-lg font-bold text-sm ${
          activeRoute === "dashboard" && collectionTab === "due"
            ? "bg-[#ADEBB3] text-slate-900"
            : "bg-slate-100 hover:bg-slate-200 text-slate-600"
        }`}
      >
        Due Collection
      </button>

      {visibleDashboardButtons.map((f) => {
        const Icon = DASHBOARD_BUTTON_ICONS[f.id] ?? Wallet2;
        const isActive = activeRoute === f.id;
        return (
          <button
            key={f.id}
            onClick={() => router.push(`/${shopSlug}/${f.id}`)}
            className={`flex items-center gap-1.5 border rounded-full pl-3 pr-2 py-1.5 shadow-sm font-bold text-xs transition-colors ${
              isActive
                ? "bg-emerald-50 border-[#047857] text-[#047857]"
                : "bg-white hover:bg-emerald-50 border-slate-300 hover:border-[#047857] text-slate-700 hover:text-[#047857]"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {f.label.toUpperCase()}
            <ChevronRight className="w-3.5 h-3.5 opacity-50" />
          </button>
        );
      })}

      {/* Admin-only, and deliberately not part of DASHBOARD_FEATURES/the Staff
          permission checklist — changing account credentials is never
          grantable to Staff, unlike every other button in this row. */}
      {adminRole === "ADMIN" && (
        <button
          onClick={() => router.push(`/${shopSlug}/settings`)}
          className={`flex items-center gap-1.5 border rounded-full pl-3 pr-2 py-1.5 shadow-sm font-bold text-xs transition-colors ${
            activeRoute === "settings"
              ? "bg-emerald-50 border-[#047857] text-[#047857]"
              : "bg-white hover:bg-emerald-50 border-slate-300 hover:border-[#047857] text-slate-700 hover:text-[#047857]"
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          SETTINGS
          <ChevronRight className="w-3.5 h-3.5 opacity-50" />
        </button>
      )}
    </div>
  );
};
