"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Provider } from "react-redux";
import { ApiError, session, shopApi } from "../services/api";
import { Spinner } from "../components/Spinner";
import { ShopAdminRole, Store } from "../types";
import { store } from "../store/store";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  shopSessionAccountRefreshed,
  shopSessionLoaded,
  shopSessionReset,
  shopSessionRetrying,
  shopSessionStoreSelected,
} from "../store/shopSessionSlice";

const MAX_SESSION_LOAD_ATTEMPTS = 4;

// How often an open tab re-checks its own feature access. Short enough that a
// permission change lands on its own without the user doing anything, long
// enough to be a rounding error against normal app traffic.
const ACCOUNT_REFRESH_MS = 30_000;

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
  // Read as individual fields so the background refresh effect below only
  // restarts when the identity it closes over actually changes, not on every
  // unrelated session update (e.g. picking a different store).
  const sessionShopSlug = value?.shopSlug;
  const sessionToken = value?.token;

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
          // Feature access is read from the DB on every load, never from the
          // stored session: a Super Admin can grant or revoke features after
          // this account logged in, and the menu has to follow that instead of
          // whatever was true at login. Same for the role.
          const adminRole = me.admin?.role ?? sess.admin.role;
          const permissions = me.admin?.permissions ?? sess.admin.permissions;
          session.setShopAdmin({
            ...sess,
            admin: { ...sess.admin, name: adminName, role: adminRole, permissions },
            shop: { ...sess.shop, name: shopName, logoUrl },
          });
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
              adminRole,
              permissions,
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

  // Keeps the menu honest while the app is already open. The session loads once
  // per mount, and moving between pages doesn't remount this provider (it lives
  // in the layout), so without this a permission change would only show up
  // after a full reload or a re-login. Re-checks on a timer and whenever the tab
  // regains focus — the realistic case being a Super Admin editing access in
  // another tab/machine while the shop user sits on a page.
  useEffect(() => {
    if (!ready || !sessionShopSlug || !sessionToken) return;
    let cancelled = false;
    const api = shopApi(sessionShopSlug, sessionToken);

    const refresh = () => {
      api
        .me()
        .then((me) => {
          if (cancelled || !me.admin) return;
          const stored = session.getShopAdmin();
          if (stored) {
            session.setShopAdmin({
              ...stored,
              admin: {
                ...stored.admin,
                name: me.admin.name,
                role: me.admin.role,
                permissions: me.admin.permissions ?? [],
              },
            });
          }
          dispatch(
            shopSessionAccountRefreshed({
              permissions: me.admin.permissions ?? [],
              adminRole: me.admin.role,
              adminName: me.admin.name,
            })
          );
        })
        .catch((err) => {
          if (cancelled) return;
          // The account was deactivated or the shop suspended out from under
          // this session — that can't recover, so send them to login. Anything
          // else (offline, backend blip) is ignored: the next tick retries.
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            session.clearShopAdmin();
            router.replace(`/${params.shopSlug}/login`);
          }
        });
    };

    const onFocus = () => refresh();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = setInterval(refresh, ACCOUNT_REFRESH_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(timer);
    };
  }, [ready, sessionShopSlug, sessionToken, dispatch, router, params.shopSlug]);

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
