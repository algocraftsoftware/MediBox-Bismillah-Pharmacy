"use client";

import React, { useMemo, useState } from "react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi } from "../../../services/api";
import { ListView } from "./ListView";
import { NewView } from "./NewView";
import { DetailView } from "./DetailView";

export const AsterGrnWithoutPoView: React.FC = () => {
  const { shopSlug, token, stores } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [grnId, setGrnId] = useState<number | null>(null);

  if (view === "list") {
    return (
      <ListView
        api={api}
        onNew={() => {
          setGrnId(null);
          setView("new");
        }}
        onEdit={(id) => {
          setGrnId(id);
          setView("detail");
        }}
      />
    );
  }
  if (view === "new") {
    return (
      <NewView
        api={api}
        stores={stores}
        onBack={() => setView("list")}
        onCreated={(id) => {
          setGrnId(id);
          setView("detail");
        }}
      />
    );
  }
  return <DetailView api={api} grnId={grnId!} onBack={() => setView("list")} />;
};
