<<<<<<< HEAD
import os from 'os';
import { PrismaClient } from '@prisma/client';

// Prisma sizes its connection pool from the host's CPU count (cores * 2 + 1).
// That heuristic is badly wrong for this app's deployment: a Vercel function
// gets 1 vCPU, so the pool is 3, while a dev machine with 8 cores gets 17. Any
// endpoint that fans out into parallel queries — the Dashboard fires around
// twenty — then has to run them three at a time in production, queueing behind
// a pool that is only small by accident. Measured against this database, twenty
// parallel aggregates take ~1780ms at a limit of 3 and ~520ms at 10, so the
// same page is roughly three times slower deployed than it looks locally.
//
// This applies a floor rather than a fixed size: a machine whose own heuristic
// already asks for more keeps it, and only the undersized case is lifted, so
// nothing can come out slower than before. Ten is comfortable against Neon's
// pooled endpoint (PgBouncer multiplexes many client connections onto few
// server ones) and well under the direct-connection cap if the URL ever points
// at one.
//
// An explicit connection_limit already in DATABASE_URL always wins, so this can
// be overridden per environment without a code change.
const MIN_CONNECTION_LIMIT = 10;

const prismaDefaultLimit = () => os.cpus().length * 2 + 1;

function pooledUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.searchParams.has('connection_limit')) return raw;
    const limit = Number(process.env.DATABASE_CONNECTION_LIMIT)
      || Math.max(prismaDefaultLimit(), MIN_CONNECTION_LIMIT);
    url.searchParams.set('connection_limit', String(limit));
    return url.toString();
  } catch {
    // A URL shape Node can't parse is left exactly as it was — the pool size is
    // not worth risking a connection string over.
    return raw;
  }
}

=======
import { PrismaClient } from '@prisma/client';

>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
// Reuse a single PrismaClient across invocations in serverless environments
// (Vercel) instead of opening a fresh connection pool on every cold start.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

<<<<<<< HEAD
function createClient(): PrismaClient {
  const url = pooledUrl();
  return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? createClient();
=======
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
globalForPrisma.prisma = prisma;
