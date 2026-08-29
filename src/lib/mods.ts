import { asc } from 'drizzle-orm';
import { db, schema } from '../../db/client.ts';

export interface ModView {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string;
  body: string;
  considered: boolean;
  implemented: boolean;
  wanted: boolean;
  tags: string[];
  links: { label: string; url: string }[];
  createdAt: number;
  updatedAt: number;
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toView(m: schema.Mod): ModView {
  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    category: m.category,
    summary: m.summary,
    body: m.body,
    considered: m.considered === 1,
    implemented: m.implemented === 1,
    wanted: m.wanted === 1,
    tags: parseJson<string[]>(m.tags, []),
    links: parseJson<{ label: string; url: string }[]>(m.links, []),
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export async function listMods(): Promise<ModView[]> {
  const rows = await db.select().from(schema.mods).orderBy(asc(schema.mods.title));
  return rows.map(toView);
}

export async function getModBySlug(slug: string): Promise<ModView | null> {
  const row = await db.query.mods.findFirst({ where: (m, { eq }) => eq(m.slug, slug) });
  return row ? toView(row) : null;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}