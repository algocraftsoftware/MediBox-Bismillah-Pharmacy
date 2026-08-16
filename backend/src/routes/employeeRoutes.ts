import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);
// Matches every other feature route file's gate — without this, any logged-in
// shop admin/staff account could hit these endpoints directly regardless of
// their granted permissions, bypassing the sidebar's access control entirely.
router.use(requirePermission('employees', 'employee-salary'));

// =======================================================
// SALARY
// =======================================================
// Registered before the "/:id" employee routes below — Express matches
// routes in registration order, and "/:id" matches any single path segment
// including the literal "salaries", which would otherwise swallow every
// request here (e.g. GET /employees/salaries would hit GET /employees/:id
// with id="salaries" and 400 with "Invalid employee id").

// Months that have at least one salary payment recorded, newest first —
// drives the month picker on the Employee Salary screen.
router.get('/salaries/months', asyncHandler(async (req, res) => {
  const rows = await prisma.employeeSalary.findMany({
    where: { shopId: req.shop!.id },
    select: { month: true },
    distinct: ['month'],
    orderBy: { month: 'desc' },
  });
  res.json(rows.map((r) => r.month));
}));

// Salary status for a given month ("YYYY-MM", defaults to the current one).
// Every employee of the shop is returned, joined with their salary record for
// the requested month (or an empty/UNPAID placeholder if none exists yet).
router.get('/salaries', asyncHandler(async (req, res) => {
  const month = String(req.query.month || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const employees = await prisma.employee.findMany({
    where: { shopId: req.shop!.id },
    include: { salaries: { where: { month }, orderBy: { createdAt: 'desc' } } },
    orderBy: { name: 'asc' },
  });
  const rows = employees.map((e) => {
    const rec = e.salaries[0] || null;
    return {
      employeeId: e.id,
      employeeName: e.name,
      mobile: e.mobile,
      salary: e.salary,
      salaryRecordId: rec?.id ?? null,
      month,
      amount: rec?.amount ?? 0,
      status: rec?.status ?? 'UNPAID',
      paidAt: rec?.paidAt ?? null,
      remarks: rec?.remarks ?? null,
    };
  });
  res.json({ month, rows });
}));

// Mark an employee's salary as given (or update the amount/remarks of an
// existing payment) for the supplied month.
router.post('/salaries', asyncHandler(async (req, res) => {
  const { employeeId, month, amount, remarks } = req.body || {};
  if (!employeeId || !month) {
    return res.status(400).json({ error: 'employeeId and month are required' });
  }
  if (!/^\d{4}-\d{2}$/.test(String(month))) {
    return res.status(400).json({ error: 'month must be in YYYY-MM format' });
  }
  const employee = await prisma.employee.findFirst({ where: { id: Number(employeeId), shopId: req.shop!.id } });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const resolvedAmount = amount !== undefined && amount !== null && amount !== '' ? Number(amount) : employee.salary;

  const record = await prisma.employeeSalary.upsert({
    where: { employeeId_month: { employeeId: employee.id, month: String(month) } },
    update: {
      amount: resolvedAmount,
      status: 'PAID',
      paidAt: new Date(),
      remarks: remarks ? String(remarks) : null,
    },
    create: {
      employeeId: employee.id,
      shopId: req.shop!.id,
      month: String(month),
      amount: resolvedAmount,
      status: 'PAID',
      paidAt: new Date(),
      remarks: remarks ? String(remarks) : null,
    },
  });
  res.status(201).json(record);
}));

// Revert a salary payment to "not given" for the month by deleting the record.
router.delete('/salaries/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid salary record id' });
  const existing = await prisma.employeeSalary.findFirst({
    where: { id, shopId: req.shop!.id },
  });
  if (!existing) return res.status(404).json({ error: 'Salary record not found' });
  await prisma.employeeSalary.delete({ where: { id } });
  res.json({ ok: true });
}));

// =======================================================
// EMPLOYEES
// =======================================================

router.get('/', asyncHandler(async (req, res) => {
  const employees = await prisma.employee.findMany({
    where: { shopId: req.shop!.id },
    include: {
      salaries: {
        orderBy: { month: 'desc' },
        select: { id: true, month: true, amount: true, status: true, paidAt: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json(employees);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid employee id' });
  const employee = await prisma.employee.findFirst({
    where: { id, shopId: req.shop!.id },
    include: {
      salaries: { orderBy: { month: 'desc' } },
    },
  });
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  res.json(employee);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { name, address, mobile, age, education, salary } = req.body || {};
  if (!name || !mobile) {
    return res.status(400).json({ error: 'Employee name and mobile number are required' });
  }
  const employee = await prisma.employee.create({
    data: {
      shopId: req.shop!.id,
      name: String(name).trim(),
      address: address ? String(address) : null,
      mobile: String(mobile).trim(),
      age: age ? Number(age) : null,
      education: education ? String(education) : null,
      salary: salary ? Number(salary) : 0,
    },
  });
  res.status(201).json(employee);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid employee id' });
  const existing = await prisma.employee.findFirst({ where: { id, shopId: req.shop!.id } });
  if (!existing) return res.status(404).json({ error: 'Employee not found' });

  const { name, address, mobile, age, education, salary } = req.body || {};
  if (!name || !mobile) {
    return res.status(400).json({ error: 'Employee name and mobile number are required' });
  }
  const employee = await prisma.employee.update({
    where: { id },
    data: {
      name: String(name).trim(),
      address: address ? String(address) : null,
      mobile: String(mobile).trim(),
      age: age ? Number(age) : null,
      education: education ? String(education) : null,
      salary: salary ? Number(salary) : 0,
    },
  });
  res.json(employee);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid employee id' });
  const existing = await prisma.employee.findFirst({ where: { id, shopId: req.shop!.id } });
  if (!existing) return res.status(404).json({ error: 'Employee not found' });
  await prisma.employee.delete({ where: { id } });
  res.json({ ok: true });
}));

export default router;
