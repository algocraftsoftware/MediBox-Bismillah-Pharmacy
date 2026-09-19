// Vercel serverless entry point. The Express app itself lives in src/app.ts
// so it can be reused by the local dev server (src/index.ts) without pulling
// in a listener. vercel.json rewrites every request to this function; Express
// does its own routing based on the original req.url.
import app from '../src/app';

export default app;
