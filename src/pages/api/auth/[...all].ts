import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '../../../lib/auth.ts';

// Note: Astro 7 does not pick up destructured exports like
// `export const { GET, POST } = ...` — explicit function exports are required.
const { GET: handleGET, POST: handlePOST, PUT: handlePUT, PATCH: handlePATCH, DELETE: handleDELETE } =
  toNextJsHandler(auth);

export const GET = ({ request }: { request: Request }) => handleGET(request);
export const POST = ({ request }: { request: Request }) => handlePOST(request);
export const PUT = ({ request }: { request: Request }) => handlePUT(request);
export const PATCH = ({ request }: { request: Request }) => handlePATCH(request);
export const DELETE = ({ request }: { request: Request }) => handleDELETE(request);