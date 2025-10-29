import { dark } from '@clerk/themes';
import type { APIContext } from 'astro';
import type { User } from '@clerk/backend';

/**
 * Apariencia global para Clerk (modo oscuro)
 * Le damos un tipo explícito "as const" para que mantenga las claves
 * y no se infiera como `any`.
 */
export const clerkAppearance = {
  baseTheme: dark,
} as const;

/**
 * Localización global en español para Clerk.
 *
 * También la marcamos `as const` para que las strings se mantengan
 * tipadas como literales y no haya widening a `string`, lo que hace
 * más feliz a TypeScript estricto cuando lo pasás a Clerk.
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
} as const;

/**
 * Tipo extendido de locals que esperamos tener en Astro.locals,
 * el cual incluye opcionalmente un User de Clerk.
 *
 * FIXME:
 *  Idealmente esto debería venir de una declaración de tipos global
 *  (por ej. src/types/astro.d.ts) que extienda APIContext['locals'].
 */
type ExtendedLocals = APIContext['locals'] & { user?: User };

/**
 * Devuelve el usuario autenticado desde Astro.locals (SSR).
 *
 * Si no hay usuario autenticado, devuelve null.
 * Si algo falla (por ejemplo locals.user accede a algo undefined raro),
 * capturamos y devolvemos null para no romper el flujo de la página.
 */
export async function getUserFromLocals(Astro: APIContext): Promise<User | null> {
  const locals = Astro.locals as ExtendedLocals;

  try {
    return locals.user ?? null;
  } catch (error) {
    console.error('Error al obtener el usuario desde Clerk:', error);
    return null;
  }
}
