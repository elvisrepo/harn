/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

import type { Session } from './lib/auth.ts';

declare global {
  namespace App {
    interface Locals {
      session: Session | null;
    }
  }
}

export {};