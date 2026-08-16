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
