import { dark } from '@clerk/themes';
import type { APIContext } from 'astro';
import type { User } from '@clerk/backend';


/**
 * Apariencia global para Clerk (modo oscuro)
 */
export const clerkAppearance = {
  baseTheme: dark,
};

/**
 * Localización global en español para Clerk
 */
export const clerkLocalization = {
  locale: 'es-ES',
  signIn: {
    start: {
      title: 'Iniciar sesión',
      subtitle: 'Por favor, inicie sesión para continuar',
    },
  },
  signUp: {
    start: {
      title: 'Registro',
      subtitle: 'Rellena tus datos para comenzar',
    },
  },
};

/**
 * Devuelve el usuario autenticado desde Astro.locals (SSR)
 * FIXME: usa casting temporal hasta que TypeScript reconozca Locals.user desde /types/astro.d.ts
 */
type ExtendedLocals = APIContext['locals'] & { user?: User };


export async function getUserFromLocals(Astro: APIContext): Promise<User | null> {
  const locals = Astro.locals as ExtendedLocals;

  try {
    return locals.user ?? null;
  } catch (error) {
    console.error('Error al obtener el usuario desde Clerk:', error);
    return null;
  }
}
