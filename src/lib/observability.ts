/**
 * Minimal single-process observability — the local analogue of the
 * per-worktree stack (logs + metrics + traces), zero dependencies:
 * - LOGS: JSONL access log at data/access.log (gitignored) — grep/jq-able
 * - METRICS: Prometheus text exposition (counters, avg/p50 durations)
 * - TRACES: request IDs (X-Request-Id) + checkpoint ring (last 200)
 * No daemons, no query languages to learn; Vector could tail the JSONL later.
 */
import fs from 'node:fs';
import path from 'node:path';

const LOG = path.join(process.cwd(), 'data', 'access.log');

export interface Checkpoint {
  name: string;
  ms: number;
}

export interface Trace {
  id: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  startedAt: string;
  checkpoints: Checkpoint[];
}

interface Store {
  startedAt: number;
  requests: number;
  statusCounts: Record<string, number>;
  pathCounts: Record<string, number>;
  durations: number[];
  traces: Trace[];
}

const g = globalThis as unknown as { __harn_obs?: Store };
if (!g.__harn_obs) {
  g.__harn_obs = {
    startedAt: Date.now(),
    requests: 0,
    statusCounts: {},
    pathCounts: {},
    durations: [],
    traces: [],
  };
}
const store: Store = g.__harn_obs;

function appendLog(obj: unknown) {
  try {
    fs.appendFileSync(LOG, JSON.stringify(obj) + '\n');
  } catch {
    /* observability never fails requests */
  }
}

export function startTrace(method: string, pathname: string) {
  const id = Math.random().toString(36).slice(2, 10);
  const t0 = Date.now();
  const checkpoints: Checkpoint[] = [];
  return {
    id,
    checkpoint(name: string) {
      checkpoints.push({ name, ms: Date.now() - t0 });
    },
    finish(status: number): Trace {
      const ms = Date.now() - t0;
      store.requests++;
      const sk = String(status);
      store.statusCounts[sk] = (store.statusCounts[sk] ?? 0) + 1;
      store.pathCounts[pathname] = (store.pathCounts[pathname] ?? 0) + 1;
      store.durations.push(ms);
      if (store.durations.length > 1000) store.durations.shift();
      const trace: Trace = {
        id,
        method,
        path: pathname,
        status,
        ms,
        startedAt: new Date().toISOString(),
        checkpoints,
      };
      store.traces.push(trace);
      if (store.traces.length > 200) store.traces.shift();
      appendLog({ ts: trace.startedAt, trace: id, method, path: pathname, status, ms, checkpoints });
      return trace;
    },
  };
}

export type Tracer = ReturnType<typeof startTrace>;

export function renderMetrics(): string {
  const ds = [...store.durations].sort((a, b) => a - b);
  const q = (p: number) => (ds.length ? ds[Math.min(ds.length - 1, Math.floor(p * ds.length))] : 0);
  const avg = ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : 0;
  const lines = [
    '# HELP harn_requests_total Total HTTP requests served',
    '# TYPE harn_requests_total counter',
    `harn_requests_total ${store.requests}`,
    '# HELP harn_request_duration_ms_avg Average request duration in ms',
    '# TYPE harn_request_duration_ms_avg gauge',
    `harn_request_duration_ms_avg ${avg}`,
    '# HELP harn_request_duration_ms_p50 p50 request duration in ms',
    '# TYPE harn_request_duration_ms_p50 gauge',
    `harn_request_duration_ms_p50 ${q(0.5)}`,
    '# HELP harn_uptime_seconds Seconds since process start',
    '# TYPE harn_uptime_seconds gauge',
    `harn_uptime_seconds ${Math.round((Date.now() - store.startedAt) / 1000)}`,
  ];
  for (const [s, n] of Object.entries(store.statusCounts).sort()) {
    lines.push(`harn_responses_total{status="${s}"} ${n}`);
  }
  const top = Object.entries(store.pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [p, n] of top) {
    lines.push(`harn_path_hits_total{path="${p}"} ${n}`);
  }
  return lines.join('\n') + '\n';
}

export function recentTraces(limit = 50): Trace[] {
  return store.traces.slice(-Math.max(1, limit)).reverse();
}
