import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Environment loading, kept in its own module so it can run FIRST.
//
// Several modules read process.env while they are being imported rather than
// when they're called — auth.ts throws if JWT_SECRET is missing, db.ts
// constructs a PrismaClient that needs DATABASE_URL. Those run as part of
// app.ts's import block, and CommonJS executes requires in source order, so a
// dotenv.config() written below that block would always be too late. Hence:
// `import './env'` is app.ts's first import, and this file must stay free of
// imports from the rest of src/.
//
// The repo keeps a single .env at the workspace root, but pnpm runs each
// package's dev script with that package's own directory as the CWD, so the
// CWD-relative default would miss it. Walk up from this file instead and take
// the nearest .env — backend/.env wins over the workspace root one if both
// exist, matching how tools normally layer env files.
//
// In production (Vercel) there is no .env file at all: the platform injects
// real environment variables, nothing is found here, and dotenv is never
// called. dotenv also never overwrites a variable that is already set, so a
// stray file could not shadow the deployed configuration either.
let dir = __dirname;
for (let depth = 0; depth < 5; depth += 1) {
  const candidate = path.join(dir, '.env');
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
