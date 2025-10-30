/// <reference types="astro/client" />

/**
 * astro.d.ts
 * ---------------------------------------------
 * Archivo de definición de tipos (TypeScript) para Astro.
 *
 * ✅ Propósito:
 *    - Extender la interfaz `App.Locals` para tipar correctamente
 *      las propiedades que nuestro middleware agrega a `Astro.locals`.
 *
 * 💡 Contexto:
 *    En el middleware (middleware.ts) nosotros hacemos:
 *        locals.email = 'usuario@dominio.com'
 *        locals.perfil = { rol: 'admin', activo: true, ... }
 *
 *    Sin esta definición, TypeScript no sabe que esas props existen
 *    y marcaría errores en todas las páginas Astro donde se lean.
 *
 * 🧩 Solución:
 *    Extendemos el namespace `App` (propio de Astro) e indicamos
 *    qué tipo de datos tiene `locals`.
 */

declare namespace App {
  interface Locals {
    /**
     * 📧 Email del usuario autenticado (proveniente de Clerk)
     * Se completa en el middleware si el usuario está logueado.
     */
    email?: string;

    /**
     * 👤 Perfil completo del usuario, traído desde Supabase.
     * Contiene rol, permisos, y estado de actividad.
     */
    perfil?: {
      /** Rol textual, ej. "admin" | "tecnico" | "usuario" */
      rol?: string;

      /** Flag redundante (true si es admin) */
      admin?: boolean;

      /** Indica si el perfil está activo */
      activo?: boolean;

      /** Permite incluir otros campos personalizados */
      [k: string]: any;
    };
  }
}
