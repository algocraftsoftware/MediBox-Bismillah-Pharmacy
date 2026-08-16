import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission, requireShopAdmin } from '../auth';
import { asyncHandler } from '../asyncHandler';

const router = Router({ mergeParams: true });
router.use(requireShopAdmin);

// =======================================================
// CUSTOMERS
// =======================================================

router.get('/customers', requirePermission('customer-registration', 'billing'), async (req, res) => {
  const { storeId, custType, gender, customerCode, mobile, employeeId, q } = req.query;
  const where: any = { shopId: req.shop!.id };
  if (storeId) where.storeId = Number(storeId);
  if (custType) where.custType = String(custType);
  if (gender) where.gender = String(gender);
  if (customerCode) where.customerCode = { contains: String(customerCode) };

  // Mobile and employee id share one search box ("Mobile / EID-PF"), so they
  // must be OR'd — requiring both would return nothing for general customers,
  // who have no employee id.
  const orFilters: any[] = [];
  if (mobile) orFilters.push({ mobile: { contains: String(mobile).trim() } });
  if (employeeId) orFilters.push({ employeeId: { contains: String(employeeId).trim() } });
  if (q) {
    orFilters.push(
      { name: { contains: String(q), mode: 'insensitive' } },
      { mobile: { contains: String(q) } },
      { customerCode: { contains: String(q) } },
      { employeeId: { contains: String(q) } },
    );
  }
  if (orFilters.length) where.OR = orFilters;

  const customers = await prisma.customer.findMany({
    where,
    include: { store: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json(customers);
});

router.post('/customers', requirePermission('customer-registration', 'billing'), async (req, res) => {
  const {
    storeId,
    custType,
    name,
    mobile,
    address,
    gender,
    birthDate,
    marriageDate,
    email,
    nid,
    passport,
    orgName,
    designation,
    employeeId,
    creditLimit,
    creditBalance,
  } = req.body || {};

  if (!storeId || !name || !mobile) {
    return res.status(400).json({ error: 'Store, customer name, and mobile number are required' });
  }

  const shopId = req.shop!.id;
  const normalizedMobile = String(mobile).trim();
  const resolvedCustType = custType || 'GENERAL';
  // A credit limit only ever means anything for VVIP accounts — silently
  // zero it out for every other type instead of trusting client input, so a
  // non-VVIP customer can never be given credit/due billing.
  const resolvedCreditLimit = resolvedCustType === 'VVIP' && creditLimit ? Number(creditLimit) : 0;

  // Make sure the selected store actually belongs to this shop before creating
  // anything — otherwise the insert would fail with a confusing FK error.
  const store = await prisma.store.findFirst({ where: { id: Number(storeId), shopId } });
  if (!store) {
    return res.status(400).json({ error: 'Invalid store selected for this shop' });
  }

  try {
    const customer = await prisma.$transaction(
      async (tx) => {
        const counter = await tx.customerCounter.update({
          where: { shopId },
          data: { value: { increment: 1 } },
        });
        const customerCode = String(counter.value).padStart(7, '0');

        return tx.customer.create({
          data: {
            shopId,
            storeId: Number(storeId),
            customerCode,
            custType: resolvedCustType,
            name,
            mobile: normalizedMobile,
            address,
            gender: gender || null,
            birthDate: birthDate ? new Date(birthDate) : null,
            marriageDate: marriageDate ? new Date(marriageDate) : null,
            email,
            nid,
            passport,
            orgName,
            designation,
            employeeId,
            creditLimit: resolvedCreditLimit,
            creditBalance: creditBalance ? Number(creditBalance) : 0,
          },
        });
      },
      { timeout: 20000, maxWait: 10000 },
    );
    res.status(201).json(customer);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res
        .status(409)
        .json({ error: `A customer with mobile number ${normalizedMobile} is already registered in this shop` });
    }
    if (err?.code === 'P2003') {
      return res.status(400).json({ error: 'Invalid reference for customer registration' });
    }
    console.error('Customer registration failed:', err);
    return res.status(500).json({ error: 'Could not register customer. Please try again.' });
  }
});

router.put('/customers/:id', requirePermission('customer-registration', 'billing'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid customer id' });
  const shopId = req.shop!.id;
  const existing = await prisma.customer.findFirst({ where: { id, shopId } });
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  const {
    storeId,
    custType,
    name,
    mobile,
    address,
    gender,
    birthDate,
    marriageDate,
    email,
    nid,
    passport,
    orgName,
    designation,
    employeeId,
    creditLimit,
  } = req.body || {};

  if (!name || !mobile) {
    return res.status(400).json({ error: 'Customer name and mobile number are required' });
  }

  const resolvedCustType = custType || existing.custType;
  const resolvedCreditLimit = resolvedCustType === 'VVIP' ? Number(creditLimit) || 0 : 0;
  const normalizedMobile = String(mobile).trim();

  if (storeId) {
    const store = await prisma.store.findFirst({ where: { id: Number(storeId), shopId } });
    if (!store) return res.status(400).json({ error: 'Invalid store selected for this shop' });
  }

  try {
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(storeId ? { storeId: Number(storeId) } : {}),
        custType: resolvedCustType,
        name,
        mobile: normalizedMobile,
        address: address ?? null,
        gender: gender || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        marriageDate: marriageDate ? new Date(marriageDate) : null,
        email: email ?? null,
        nid: nid ?? null,
        passport: passport ?? null,
        orgName: orgName ?? null,
        designation: designation ?? null,
        employeeId: employeeId ?? null,
        creditLimit: resolvedCreditLimit,
      },
    });
    res.json(customer);
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return res
        .status(409)
        .json({ error: `A customer with mobile number ${normalizedMobile} is already registered in this shop` });
    }
    console.error('Customer update failed:', err);
    return res.status(500).json({ error: 'Could not update customer. Please try again.' });
  }
}));

export default router;
