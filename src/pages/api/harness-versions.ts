import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { auth } from '../../lib/auth.ts';
import { db, schema } from '../../../db/client.ts';
import { createHarnessVersion, listHarnessVersions } from '../../lib/harness.ts';

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function requireAdmin(request: Request): Promise<boolean> {
  const res = await auth.api.getSession({ headers: request.headers });
  return !!res?.session;
}

export const GET: APIRoute = async () => ok(await listHarnessVersions());

export const POST: APIRoute = async ({ request }) => {
  if (!(await requireAdmin(request))) return ok({ error: 'Unauthorized' }, 401);
  const input = (await request.json().catch(() => ({}))) as { label?: string; summary?: string };
  const result = await createHarnessVersion(input.label ?? '', input.summary ?? '');
  return ok(result, 201);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  if (!(await requireAdmin(request))) return ok({ error: 'Unauthorized' }, 401);
  const id = url.searchParams.get('id');
  if (!id) return ok({ error: 'id is required' }, 400);
  await db.delete(schema.harnessVersions).where(eq(schema.harnessVersions.id, id));
  return ok({ deleted: true });
};