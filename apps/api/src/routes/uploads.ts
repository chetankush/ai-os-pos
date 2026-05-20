import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

const BUCKET = 'cafe-assets';
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * Image upload — the browser POSTs a multipart file; we push it to Supabase
 * Storage using the service key (bypasses storage RLS) and return the public
 * URL, which callers store in cafe.logoUrl / menuItem.imageUrl.
 */
export async function uploadsRoutes(app: FastifyInstance): Promise<void> {
  const supabaseUrl = app.config.SUPABASE_URL;
  const secretKey = app.config.SUPABASE_SECRET_KEY;

  app.post('/uploads', { preHandler: app.authenticate }, async (request, reply) => {
    if (!supabaseUrl || !secretKey) {
      return reply.status(503).send({
        error: { code: 'STORAGE_UNCONFIGURED', message: 'Image storage is not configured' },
      });
    }

    const file = await request.file();
    if (!file) {
      return reply.status(400).send({
        error: { code: 'NO_FILE', message: 'No file provided' },
      });
    }
    if (!ALLOWED.has(file.mimetype)) {
      return reply.status(400).send({
        error: { code: 'BAD_TYPE', message: 'Only PNG, JPEG, WebP, or AVIF images are allowed' },
      });
    }

    const buffer = await file.toBuffer(); // @fastify/multipart enforces the size limit
    const path = `${request.user.id}/${randomUUID()}.${EXT[file.mimetype]}`;

    const res = await fetch(
      `${supabaseUrl}/storage/v1/object/${BUCKET}/${path}`,
      {
        method: 'POST',
        headers: {
          apikey: secretKey,
          authorization: `Bearer ${secretKey}`,
          'content-type': file.mimetype,
          'x-upsert': 'true',
        },
        body: buffer,
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      request.log.error({ status: res.status, detail }, 'storage upload failed');
      return reply.status(502).send({
        error: { code: 'UPLOAD_FAILED', message: 'Could not store the image' },
      });
    }

    const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
    return reply.status(201).send({ url });
  });
}
