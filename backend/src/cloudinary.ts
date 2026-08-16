import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const configured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

// Upload an image buffer to Cloudinary and return its secure URL. If
// Cloudinary isn't configured (e.g. local dev), fall back to the legacy
// base64 data URI so nothing breaks.
function uploadImageBuffer(
  buffer: Buffer,
  mimetype: string,
  folder: string,
  transformation: Record<string, unknown>[]
): Promise<string> {
  if (!configured) {
    return Promise.resolve(`data:${mimetype};base64,${buffer.toString('base64')}`);
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto', transformation },
      (error, result) => {
        if (error || !result) return reject(error || new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

export function uploadLogoBuffer(buffer: Buffer, mimetype: string): Promise<string> {
  return uploadImageBuffer(buffer, mimetype, 'medibox/shop-logos', [{ width: 400, height: 400, crop: 'limit' }]);
}

// Signatures are wide/short (a signature strip, not a square logo) — capped
// wider and shallower so a normal signature scan isn't awkwardly squeezed.
export function uploadSignatureBuffer(buffer: Buffer, mimetype: string): Promise<string> {
  return uploadImageBuffer(buffer, mimetype, 'medibox/shop-signatures', [{ width: 600, height: 240, crop: 'limit' }]);
}
