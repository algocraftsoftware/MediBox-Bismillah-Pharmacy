"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck, LogOut, Store as StoreIcon, Plus, Users } from "lucide-react";
import { session } from "../../../services/api";

// Persistent header + left sidebar for every super admin page except the
// pre-login screen (which lives outside this route group, at
// app/superadmin/login, so it never gets wrapped by this layout).
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sess = session.getSuperAdmin();
    if (!sess) {
      router.replace("/superadmin/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  const isEnrollNew = pathname === "/superadmin/shops/new";
  const isContacts = pathname === "/superadmin/contacts";

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-emerald-800" />
          <span className="font-black text-lg">MediBox Platform — Super Admin</span>
        </div>
        <button
          onClick={() => {
            session.clearSuperAdmin();
            router.replace("/superadmin/login");
          }}
          className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </header>

      <div className="flex items-start">
        <aside className="w-56 shrink-0 bg-white border-r border-slate-200 min-h-[calc(100vh-65px)] p-4 space-y-1.5 sticky top-16.25">
          <button
            onClick={() => router.push("/superadmin")}
            className={`w-full flex items-center gap-2.5 font-bold text-sm px-3 py-2.5 rounded-lg ${
              isEnrollNew || isContacts ? "bg-white hover:bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-800"
            }`}
          >
            <StoreIcon className="w-4 h-4" />
            Total Shop
          </button>
          <button
            onClick={() => router.push("/superadmin/shops/new")}
            className={`w-full flex items-center gap-2.5 font-bold text-sm px-3 py-2.5 rounded-lg shadow-sm ${
              isEnrollNew
                ? "bg-emerald-700 text-white"
                : "bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white"
            }`}
          >
            <Plus className="w-4 h-4" />
            Enroll New Shop
          </button>
          <button
            onClick={() => router.push("/superadmin/contacts")}
            className={`w-full flex items-center gap-2.5 font-bold text-sm px-3 py-2.5 rounded-lg ${
              isContacts ? "bg-emerald-50 text-emerald-800" : "bg-white hover:bg-slate-100 text-slate-700"
            }`}
          >
            <Users className="w-4 h-4" />
            Contact List
          </button>
        </aside>

        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
