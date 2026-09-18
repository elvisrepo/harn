import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NAME_RE } from '../api/mod-images.ts';

const TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export const GET: APIRoute = async ({ params }) => {
  const name = params.name ?? '';
  // Strict gate: only server-generated uuid names, no traversal possible.
  if (!NAME_RE.test(name)) return new Response('Not found', { status: 404 });
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const buf = await readFile(path.join(process.cwd(), 'data', 'uploads', name)).catch(() => null);
  if (!buf) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': TYPE[ext] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
};
