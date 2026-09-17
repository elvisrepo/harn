import { defineMiddleware } from 'astro:middleware';
import { auth, type Session } from './lib/auth.ts';
import { startTrace, type Tracer } from './lib/observability.ts';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace App {
    interface Locals {
      session: Session | null;
      tracer: Tracer;
    }
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const tracer = startTrace(context.request.method, context.url.pathname);
  context.locals.tracer = tracer;
  let session: Session | null = null;
  try {
    const res = await auth.api.getSession({ headers: context.request.headers });
    session = res?.session ? res : null;
  } catch {
    session = null;
  }
  context.locals.session = session;

  const path = context.url.pathname;
  if (path.startsWith('/admin') && !session) {
    const r = context.redirect('/login');
    tracer.finish(302);
    return r;
  }

  try {
    const res = await next();
    tracer.finish(res.status);
    res.headers.set('X-Request-Id', tracer.id);
    return res;
  } catch (e) {
    tracer.finish(500);
    throw e;
  }
});