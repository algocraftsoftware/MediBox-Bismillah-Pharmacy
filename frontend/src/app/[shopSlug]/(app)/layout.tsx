"use client";

import { usePathname } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ShopSessionProvider, useShopSession } from "../../../context/ShopSessionContext";
<<<<<<< HEAD
import { MediboxHeader } from "../../../components/admin/MediboxHeader";
import { ADMIN_ONLY_MENU_FEATURES, ALL_FEATURE_IDS } from "../../../lib/menuFeatures";
=======
import { AsterHeader } from "../../../components/admin/AsterHeader";
import { ALL_FEATURE_IDS } from "../../../lib/menuFeatures";
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77

function Shell({ children }: { children: React.ReactNode }) {
  const session = useShopSession();
  const pathname = usePathname();
  const activeRoute = pathname.split("/").filter(Boolean)[1] || "billing";
  // Settings is deliberately NOT in ALL_FEATURE_IDS/the Staff permission
  // checklist at all (see DashboardTabBar) — it's Admin-only with no
  // override, so it gets its own hard gate here instead of going through
  // the generic "not a known feature -> open by default" fallback below.
  // A known feature is open only when it's been granted — for ADMIN accounts
  // too, so a feature the Super Admin restricted is actually unreachable and
  // not just hidden from the menu (typing its URL lands on Access Restricted).
<<<<<<< HEAD
  // Settings and the admin-only menu items are not grantable features, so they
  // are gated on the role instead — and gated here, not just hidden from the
  // menu, so typing the URL lands on Access Restricted rather than the screen.
  const adminOnlyRoute =
    activeRoute === "settings" || ADMIN_ONLY_MENU_FEATURES.some((f) => f.id === activeRoute);

  const hasAccess = adminOnlyRoute
    ? session.adminRole === "ADMIN"
    : !ALL_FEATURE_IDS.includes(activeRoute) || session.permissions.includes(activeRoute);

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] text-slate-900 font-sans overflow-hidden">
      <MediboxHeader
=======
  const hasAccess =
    activeRoute === "settings"
      ? session.adminRole === "ADMIN"
      : !ALL_FEATURE_IDS.includes(activeRoute) || session.permissions.includes(activeRoute);

  return (
    <div className="flex flex-col h-screen bg-[#f8fafc] text-slate-900 font-sans overflow-hidden">
      <AsterHeader
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
        shopSlug={session.shopSlug}
        activeRoute={activeRoute}
        shopName={session.shopName}
        logoUrl={session.logoUrl}
        adminName={session.adminName}
        permissions={session.permissions}
<<<<<<< HEAD
        adminRole={session.adminRole}
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
        stores={session.stores}
        selectedStoreId={session.selectedStoreId}
        setSelectedStoreId={session.setSelectedStoreId}
        onLogout={session.logout}
      />
      <main className="flex-1 overflow-hidden">
        {hasAccess ? (
          children
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
            <ShieldAlert className="w-10 h-10 text-slate-400" />
            <h2 className="text-lg font-black text-slate-700">Access Restricted</h2>
            <p className="text-sm font-semibold max-w-sm text-center">
              Your account ({session.adminName}) doesn&apos;t have access to this feature. Ask your shop admin or the
              platform Super Admin to grant it.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ShopAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ShopSessionProvider>
      <Shell>{children}</Shell>
    </ShopSessionProvider>
  );
}
