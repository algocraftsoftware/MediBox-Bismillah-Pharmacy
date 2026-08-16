import { PrismaClient } from '@prisma/client';

// Reuse a single PrismaClient across invocations in serverless environments
// (Vercel) instead of opening a fresh connection pool on every cold start.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();
globalForPrisma.prisma = prisma;
