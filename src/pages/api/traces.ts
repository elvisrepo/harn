import type { APIRoute } from 'astro';
import { recentTraces } from '../../lib/observability.ts';

// Recent request traces (ring buffer, newest first). Operational readout,
// same visibility class as /harness — no secrets, timings only.
export const GET: APIRoute = ({ url }) => {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));
  return Response.json(recentTraces(limit));
};
