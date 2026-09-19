"use client";

import React, { useMemo, useState } from "react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi } from "../../../services/api";
import { ListView } from "./ListView";
import { DetailView } from "./DetailView";

export const AsterPurchaseOrderView: React.FC = () => {
  const { shopSlug, token, stores, adminName } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [editingId, setEditingId] = useState<number | null>(null);

  return editingId === null ? (
    <ListView api={api} onEdit={(id) => setEditingId(id)} />
  ) : (
    <DetailView api={api} stores={stores} adminName={adminName} orderId={editingId} onBack={() => setEditingId(null)} />
  );
};
