import type { APIRoute } from 'astro';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auth } from '../../lib/auth.ts';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};
// Server-generated names only — the gate doubles as a traversal guard.
export const NAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|gif|webp)$/;

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(message: string, status = 400) {
  return ok({ error: message }, status);
}

async function requireAdmin(request: Request): Promise<boolean> {
  const res = await auth.api.getSession({ headers: request.headers });
  return !!res?.session;
}

function dir() {
  return path.join(process.cwd(), 'data', 'uploads');
}

export const POST: APIRoute = async ({ request }) => {
  if (!(await requireAdmin(request))) return fail('Unauthorized', 401);
  const form = await request.formData().catch(() => null);
  const file = form?.get('image');
  if (!(file instanceof File) || file.size === 0) return fail('image file is required');
  if (file.size > MAX_BYTES) return fail('image must be ≤ 2 MB', 413);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED[ext] || !file.type.startsWith('image/')) {
    return fail('only png, jpg, gif, webp images', 415);
  }
  const name = `${crypto.randomUUID()}.${ext}`;
  await mkdir(dir(), { recursive: true });
  await writeFile(path.join(dir(), name), Buffer.from(await file.arrayBuffer()));
  return ok({ url: `/uploads/${name}` }, 201);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  if (!(await requireAdmin(request))) return fail('Unauthorized', 401);
  const name = url.searchParams.get('name') ?? '';
  if (!NAME_RE.test(name)) return fail('unknown image', 404);
  await unlink(path.join(dir(), name)).catch(() => null);
  return ok({ deleted: true });
};
