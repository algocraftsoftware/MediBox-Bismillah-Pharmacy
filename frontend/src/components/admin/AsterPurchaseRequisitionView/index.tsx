"use client";

import React, { useMemo, useState } from "react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi } from "../../../services/api";
import { ListView } from "./ListView";
import { FormView } from "./FormView";
import { ViewMode } from "./types";

export const AsterPurchaseRequisitionView: React.FC = () => {
  const { shopSlug, token, stores, adminName } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [view, setView] = useState<ViewMode>("list");
  const [editingId, setEditingId] = useState<number | null>(null);

  return view === "list" ? (
    <ListView
      api={api}
      onNew={() => {
        setEditingId(null);
        setView("form");
      }}
      onEdit={(id) => {
        setEditingId(id);
        setView("form");
      }}
    />
  ) : (
    <FormView
      api={api}
      stores={stores}
      adminName={adminName}
      requisitionId={editingId}
      onBack={() => setView("list")}
      onSaved={(id) => setEditingId(id)}
    />
  );
};
