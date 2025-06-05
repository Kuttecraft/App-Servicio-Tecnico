import type { User } from '@clerk/backend';

/**
 * Extiende el tipado de Astro para incluir `Astro.locals.user`
 */
declare namespace Astro {
  interface Locals {
    user?: User;
  }
}
