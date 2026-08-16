export type ShopAdminRole = "ADMIN" | "STAFF";

export interface ShopAdminSession {
  token: string;
  admin: { id: number; name: string; username: string; role: ShopAdminRole; permissions: string[] };
  shop: { id: number; name: string; slug: string; logoUrl: string | null };
}

export interface ShopAdminAccount {
  id: number;
  name: string;
  username: string;
  role: ShopAdminRole;
  permissions: string[];
  status: "ACTIVE" | "INACTIVE";
}

export interface SuperAdminSession {
  token: string;
  admin: { id: number; name: string; email: string };
}
