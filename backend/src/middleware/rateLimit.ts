import rateLimit from 'express-rate-limit';

// Global ceiling for all /api traffic — generous enough for normal shop
// usage (billing, dashboards polling, etc.) while blunting runaway/abusive
// clients. Standard RateLimit-* response headers, legacy X-RateLimit-* off.
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Stricter limit on login attempts specifically, to blunt credential
// brute-forcing without affecting normal authenticated traffic.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later.' },
});
