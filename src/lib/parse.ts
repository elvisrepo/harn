/**
 * Parse, don't validate (King): boundary parsers that return refined types
 * carrying their proof — handlers below never touch raw input shapes.
 * Every mutation route parses once, up front; downstream code trusts the
 * result without re-checking (no shotgun parsing).
 */

export interface ParsedMod {
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

export interface ParsedVersion {
  label?: string;
  summary?: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asString = (v: unknown, field: string): string | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new Error(`${field} must be a string`);
  return v;
};

const asStringArray = (v: unknown, field: string): string[] | undefined => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new Error(`${field} must be an array of strings`);
  }
  return v;
};

const asFlag = (v: unknown, field: string): boolean | number | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean' && typeof v !== 'number') {
    throw new Error(`${field} must be a boolean or number`);
  }
  return v;
};

/** Parse mod input once at the boundary; handlers trust the result. */
export function parseMod(input: unknown): ParseResult<ParsedMod> {
  try {
    if (!isRecord(input)) return { ok: false, error: 'body must be a JSON object' };
    const links = input.links;
    if (links !== undefined) {
      if (!Array.isArray(links) || !links.every((l) => isRecord(l) && typeof l.label === 'string' && typeof l.url === 'string')) {
        return { ok: false, error: 'links must be an array of {label, url} strings' };
      }
    }
    return {
      ok: true,
      value: {
        id: asString(input.id, 'id'),
        title: asString(input.title, 'title')?.trim() || undefined,
        slug: asString(input.slug, 'slug'),
        category: asString(input.category, 'category')?.trim() || undefined,
        summary: asString(input.summary, 'summary'),
        body: asString(input.body, 'body'),
        considered: asFlag(input.considered, 'considered'),
        implemented: asFlag(input.implemented, 'implemented'),
        wanted: asFlag(input.wanted, 'wanted'),
        tags: asStringArray(input.tags, 'tags'),
        links: links as ParsedMod['links'],
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invalid input' };
  }
}

/** Parse harness-version input once at the boundary. */
export function parseVersion(input: unknown): ParseResult<ParsedVersion> {
  try {
    if (!isRecord(input)) return { ok: false, error: 'body must be a JSON object' };
    return {
      ok: true,
      value: {
        label: asString(input.label, 'label'),
        summary: asString(input.summary, 'summary'),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'invalid input' };
  }
}
