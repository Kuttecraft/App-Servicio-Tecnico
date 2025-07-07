import type { User } from '@clerk/backend';

declare module "astro" {
  interface Locals {
    user?: User;
    email?: string;
    authStatus?: string;
    currentUser?: () => Promise<User | null>;
    perfil?: any; 
  }
}
