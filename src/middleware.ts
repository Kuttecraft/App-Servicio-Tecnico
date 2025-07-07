import type { MiddlewareHandler } from 'astro';
import { clerkMiddleware } from '@clerk/astro/server';
import { supabase } from './lib/supabase';

export const onRequest: MiddlewareHandler = async (context, next) => {
  // Rutas públicas
  const publicRoutes = [
    '/signin',
    '/signup',
    '/no-autorizado',
    '/api/proximoTicket'
  ];
  const url = new URL(context.request.url);

  if (
    publicRoutes.includes(url.pathname) ||
    url.pathname.startsWith('/api/proximoTicket')
  ) {
    return next();
  }

  // Resto de rutas protegidas
  return clerkMiddleware()(context, async () => {
    let allow = false;
    const locals = context.locals as typeof context.locals & {
      authStatus?: string;
      currentUser?: () => Promise<any>;
      email?: string;
      perfil?: any;
    };
    if (locals.authStatus === 'signed-in') {
      const user = await locals.currentUser?.();
      const email = user?.emailAddresses?.[0]?.emailAddress;
      // Debug: ver qué email detecta
      // console.log('[AUTH DEBUG] Email detectado:', email);
      if (email) {
        locals.email = email;

        // Consulta a Supabase para traer el perfil del usuario
        const { data: perfil, error } = await supabase
          .from('usuarios_perfil')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        // Debug: mostrar perfil recibido
        // console.log('[AUTH DEBUG] Perfil recibido de Supabase:', perfil);
        // if (error) {
        //   console.error('[AUTH DEBUG] Error al consultar Supabase:', error);
        // }

        if (perfil && perfil.activo) {
          allow = true;
          locals.perfil = perfil;
          // console.log('[AUTH DEBUG] Usuario permitido, perfil:', perfil);
        } else {
          // console.warn('[AUTH DEBUG] Usuario no permitido o perfil inactivo:', perfil);
        }
      }
    } else {
      // console.warn('[AUTH DEBUG] Usuario NO logueado');
    }
    if (!allow) {
      // console.warn('[AUTH DEBUG] Acceso denegado, redirigiendo a /no-autorizado');
      const denyUrl = new URL('/no-autorizado', context.request.url);
      return Response.redirect(denyUrl.toString(), 302);
    }
    return next();
  }) as Promise<Response>;
};
