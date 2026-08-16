import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './db';

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set in the environment.');
}

export type AuthPayload =
  | { role: 'SUPER_ADMIN'; sub: number }
  | {
      role: 'SHOP_ADMIN';
      sub: number;
      shopId: number;
      shopSlug: string;
      adminRole: 'ADMIN' | 'STAFF';
      permissions: string[];
    };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      shop?: {
        id: number;
        slug: string;
        name: string;
        logoUrl: string | null;
        preparedBySignatureUrl: string | null;
        reviewedBySignatureUrl: string | null;
        approvedBySignatureUrl: string | null;
        address: string | null;
        phone: string | null;
      };
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length);
  }
  return null;
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as AuthPayload;
    if (payload.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    req.auth = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Loads the shop from the :slug route param and ensures the token's shopId
// matches it, so a shop admin can never reach another shop's data by
// editing the URL.
export async function requireShopAdmin(req: Request, res: Response, next: NextFunction) {
  // Same case-insensitivity as the login route — slugs are stored lowercase,
  // but the URL segment a caller sends isn't guaranteed to match that case.
  const slug = req.params.slug.toLowerCase();
  const shop = await prisma.shop.findUnique({ where: { slug } });
  if (!shop || shop.status !== 'ACTIVE') {
    return res.status(404).json({ error: 'Shop not found' });
  }

  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as unknown as AuthPayload;
    if (payload.role !== 'SHOP_ADMIN' || payload.shopId !== shop.id) {
      return res.status(403).json({ error: 'Access denied for this shop' });
    }
    req.auth = payload;
    req.shop = {
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      logoUrl: shop.logoUrl,
      preparedBySignatureUrl: shop.preparedBySignatureUrl,
      reviewedBySignatureUrl: shop.reviewedBySignatureUrl,
      approvedBySignatureUrl: shop.approvedBySignatureUrl,
      address: shop.address,
      phone: shop.phone,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Gate a feature area behind the account's granted permissions. Must run
// after requireShopAdmin (needs req.auth populated). Accepts multiple feature
// ids when an endpoint is shared by more than one menu page (e.g. customer
// lookup is used by both Billing and Customer Registration) — any one match
// is sufficient. A missing permissions array (shouldn't happen post-migration,
// but defensively) denies access. `ADMIN` role always has full access,
// regardless of its stored permissions array — mirrors the frontend's own
// route-gate bypass (`adminRole === "ADMIN"` in layout.tsx) and the intent
// baked into DEFAULT_ADMIN_PERMISSIONS at account-creation time; this also
// means a brand-new feature (e.g. Expenses) works for existing ADMIN accounts
// immediately, without needing a DB backfill or a superadmin checklist edit.
export function requirePermission(...featureIds: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth || auth.role !== 'SHOP_ADMIN') {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (auth.adminRole === 'ADMIN') {
      return next();
    }
    if (!featureIds.some((id) => auth.permissions?.includes(id))) {
      return res.status(403).json({ error: `This account does not have access to "${featureIds.join('" or "')}"` });
    }
    next();
  };
}

// Unlike requirePermission, this is not grantable via the Staff permission
// checklist at all — Settings (changing any account's username/password,
// including its own) is deliberately Admin-only with no override, since a
// Staff account editing credentials (its own or another's) is a real
// security concern the regular per-feature permission system isn't meant to
// cover.
export function requireAdminRole(req: Request, res: Response, next: NextFunction) {
  const auth = req.auth;
  if (!auth || auth.role !== 'SHOP_ADMIN' || auth.adminRole !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
