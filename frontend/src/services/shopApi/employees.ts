import { Employee, EmployeeSalary, SalaryMonthResponse } from "../../types";
import { request } from "./http";

export function employeesApi(base: string, token: string) {
  return {
    listEmployees: () => request<Employee[]>(`${base}/employees`, token),
    getEmployee: (id: number) => request<Employee>(`${base}/employees/${id}`, token),
    createEmployee: (data: Partial<Employee>) =>
      request<Employee>(`${base}/employees`, token, { method: "POST", body: JSON.stringify(data) }),
    updateEmployee: (id: number, data: Partial<Employee>) =>
      request<Employee>(`${base}/employees/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    deleteEmployee: (id: number) =>
      request<{ ok: boolean }>(`${base}/employees/${id}`, token, { method: "DELETE" }),

    getSalaryMonths: () => request<string[]>(`${base}/employees/salaries/months`, token),
    getSalaryMonth: (month: string) =>
      request<SalaryMonthResponse>(`${base}/employees/salaries?month=${encodeURIComponent(month)}`, token),
    paySalary: (data: { employeeId: number; month: string; amount?: number; remarks?: string }) =>
      request<EmployeeSalary>(`${base}/employees/salaries`, token, { method: "POST", body: JSON.stringify(data) }),
    revertSalary: (id: number) =>
      request<{ ok: boolean }>(`${base}/employees/salaries/${id}`, token, { method: "DELETE" }),
  };
}
