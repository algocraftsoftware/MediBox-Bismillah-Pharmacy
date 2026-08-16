import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// __dirname isn't available here — this config loads as ESM in this
// Next.js version — so it silently evaluated to undefined and Turbopack
// fell back to inferring a root from wherever it happened to be
// compiling (src/app), instead of failing loudly. import.meta.url is the
// ESM-safe equivalent.
const thisDir = path.dirname(fileURLToPath(import.meta.url));

// pnpm's node_modules uses symlinks — frontend/node_modules/next points
// OUT to the monorepo root's node_modules/.pnpm store, outside frontend/
// itself. Turbopack refuses to resolve anything outside its configured
// root, so root has to be the monorepo root (the parent of frontend/),
// not frontend/ itself, or it can't find next/package.json at all.
// (This is also why Turbopack's own auto-detection already picked the
// monorepo root by default — that part was correct; it only warned
// because frontend/ and backend/ each also have a stray, redundant
// pnpm-workspace.yaml/pnpm-lock.yaml of their own, making the choice
// ambiguous. Pinning it here just resolves that ambiguity explicitly.)
const workspaceRoot = path.resolve(thisDir, "..");

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot,
  },
};

export default nextConfig;
