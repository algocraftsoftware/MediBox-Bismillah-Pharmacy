import { CustomerType, Gender, Store } from "./core";

export interface Customer {
  id: number;
  shopId: number;
  customerCode: string;
  storeId: number;
  store?: Store;
  custType: CustomerType;
  name: string;
  mobile: string;
  address: string | null;
  gender: Gender | null;
  birthDate: string | null;
  marriageDate: string | null;
  email: string | null;
  nid: string | null;
  passport: string | null;
  orgName: string | null;
  designation: string | null;
  employeeId: string | null;
  doctorName: string | null;
  doctorAddress: string | null;
  rewardBalance: number;
  creditLimit: number;
  creditBalance: number;
  createdAt: string;
}
