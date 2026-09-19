// =======================================================
// EMPLOYEES & SALARY
// =======================================================

export type SalaryStatus = "PAID" | "UNPAID";

export interface EmployeeSalary {
  id: number;
  employeeId: number;
  shopId: number;
  month: string;
  amount: number;
  status: SalaryStatus;
  paidAt: string | null;
  remarks: string | null;
}

export interface Employee {
  id: number;
  shopId: number;
  name: string;
  address: string | null;
  mobile: string;
  age: number | null;
  education: string | null;
  salary: number;
  createdAt: string;
  updatedAt: string;
  salaries?: EmployeeSalary[];
}

// A row on the Employee Salary screen: one per employee for the selected
// month, joined with their payment record (or a "not given yet" placeholder).
export interface SalaryRow {
  employeeId: number;
  employeeName: string;
  mobile: string;
  salary: number;
  salaryRecordId: number | null;
  month: string;
  amount: number;
  status: SalaryStatus;
  paidAt: string | null;
  remarks: string | null;
}

export interface SalaryMonthResponse {
  month: string;
  rows: SalaryRow[];
}
