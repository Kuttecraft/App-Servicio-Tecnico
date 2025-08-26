/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    email?: string;
    perfil?: {
      rol?: string;
      admin?: boolean;
      activo?: boolean;
      [k: string]: any;
    };
  }
}
