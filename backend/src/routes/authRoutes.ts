import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { prisma } from '../db';
import { signToken } from '../auth';

const router = Router();

router.post('/superadmin/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const admin = await prisma.superAdmin.findUnique({ where: { email: String(email).toLowerCase() } });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken({ role: 'SUPER_ADMIN', sub: admin.id });
  res.json({ token, admin: { id: admin.id, name: admin.name, email: admin.email } });
});

router.post('/shop/:slug/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  // Slugs are always stored lowercase (normalized at shop-creation time), but
  // the URL segment a user actually types/pastes isn't guaranteed to match
  // that case — lowercase it here too so login isn't case-sensitive.
  const shop = await prisma.shop.findUnique({ where: { slug: req.params.slug.toLowerCase() } });
  if (!shop || shop.status !== 'ACTIVE') {
    return res.status(404).json({ error: 'Shop not found' });
  }

  const admin = await prisma.shopAdmin.findFirst({
    where: { shopId: shop.id, username: { equals: username, mode: 'insensitive' } },
  });
  if (!admin || admin.status !== 'ACTIVE' || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = signToken({
    role: 'SHOP_ADMIN',
    sub: admin.id,
    shopId: shop.id,
    shopSlug: shop.slug,
    adminRole: admin.role,
    permissions: admin.permissions,
  });
  res.json({
    token,
    admin: {
      id: admin.id,
      name: admin.name,
      username: admin.username,
      role: admin.role,
      permissions: admin.permissions,
    },
    shop: { id: shop.id, name: shop.name, slug: shop.slug, logoUrl: shop.logoUrl },
  });
});

export default router;
