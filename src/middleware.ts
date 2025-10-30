/**
 * middleware.ts
 * ------------------------------------------------------------------
 * Este middleware corre en TODAS las requests del sitio.
 *
 * Responsabilidades:
 * 1. Distinguir rutas públicas vs rutas protegidas.
 * 2. Para rutas protegidas:
 *    - Ejecutar `clerkMiddleware` (Clerk = auth).
 *    - Obtener el usuario actual y su email.
 *    - Buscar en Supabase la fila correspondiente en `usuarios_perfil`.
 *    - Guardar ese perfil en `context.locals.perfil` para usarlo después
 *      en las páginas Astro (ej: chequear rol admin).
 *    - Bloquear acceso si el perfil no existe o no está activo.
 *
 * Flujo:
 *  - Si la ruta es pública => next()
 *  - Si la ruta es privada =>
 *        clerkMiddleware() inyecta auth en context.locals
 *        Validamos que el email exista y esté activo en BD
 *        Si OK => next()
 *        Si NO => redirect /no-autorizado
 *
 * Notas importantes:
 *  - `clerkMiddleware()` devuelve un handler estilo middleware.
 *    Lo ejecutamos pasándole nuestro `context` y una función async propia.
 *  - Guardamos en `locals.perfil` el perfil cargado desde Supabase,
 *    para que las páginas puedan hacer cosas como:
 *       const perfil = Astro.locals.perfil;
 *       const isAdmin = perfil?.rol === 'admin' || perfil?.admin === true;
 */

import type { MiddlewareHandler } from 'astro';
import { clerkMiddleware } from '@clerk/astro/server';
import { supabase } from './lib/supabase';

// Middleware principal expuesto a Astro
export const onRequest: MiddlewareHandler = async (context, next) => {
  // 🌐 Rutas públicas (NO requieren login / perfil activo)
  //    - /signin y /signup: pantallas Clerk
  //    - /no-autorizado: pantalla de "no tenés permiso"
  //    - /api/proximoTicket: usado por la pantalla de alta rápida
  const publicRoutes = [
    '/signin',
    '/signup',
    '/no-autorizado',
    '/api/proximoTicket',
  ];

  // URL actual
  const url = new URL(context.request.url);

  // Si la ruta actual es pública, dejamos pasar sin controles
  // (También permitimos cualquier subruta que empiece con /api/proximoTicket)
  if (
    publicRoutes.includes(url.pathname) ||
    url.pathname.startsWith('/api/proximoTicket')
  ) {
    return next();
  }

  // 🔒 Para todas las demás rutas:
  // corremos clerkMiddleware para poblar auth info en `context.locals`
  // y luego validamos el perfil contra Supabase.
  //
  // clerkMiddleware() nos da otra función middleware;
  // la ejecutamos pasándole (context, innerNext).
  return clerkMiddleware()(context, async () => {
    let allow = false;

    // Tipado local extendido para comodidad
    const locals = context.locals as typeof context.locals & {
      authStatus?: string;          // "signed-in", "signed-out", etc.
      currentUser?: () => Promise<any>; // fn que Clerk expone para obtener user
      email?: string;               // lo vamos a setear acá
      perfil?: any;                 // lo vamos a setear acá (row de usuarios_perfil)
    };

    // ✅ Clerk dice "estás logueado"
    if (locals.authStatus === 'signed-in') {
      // Obtenemos el objeto user actual desde Clerk
      const user = await locals.currentUser?.();

      // Buscamos el email primario del usuario
      const email = user?.emailAddresses?.[0]?.emailAddress;

      if (email) {
        // Lo dejamos disponible en otros layouts/pages
        locals.email = email;

        // 🔎 Buscamos el perfil en Supabase
        const { data: perfil, error } = await supabase
          .from('usuarios_perfil')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        // (Podríamos loguear `error` si queremos debuggear)

        // La política de acceso:
        //  - Debe existir una fila en usuarios_perfil
        //  - Debe tener activo = true
        if (perfil && perfil.activo) {
          allow = true;
          // lo guardamos para que las páginas ya tengan info de rol/permisos
          locals.perfil = perfil;
        }
      }
    }

    // ❌ No permitido -> redirigimos a /no-autorizado
    if (!allow) {
      const denyUrl = new URL('/no-autorizado', context.request.url);
      return Response.redirect(denyUrl.toString(), 302);
    }

    // ✅ Permitido -> continuar con la request normal
    return next();
  }) as Promise<Response>;
};
