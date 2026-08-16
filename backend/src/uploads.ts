import multer from 'multer';

// Vercel's serverless filesystem is read-only (aside from an ephemeral /tmp
// that isn't shared across invocations), so uploads are kept in memory and
// persisted as base64 data URIs (logos) or parsed in-process (CSV imports)
// rather than written to disk.
const memoryStorage = multer.memoryStorage();

export const uploadLogo = multer({
  storage: memoryStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image uploads are allowed'));
  },
});

export const uploadCsv = multer({
  storage: memoryStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
});
