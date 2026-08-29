import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { auth } from '../../lib/auth.ts';
import { db, schema } from '../../../db/client.ts';
import { slugify } from '../../lib/mods.ts';

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fail(message: string, status = 400) {
  return ok({ error: message }, status);
}

interface ModInput {
  id?: string;
  title?: string;
  slug?: string;
  category?: string;
  summary?: string;
  body?: string;
  considered?: boolean | number;
  implemented?: boolean | number;
  wanted?: boolean | number;
  tags?: string[];
  links?: { label: string; url: string }[];
}

function toInt(v: boolean | number | undefined): number {
  return v ? 1 : 0;
}

async function requireAdmin(request: Request): Promise<boolean> {
  const res = await auth.api.getSession({ headers: request.headers });
  return !!res?.session;
}

export const GET: APIRoute = async () => {
  const rows = await db.select().from(schema.mods);
  return ok(rows);
};

export const POST: APIRoute = async ({ request }) => {
  if (!(await requireAdmin(request))) return fail('Unauthorized', 401);
  const input = (await request.json()) as ModInput;
  const title = (input.title ?? '').trim();
  if (!title) return fail('title is required');

  const now = Date.now();
  const slug = slugify(input.slug ?? title);
  const existing = await db.query.mods.findFirst({ where: (m, { eq }) => eq(m.slug, slug) });
  if (existing) {
    return fail(`A mod with slug "${slug}" already exists (edit it instead)`, 409);
  }

  const id = crypto.randomUUID();
  await db.insert(schema.mods).values({
    id,
    slug,
    title,
    category: input.category?.trim() || 'Uncategorized',
    summary: input.summary?.trim() ?? '',
    body: input.body ?? '',
    considered: toInt(input.considered),
    implemented: toInt(input.implemented),
    wanted: toInt(input.wanted),
    tags: JSON.stringify(input.tags ?? []),
    links: JSON.stringify(input.links ?? []),
    createdAt: now,
    updatedAt: now,
  });
  return ok({ id, slug }, 201);
};

export const PUT: APIRoute = async ({ request }) => {
  if (!(await requireAdmin(request))) return fail('Unauthorized', 401);
  const input = (await request.json()) as ModInput;
  if (!input.id) return fail('id is required');

  const existing = await db.query.mods.findFirst({ where: (m, { eq }) => eq(m.id, input.id!) });
  if (!existing) return fail('Mod not found', 404);

  const title = (input.title ?? existing.title).trim();
  const slug = slugify(input.slug ?? title);
  const dup = await db.query.mods.findFirst({
    where: (m, { eq, and, ne }) => and(eq(m.slug, slug), ne(m.id, existing.id)),
  });
  if (dup) return fail(`Another mod already uses slug "${slug}"`, 409);

  await db
    .update(schema.mods)
    .set({
      title,
      slug,
      category: input.category?.trim() || existing.category,
      summary: input.summary !== undefined ? input.summary.trim() : existing.summary,
      body: input.body !== undefined ? input.body : existing.body,
      considered: input.considered !== undefined ? toInt(input.considered) : existing.considered,
      implemented: input.implemented !== undefined ? toInt(input.implemented) : existing.implemented,
      wanted: input.wanted !== undefined ? toInt(input.wanted) : existing.wanted,
      tags: input.tags !== undefined ? JSON.stringify(input.tags) : existing.tags,
      links: input.links !== undefined ? JSON.stringify(input.links) : existing.links,
      updatedAt: Date.now(),
    })
    .where(eq(schema.mods.id, existing.id));

  return ok({ id: existing.id, slug });
};

export const DELETE: APIRoute = async ({ request, url }) => {
  if (!(await requireAdmin(request))) return fail('Unauthorized', 401);
  const id = url.searchParams.get('id');
  if (!id) return fail('id is required');
  const result = await db.delete(schema.mods).where(eq(schema.mods.id, id));
  return ok({ deleted: true });
};