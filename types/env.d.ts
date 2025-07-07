// env.d.ts
// Puedes agregar aquí cualquier tipo relacionado a variables de entorno si lo necesitas en el futuro.

/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  // otras variables públicas aquí...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Extiende el tipo Locals de Astro para incluir la propiedad 'perfil'.
declare namespace App {
  interface Locals {
    perfil?: any; // Cambia 'any' por el tipo real de perfil si lo conoces
  }
}
