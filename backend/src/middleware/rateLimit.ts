import rateLimit from 'express-rate-limit';
<<<<<<< HEAD
import type { Request } from 'express';

// =======================================================
// RATE LIMITING
//
// These limiters identify a client by IP, which only works if Express can see
// the real one. Deployed on Vercel every request arrives from the platform's
// proxy, so without `trust proxy` (set in app.ts) req.ip is the proxy for
// everybody and all of these buckets are shared platform-wide: 300 requests per
// 15 minutes for every user of every shop put together, and 20 login attempts
// in total. The app polls the session every 30s and the dashboard every 20s, so
// four people with a dashboard open would exhaust the whole allowance between
// them and the rest would start seeing "Too many requests".
//
// With the real client IP visible, the ceilings below are per user rather than
// per platform, which is what they were always written for.
// =======================================================

// Health checks are what a monitor or the platform itself calls, often on a
// short timer. They touch nothing and should never consume a person's budget.
const skipHealthChecks = (req: Request) => req.path === '/health' || req.path === '/api/health';

// Sized for what one busy person actually generates in 15 minutes: the session
// refresh (30 per window) and dashboard poll (45 per window) run on timers
// before anyone clicks anything, and a screen like Billing or GRN fires several
// requests per page. Several staff still commonly share one office IP, so this
// leaves room for a handful of them at once while remaining far below what a
// runaway script or scraper would produce.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipHealthChecks,
=======

// Global ceiling for all /api traffic — generous enough for normal shop
// usage (billing, dashboards polling, etc.) while blunting runaway/abusive
// clients. Standard RateLimit-* response headers, legacy X-RateLimit-* off.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limit on login attempts specifically, to blunt credential
// brute-forcing without affecting normal authenticated traffic.
<<<<<<< HEAD
//
// Only failed attempts count. A shop's staff sit behind one office IP, and
// counting successes too meant a handful of people signing in normally at the
// start of a shift could use up the allowance and lock out the rest — while
// doing nothing to slow an attacker, whose attempts fail by definition.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts, please try again later.' },
});

// Spreadsheet exports read and serialise the whole matching table — tens of
// thousands of rows for a full catalog. One person clicking Download a few
// times is normal; a loop pulling them continuously is not, and is expensive
// enough to be worth its own ceiling rather than sharing the general one.
export const exportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many downloads in a short time, please wait a moment and try again.' },
});
=======
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
