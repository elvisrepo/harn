import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from '../../db/client.ts';

function getEnv(name: string, fallback: string): string {
  if (typeof process !== 'undefined' && process.env[name]) return process.env[name]!;
  const mel = (import.meta as any).env;
  if (mel && mel[name]) return mel[name];
  return fallback;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),
  secret: getEnv('AUTH_SECRET', 'dev-only-secret-change-me'),
  baseURL: getEnv('AUTH_URL', 'http://127.0.0.1:4321'),
  emailAndPassword: {
    enabled: true,
    signUp: { enabled: true },
    minPasswordLength: 8,
  },
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: getEnv('NODE_ENV', 'development') === 'production',
    },
  },
});

export type Session = typeof auth.$Infer.Session;