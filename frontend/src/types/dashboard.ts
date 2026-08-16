export interface PaymentBreakdownItem {
  type: string;
  amount: number;
}

export interface PeriodSummary {
  sales: { total: number; invoiceCount: number };
  collection: {
    total: number;
    invoiceCount: number;
    cash: number;
    mobile: number;
    card: number;
    adjustment: number;
    mobileByType: PaymentBreakdownItem[];
    cardByType: PaymentBreakdownItem[];
  };
}

export interface DashboardResponse {
  sales: { total: number; invoiceCount: number };
  collection: {
    total: number;
    invoiceCount: number;
    cash: number;
    mobile: number;
    card: number;
    adjustment: number;
    mobileByType: PaymentBreakdownItem[];
    cardByType: PaymentBreakdownItem[];
  };
  purchase: { total: number; invoiceCount: number };
  payment: { total: number; invoiceCount: number };
  profit: { total: number; cogs: number; salesTotal: number };
  daily: PeriodSummary;
  monthly: PeriodSummary;
  yearly: PeriodSummary;
}
