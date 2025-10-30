import type { APIRoute } from 'astro';
import { supabaseServer } from '../../lib/supabaseServer';

/**
 * GET /api/categoriaRepuestos
 * ------------------------------------------------------------------
 * Endpoint que devuelve la lista de categorías únicas de repuestos.
 *
 * ¿Para qué sirve?
 * - Poblar dropdowns/filtros en el frontend (por ejemplo, "categoría" en la vista de repuestos).
 *
 * ¿De dónde salen las categorías?
 * - De la columna `categoria` de la tabla `repuestos_csv`.
 *
 * ¿Qué hace exactamente?
 *   1. Lee todas las categorías existentes (solo el campo `categoria`).
 *   2. Filtra valores nulos, vacíos o whitespace.
 *   3. Hace un Set para evitar duplicados.
 *   4. Ordena alfabéticamente en castellano (`localeCompare('es')`).
 *   5. Devuelve `{ categorias: ["Boquillas", "Extrusor", "Fuente", ...] }`
 *
 * Respuestas:
 *   - 200 OK: { categorias: string[] }
 *   - 500 Error interno: { categorias: [], error: "...mensaje..." }
 *
 * Seguridad / acceso:
 *   - Usa `supabaseServer` (service role), o sea este endpoint está pensado
 *     para ejecutarse del lado del servidor. No devuelvas datos sensibles acá.
 *   - Sólo expone categorías (strings), así que está bien para uso interno en dashboard.
 */
export const GET: APIRoute = async () => {
  try {
    /**
     * 1. Consultar categorías desde la tabla `repuestos_csv`
     * ----------------------------------------------------------------
     * Seleccionamos sólo el campo `categoria`, y filtramos:
     *   - que no sea NULL
     *   - que no sea string vacío ''
     *
     * Además usamos `.order('categoria', { ascending: true })`
     * simplemente para que ya venga más o menos ordenado antes de
     * deduplicar. Igual luego hacemos orden final con localeCompare.
     */
    const { data, error } = await supabaseServer
      .from('repuestos_csv')
      .select('categoria')
      .not('categoria', 'is', null) // excluye NULL
      .neq('categoria', '')         // excluye string vacío
      .order('categoria', { ascending: true });

    if (error) {
      // Si Supabase devolvió error, cortamos acá y lo manejamos abajo
      throw error;
    }

    /**
     * 2. Normalizar / limpiar resultados
     * ----------------------------------------------------------------
     * Usamos un Set<string> para:
     *   - evitar duplicados
     *   - ignorar categorías whitespace tipo "   "
     *
     * `String(...).trim()` se asegura de limpiar espacios accidentales.
     */
    const set = new Set<string>();

    for (const r of data ?? []) {
      // `r.categoria` puede venir en cualquier formato, lo forzamos a string
      const cleaned = String(r.categoria ?? '').trim();
      if (cleaned) {
        set.add(cleaned);
      }
    }

    /**
     * 3. Pasar Set -> Array y ordenarlo bien
     * ----------------------------------------------------------------
     * Usamos `localeCompare(..., 'es', { sensitivity: 'base' })`
     * para ordenar según reglas del español (ñ, acentos, etc.).
     *
     * sensitivity: 'base' => "Á" y "A" se consideran iguales para ordenar.
     */
    const categorias = Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );

    /**
     * 4. Respuesta OK
     * ----------------------------------------------------------------
     * Retornamos JSON plano, con cabecera Content-Type.
     */
    return new Response(
      JSON.stringify({ categorias }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (e: any) {
    /**
     * 5. Error handling
     * ----------------------------------------------------------------
     * Si algo falló (error de Supabase, error inesperado de runtime, etc.),
     * devolvemos:
     *
     *   { categorias: [], error: 'mensaje' }
     *
     * con status 500 para que el frontend sepa que no es una lista válida.
     */
    console.error(
      'categoriasRepuestos error:',
      e?.message || e
    );

    return new Response(
      JSON.stringify({
        categorias: [],
        error: e?.message || 'Error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
