import type { MiddlewareHandler } from 'astro';
import { clerkMiddleware } from '@clerk/astro/server';

const ALLOWED_EMAILS = [
  'santiagollamosas10@gmail.com',
  // otros emails permitidos...
];

export const onRequest: MiddlewareHandler = async (context, next) => {
  // Rutas públicas que no requieren validación
  const publicRoutes = [
    '/signin',
    '/signup',
    '/no-autorizado',
    '/api/proximoTicket' 
  ];
  const url = new URL(context.request.url);

  // Si la ruta es pública (o inicia con /api/proximoTicket por si querés admitir query params), dejala pasar sin chequear
  if (publicRoutes.includes(url.pathname) || url.pathname.startsWith('/api/proximoTicket')) {
    return next();
  }

  // Resto de rutas protegidas
  return clerkMiddleware()(context, async () => {
    let allow = false;
    const locals = context.locals as typeof context.locals & {
      authStatus?: string;
      currentUser?: () => Promise<any>;
      email?: string;
    };
    if (locals.authStatus === 'signed-in') {
      const user = await locals.currentUser?.();
      const email = user?.emailAddresses?.[0]?.emailAddress;
      if (email && ALLOWED_EMAILS.includes(email)) {
        allow = true;
        locals.email = email;
      }
    }
    if (!allow) {
      // Redirigí a una página de error o acceso denegado para evitar loops
      const denyUrl = new URL('/no-autorizado', context.request.url);
      return Response.redirect(denyUrl.toString(), 302);
    }
    return next();
  }) as Promise<Response>;
};
