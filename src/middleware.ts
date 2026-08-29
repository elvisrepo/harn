import { defineMiddleware } from 'astro:middleware';
import { auth, type Session } from './lib/auth.ts';

export const onRequest = defineMiddleware(async (context, next) => {
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
    return context.redirect('/login');
  }

  return next();
});