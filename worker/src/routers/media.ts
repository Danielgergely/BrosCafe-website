// Serving uploaded photography from R2. Port of backend/app/routers/media.py. Uploading and deleting are in admin.ts.
import { HttpError, type Router } from '../http';
import * as media from '../services/media';

export function register(api: Router) {
  api.get('/media/{filename}', async (c) => {
    const filename = c.params.filename;
    if (!media.FILENAME.test(filename)) throw new HttpError(404, 'Not found');

    const obj = await c.env.MEDIA.get(filename);
    if (!obj) throw new HttpError(404, 'Not found');

    const doc = await media.find(c, filename);
    const headers: Record<string, string> = {
      'Content-Type': (doc ?? {}).content_type ?? 'application/octet-stream',
      'Content-Length': String(obj.size),
      'Last-Modified': obj.uploaded.toUTCString(),
      ETag: obj.httpEtag,
      // The name is a hash of the bytes, so this URL is immutable.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': 'inline',
    };
    if (c.req.method === 'HEAD') {
      await obj.body.cancel();
      return new Response(null, { headers });
    }
    return new Response(obj.body, { headers });
  });
}
