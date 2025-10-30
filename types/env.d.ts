/// <reference types="astro/client" />

/**
 * env.d.ts
 * --------------------------------------------------
 * Archivo de declaración de tipos para variables de entorno
 * y extensión de tipos de `Astro.locals`.
 *
 * ✅ Propósito:
 * 1. Tipar correctamente las variables públicas (PUBLIC_*)
 *    accesibles en el código cliente y servidor.
 * 2. Extender la interfaz `App.Locals` para declarar el objeto `perfil`
 *    que se inyecta desde nuestro middleware.
 *
 * 💡 Importante:
 *  - Las variables que comienzan con `PUBLIC_` son visibles en el cliente.
 *  - Las que no, solo están disponibles en el servidor.
 *  - `perfil` se usa ampliamente en las páginas protegidas para verificar
 *     roles y permisos de usuario.
 */

/* ============================================================
 * 🌍 Variables de entorno (solo lectura)
 * ============================================================ */
interface ImportMetaEnv {
  /**
   * URL base del proyecto Supabase.
   * Ejemplo: https://xxxx.supabase.co
   */
  readonly PUBLIC_SUPABASE_URL: string;

  /**
   * Clave anónima (anon key) de Supabase.
   * Usada en el cliente y servidor para autenticación pública.
   */
  readonly PUBLIC_SUPABASE_ANON_KEY: string;

  // 💡 Podés agregar más variables públicas acá si las usás:
  // readonly PUBLIC_API_BASE?: string;
  // readonly PUBLIC_APP_ENV?: 'dev' | 'prod';
}

/* ============================================================
 * 🔧 Objeto ImportMeta (contexto de Vite/Astro)
 * ============================================================ */
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/* ============================================================
 * 🧩 Extensión de tipos Astro.locals
 * ============================================================ */
declare namespace App {
  interface Locals {
    /**
     * Perfil del usuario actual (cargado desde Supabase en middleware.ts)
     * Contiene información de rol, permisos y estado de actividad.
     *
     * Ejemplo:
     * {
     *   email: "tecnico@empresa.com",
     *   rol: "tecnico",
     *   admin: false,
     *   activo: true
     * }
     */
    perfil?: {
      rol?: string;
      admin?: boolean;
      activo?: boolean;
      [k: string]: any;
    };
  }
}
