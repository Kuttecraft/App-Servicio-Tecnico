import type { APIRoute } from 'astro';
import { z } from 'zod';
import { supabaseServer } from '../../lib/supabaseServer';

/**
 * Schema de entrada (Zod)
 * ------------------------------------------------------------------
 * Esperamos un body JSON así:
 *   { "id": 123 }
 *
 * Reglas:
 * - id debe ser un number entero positivo.
 * - Si no cumple, Schema.parse() tira, lo que atrapamos en el catch y
 *   devolvemos 400 más abajo.
 */
const Schema = z.object({
  id: z.number().int().positive(),
});

/**
 * POST /api/borrarRepuesto
 * ------------------------------------------------------------------
 * Este endpoint intenta borrar un repuesto de la tabla `repuestos_csv`.
 *
 * Política de borrado:
 *
 * 1. Intento HARD DELETE:
 *    - Hacemos `.delete().eq('id', id)`.
 *    - Si funciona y realmente borró filas, devolvemos { ok: true, mode: 'hard' }.
 *    - Si funciona pero no borró nada → ID inexistente → 404.
 *    - Si falla (por ejemplo RLS, FK, permisos) → pasamos al paso 2.
 *
 * 2. Fallback SOFT DELETE:
 *    - Actualizamos la fila marcando `activo = false`
 *      y seteando `actualizado_en` a NOW ISO.
 *    - Si esa actualización falla → devolvemos error 400.
 *    - Si no afecta filas → 404 (no existe el ID).
 *    - Si funciona → { ok: true, mode: 'soft' }.
 *
 * Seguridad:
 * - Usa `supabaseServer`, o sea el cliente con service role.
 *   Este endpoint es backend-only. No debe exponerse públicamente
 *   sin autenticación/autorización adecuada.
 *
 * Respuestas:
 * - 200 → éxito (hard o soft)
 * - 404 → el ID no existe
 * - 400 → error de validación / fallo al borrar
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Parsear body y validar con Zod
    // Si el JSON está mal formado o falta `id`, esto va a tirar excepción
    // que capturamos en el catch final.
    const { id } = Schema.parse(await request.json());

    /**
     * 1) Intento de HARD DELETE
     * ----------------------------------------------------------------
     * Eliminación física en la tabla. Si hay FK con ON DELETE CASCADE,
     * eso también debería volar las referencias.
     *
     * `.select('id')` luego de `.delete()` en Supabase nos devuelve
     * las filas eliminadas. Lo usamos para:
     *   - saber si realmente existía ese ID,
     *   - y para diferenciar "no existe" vs "borrado ok".
     */
    const hard = await supabaseServer
      .from('repuestos_csv')
      .delete()
      .eq('id', id)
      .select('id'); // queremos confirmar si tocó filas

    if (hard.error) {
      // HARD DELETE falló. Ejemplos comunes:
      //  - RLS no permite delete directo
      //  - hay una FK que no deja borrar sin limpiar antes
      //
      // Vamos al plan B: "soft delete".

      /**
       * 2) Fallback: SOFT DELETE
       * ------------------------------------------------------------
       * En vez de borrar la fila, la marcamos como inactiva.
       * Esto es útil para mantener historial / auditoría.
       *
       * Seteamos:
       *  - activo = false
       *  - actualizado_en = timestamp ISO de ahora
       *
       * Nota: asumimos que `repuestos_csv` tiene esas columnas:
       *   - activo (boolean)
       *   - actualizado_en (timestamp/ISO string)
       */
      const soft = await supabaseServer
        .from('repuestos_csv')
        .update({
          activo: false,
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id');

      // Si el UPDATE soft también falla: devolvemos error genérico 400
      if (soft.error) {
        return new Response(
          JSON.stringify({
            ok: false,
            error:
              hard.error.message ||
              'No se pudo borrar el repuesto',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Si no hay filas afectadas en el soft update → el ID no existía
      if (!soft.data?.length) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'No existe el ID',
          }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      // Soft delete OK
      return new Response(
        JSON.stringify({ ok: true, mode: 'soft' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    /**
     * HARD DELETE NO TUVO error
     * ----------------------------------------------------------------
     * Eso quiere decir que Supabase aceptó el delete.
     * Ahora chequeamos si realmente había fila o no.
     */

    // Si no borró ninguna fila → ese ID no existía
    if (!hard.data?.length) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'No existe el ID',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Hard delete exitoso ✔
    return new Response(
      JSON.stringify({ ok: true, mode: 'hard' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (e: any) {
    /**
     * Errores atrapados acá:
     * - JSON inválido en el body
     * - Zod (id faltante / id no es número positivo)
     * - Cualquier throw inesperado
     */
    console.error('borrarRepuesto error:', e?.message || e);

    return new Response(
      JSON.stringify({
        ok: false,
        error: e?.message || 'Error',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
