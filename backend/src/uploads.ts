import multer from 'multer';
<<<<<<< HEAD
import type { RequestHandler } from 'express';
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77

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
<<<<<<< HEAD

// A supplier's invoice against a GRN or an adjustment — a photo, a scan, a PDF
// or an office document, because that is the range of things suppliers actually
// send. Larger than a logo because a phone photo of an invoice easily runs to
// several megabytes. Anything outside this list is refused by name rather than
// silently accepted and then unopenable.
const ATTACHMENT_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/rtf',
]);

export const uploadAttachment = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype) || ATTACHMENT_DOCUMENT_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error('Attach an image, a PDF or a document — that file type is not accepted'));
  },
});

// Turn an upload rejection into a plain 400 with its reason.
//
// multer reports a refused file (wrong type, too large) by handing an Error to
// next(), which the app's error middleware answers as a 500 with a stack trace.
// Choosing the wrong file is the user's mistake, not the server's, and they
// need to be told which — so these are answered as 400 with the message.
export function handleUpload(middleware: RequestHandler): RequestHandler {
  return (req, res, next) => {
    middleware(req, res, (err?: unknown) => {
      if (!err) return next();
      const message = err instanceof Error ? err.message : 'Could not read the uploaded file';
      // multer's own size error is phrased for developers, not shopkeepers.
      const friendly = /file too large/i.test(message)
        ? 'That file is too large — the limit is 10MB'
        : message;
      res.status(400).json({ error: friendly });
    });
  };
}
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
