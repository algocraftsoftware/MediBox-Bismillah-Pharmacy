export interface ShopSummary {
  id: number;
  code: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: "ACTIVE" | "SUSPENDED";
  createdAt: string;
  storeCount: number;
  adminCount: number;
  productCount: number;
  totalSales: number;
  totalOrders: number;
}

export interface PlatformStats {
  shopCount: number;
  productCount: number;
  batchCount: number;
  sales?: { total: number; invoiceCount: number };
  collection?: {
    total: number;
    invoiceCount: number;
    cash: number;
    mobile: number;
    card: number;
  };
}

// A patient as the super admin sees them: name and mobile only, plus which
// shop registered them. Deliberately nothing else — this is a cross-shop view
// of other people's patients, so it carries no address, NID, email or history.
export interface ContactSummary {
  id: number;
  name: string;
  mobile: string;
  shop: { id: number; name: string } | null;
}

export interface ContactListResponse {
  rows: ContactSummary[];
  total: number;
  page: number;
  pageSize: number;
}
