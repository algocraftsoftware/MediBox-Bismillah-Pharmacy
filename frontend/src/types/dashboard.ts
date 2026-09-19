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
<<<<<<< HEAD
    // Dues taken in on this day, whatever date the invoice itself carries. The
    // cash/mobile/card figures above already include this split.
    dueCollection: { total: number; count: number; cash: number; mobile: number; card: number };
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
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
<<<<<<< HEAD
    // Dues taken in on this day, whatever date the invoice itself carries. The
    // cash/mobile/card figures above already include this split.
    dueCollection: { total: number; count: number; cash: number; mobile: number; card: number };
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
    mobileByType: PaymentBreakdownItem[];
    cardByType: PaymentBreakdownItem[];
  };
  purchase: { total: number; invoiceCount: number };
  payment: { total: number; invoiceCount: number };
  profit: { total: number; cogs: number; salesTotal: number };
<<<<<<< HEAD
  // Sales split by department (Pharma / Non-Pharma), for the category donut.
  // Value is what was actually billed, net of cancelled quantities.
  categorySplit: { departmentName: string; salesValue: number; qty: number; invoiceCount: number }[];
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
  daily: PeriodSummary;
  monthly: PeriodSummary;
  yearly: PeriodSummary;
}
