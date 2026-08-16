import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { apiLimiter, authLimiter } from './middleware/rateLimit';
import authRoutes from './routes/authRoutes';
import superadminRoutes from './routes/superadminRoutes';
import shopRoutes from './routes/shopRoutes';
import stockDataRoutes from './routes/stockDataRoutes';
import billingRoutes from './routes/billingRoutes';
import customerRoutes from './routes/customerRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import salesReportRoutes from './routes/salesReportRoutes';
import csvImportRoutes from './routes/csvImportRoutes';
import purchaseRequisitionRoutes from './routes/purchaseRequisitionRoutes';
import purchaseOrderRoutes from './routes/purchaseOrderRoutes';
import grnRoutes from './routes/grnRoutes';
import grnWithoutPoRoutes from './routes/grnWithoutPoRoutes';
import vstRoutes from './routes/vstRoutes';
import rtvRoutes from './routes/rtvRoutes';
import adjWithPoRoutes from './routes/adjWithPoRoutes';
import adjOthersRoutes from './routes/adjOthersRoutes';
import employeeRoutes from './routes/employeeRoutes';
import expenseRoutes from './routes/expenseRoutes';

dotenv.config();

const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((o) => o.trim());

// Always allow local dev origins so the Next.js dev server (localhost:3000)
// can reach this API even when CORS_ORIGIN only lists the production frontend.
const devOrigins = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const corsOrigins = allowedOrigins ? [...new Set([...allowedOrigins, ...devOrigins])] : undefined;

const app = express();
app.use(cors(corsOrigins ? { origin: corsOrigins } : undefined));
app.use(compression());
app.use(express.json());
app.use('/api', apiLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => res.json({ service: 'MediBox API', ok: true }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/superadmin', superadminRoutes);
app.use('/api/shops/:slug', shopRoutes);
app.use('/api/shops/:slug', stockDataRoutes);
app.use('/api/shops/:slug', billingRoutes);
app.use('/api/shops/:slug', customerRoutes);
app.use('/api/shops/:slug', dashboardRoutes);
app.use('/api/shops/:slug', salesReportRoutes);
app.use('/api/shops/:slug', csvImportRoutes);
app.use('/api/shops/:slug/purchase-requisitions', purchaseRequisitionRoutes);
app.use('/api/shops/:slug/purchase-orders', purchaseOrderRoutes);
app.use('/api/shops/:slug/grn', grnRoutes);
app.use('/api/shops/:slug/grn-without-po', grnWithoutPoRoutes);
app.use('/api/shops/:slug/vst', vstRoutes);
app.use('/api/shops/:slug/rtv', rtvRoutes);
app.use('/api/shops/:slug/adj-with-po', adjWithPoRoutes);
app.use('/api/shops/:slug/adj-others', adjOthersRoutes);
app.use('/api/shops/:slug/employees', employeeRoutes);
app.use('/api/shops/:slug/expenses', expenseRoutes);

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

export default app;
