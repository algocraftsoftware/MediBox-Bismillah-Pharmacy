"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Provider } from "react-redux";
import { ApiError, session, shopApi } from "../services/api";
import { Spinner } from "../components/Spinner";
import { ShopAdminRole, Store } from "../types";
import { store } from "../store/store";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { shopSessionLoaded, shopSessionReset, shopSessionRetrying, shopSessionStoreSelected } from "../store/shopSessionSlice";

const MAX_SESSION_LOAD_ATTEMPTS = 4;

interface ShopSessionValue {
  token: string;
  shopSlug: string;
  shopName: string;
  logoUrl: string | null;
  preparedBySignatureUrl: string | null;
  reviewedBySignatureUrl: string | null;
  approvedBySignatureUrl: string | null;
  shopAddress: string | null;
  shopPhone: string | null;
  adminName: string;
  adminRole: ShopAdminRole;
  permissions: string[];
  stores: Store[];
  selectedStoreId: number | null;
  setSelectedStoreId: (id: number) => void;
  logout: () => void;
}

// Same public contract as before this was backed by Redux: every one of the
// 39 consumers across the app calls this hook and gets back a fully-ready
// value — the provider below never renders `children` until that's true, so
// this non-null assertion mirrors the old Context version's guarantee.
export function useShopSession(): ShopSessionValue {
  const router = useRouter();
  const params = useParams<{ shopSlug: string }>();
  const dispatch = useAppDispatch();
  const { ready, value } = useAppSelector((state) => state.shopSession);

  if (!ready || !value) {
    throw new Error("useShopSession must be used within ShopSessionProvider");
  }

  return {
    ...value,
    setSelectedStoreId: (id: number) => dispatch(shopSessionStoreSelected(id)),
    logout: () => {
      session.clearShopAdmin();
      router.replace(`/${params.shopSlug}/login`);
    },
  };
}

function ShopSessionLoader({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ shopSlug: string }>();
  const dispatch = useAppDispatch();
  const { ready, retrying, value } = useAppSelector((state) => state.shopSession);

  // Runs exactly once per mount — reproduces useState's "always starts
  // fresh" default, since (unlike component state) the Redux store outlives
  // a ShopSessionLoader unmount/remount (e.g. logging out of one shop and
  // into another).
  useEffect(() => {
    dispatch(shopSessionReset());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sess = session.getShopAdmin();
    // Case-insensitive: the stored session's slug is always the canonical
    // lowercase one from the backend, but the current URL segment might be
    // typed/pasted with different casing (e.g. a bookmarked "/Shop/billing").
    if (!sess || sess.shop.slug.toLowerCase() !== params.shopSlug.toLowerCase()) {
      router.replace(`/${params.shopSlug}/login`);
      return;
    }

    let cancelled = false;
    const api = shopApi(sess.shop.slug, sess.token);

    const load = (attempt: number) => {
      Promise.all([api.getStores(), api.me()])
        .then(([stores, me]) => {
          if (cancelled) return;
          // A super admin can rename the shop or change its logo after this
          // account logged in, so refresh those from the DB on every load
          // instead of trusting the (possibly stale) stored session.
          const shopName = me.shop?.name ?? sess.shop.name;
          const logoUrl = me.shop?.logoUrl ?? sess.shop.logoUrl;
          const preparedBySignatureUrl = me.shop?.preparedBySignatureUrl ?? null;
          const reviewedBySignatureUrl = me.shop?.reviewedBySignatureUrl ?? null;
          const approvedBySignatureUrl = me.shop?.approvedBySignatureUrl ?? null;
          const shopAddress = me.shop?.address ?? null;
          const shopPhone = me.shop?.phone ?? null;
          const adminName = me.admin?.name ?? sess.admin.name;
          session.setShopAdmin({ ...sess, shop: { ...sess.shop, name: shopName, logoUrl } });
          dispatch(
            shopSessionLoaded({
              token: sess.token,
              shopSlug: sess.shop.slug,
              shopName,
              logoUrl,
              preparedBySignatureUrl,
              reviewedBySignatureUrl,
              approvedBySignatureUrl,
              shopAddress,
              shopPhone,
              adminName,
              adminRole: sess.admin.role,
              permissions: sess.admin.permissions,
              stores,
              selectedStoreId: stores[0]?.id ?? null,
            })
          );
        })
        .catch((err) => {
          if (cancelled) return;
          // Only a real auth failure (bad/expired token, deactivated account,
          // suspended shop) means this session can never succeed — bail out
          // to login right away. Anything else (a cold backend connection,
          // a transient network blip — most likely right after a shop was
          // just enrolled) is worth retrying a few times first, so a slow
          // first request doesn't throw a freshly-logged-in, valid admin
          // straight back to the login screen.
          const isAuthFailure = err instanceof ApiError && (err.status === 401 || err.status === 403);
          if (isAuthFailure || attempt >= MAX_SESSION_LOAD_ATTEMPTS) {
            session.clearShopAdmin();
            router.replace(`/${params.shopSlug}/login`);
            return;
          }
          dispatch(shopSessionRetrying());
          setTimeout(() => {
            if (!cancelled) load(attempt + 1);
          }, attempt * 1000);
        });
    };
    load(1);

    return () => {
      cancelled = true;
    };
  }, [params.shopSlug, router, dispatch]);

  if (!ready || !value) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-screen bg-[#f8fafc] text-slate-500 font-bold">
        <Spinner size="lg" />
        {retrying ? "Still connecting — hang tight..." : "Loading MediBox..."}
      </div>
    );
  }

  return <>{children}</>;
}

export function ShopSessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ShopSessionLoader>{children}</ShopSessionLoader>
    </Provider>
  );
}
