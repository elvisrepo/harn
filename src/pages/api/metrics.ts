import type { APIRoute } from 'astro';
import { renderMetrics } from '../../lib/observability.ts';

// Prometheus text exposition — scrapeable today, queryable if a TSDB arrives.
export const GET: APIRoute = () =>
  new Response(renderMetrics(), {
    status: 200,
    headers: { 'content-type': 'text/plain; version=0.0.4' },
  });
