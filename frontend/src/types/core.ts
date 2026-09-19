export type CustomerType = "GENERAL" | "EMPLOYEE" | "OTHER" | "VVIP";
export type Gender = "MALE" | "FEMALE" | "OTHER";
export type ControlledClass = "NONE" | "ANTIBIOTIC" | "SEDATIVE_CNS";
export type Shift = "MORNING" | "EVENING";
export type DeliveryMode = "PICKUP" | "DELIVERY";
export type PaymentStatus = "PAID" | "DUE";

export interface Store {
  id: number;
  shopId: number;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
}

export interface Department {
  id: number;
  shopId: number;
  name: string;
  subDepartments: SubDepartment[];
}

export interface SubDepartment {
  id: number;
  departmentId: number;
  name: string;
}

export interface Supplier {
  id: number;
  shopId: number;
  name: string;
  contact: string | null;
  address: string | null;
<<<<<<< HEAD
  paymentMode?: string | null;
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
}
