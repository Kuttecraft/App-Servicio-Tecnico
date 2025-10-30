import type { APIRoute } from 'astro'
import { supabaseServer } from '../../lib/supabaseServer'

/**
 * Endpoint GET /api/listarRepuestos
 *
 * 📦 Qué hace:
 * - Lista los repuestos disponibles en la tabla `repuestos_csv`.
 * - Permite filtrar por:
 *     - `q`         → texto dentro del campo "Componentes presupuestados".
 *     - `categoria` → nombre exacto de la categoría.
 *     - `estado`    → "activo" | "inactivo" (filtra booleano `activo`).
 * - Permite ordenar los resultados por columna y dirección (asc/desc).
 * - Implementa paginación (page + pageSize).
 * - Devuelve los campos ya normalizados para que la UI los consuma fácilmente.
 *
 * ⚙️ Parámetros de query:
 *   - q=string
 *   - categoria=string
 *   - estado=activo|inactivo
 *   - sortBy=id|componente|stock|categoria|precio|activo|actualizado_en
 *   - sortDir=asc|desc
 *   - page=1..N
 *
 * 📤 Respuesta:
 * {
 *   rows: [
 *     {
 *       id: number,
 *       componente: string,
 *       stock: number,
 *       categoria: string,
 *       precio: number,
 *       activo: boolean,
 *       actualizado_en: "YYYY-MM-DD" | null
 *     },
 *     ...
 *   ],
 *   total: number,      // cantidad total de registros sin paginar
 *   page: number,       // número de página actual
 *   pageSize: number    // tamaño de página (fijo en 30)
 * }
 *
 * 🚨 Errores:
 *   - Si Supabase falla → 500 con {error: "..."}.
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    // ============================================================
    // 1. Lectura de parámetros de búsqueda, filtros y ordenamiento
    // ============================================================

    // Texto de búsqueda libre
    const q = (url.searchParams.get('q') || '').trim()
    // Categoría exacta
    const categoria = (url.searchParams.get('categoria') || '').trim()
    // Estado textual -> se normaliza a minúsculas
    const estado = (url.searchParams.get('estado') || '').trim().toLowerCase()

    // Página actual (mínimo 1)
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    // Tamaño fijo de página (se puede ajustar si se desea)
    const pageSize = 30

    // Dirección de ordenamiento: por defecto ascendente
    const sortDirParam = (url.searchParams.get('sortDir') || 'asc').toLowerCase()
    const ascending = sortDirParam !== 'desc'

    // Columna por la que se ordena: por defecto 'id'
    const sortByParam = (url.searchParams.get('sortBy') || 'id').toLowerCase()

    // ============================================================
    // 2. Mapeo seguro de columnas expuestas al front → columnas reales DB
    // ============================================================
    //
    // Evita inyección de SQL/columnas no deseadas: sólo se permite ordenar
    // por las columnas incluidas en este mapa.
    //
    const SORT_MAP: Record<string, string> = {
      id: 'id',
      componente: 'Componentes presupuestados',
      stock: 'Stock',
      categoria: 'categoria',
      precio: 'Precio',
      activo: 'activo',
      actualizado_en: 'actualizado_en',
    }

    // Si el sortByParam no existe en SORT_MAP, se usa 'id' como fallback.
    const sortColumn = SORT_MAP[sortByParam] ?? 'id'

    // ============================================================
    // 3. Calcular rango de paginación (offset + limit)
    // ============================================================
    const from = (page - 1) * pageSize // índice inicial (base 0)
    const to = from + pageSize - 1     // índice final inclusivo

    // ============================================================
    // 4. Construcción del query a Supabase
    // ============================================================

    // Base: seleccionamos campos relevantes + count exacto (para total)
    let query = supabaseServer
      .from('repuestos_csv')
      .select(
        'id,"Componentes presupuestados","Stock",categoria,"Precio",activo,actualizado_en',
        { count: 'exact' }
      )

    // Aplicamos filtros dinámicos
    if (q) query = query.ilike('Componentes presupuestados', `%${q}%`) // búsqueda parcial (case-insensitive)
    if (categoria) query = query.eq('categoria', categoria)
    if (estado === 'activo') query = query.eq('activo', true)
    if (estado === 'inactivo') query = query.eq('activo', false)

    // Orden y rango (paginación)
    query = query.order(sortColumn, { ascending }).range(from, to)

    // ============================================================
    // 5. Ejecutar consulta y manejar errores
    // ============================================================
    const { data, count, error } = await query
    if (error) throw error // si algo sale mal, lo captura el catch

    // ============================================================
    // 6. Normalización de datos para la UI
    // ============================================================

    /**
     * Convierte una fecha ISO a formato YYYY-MM-DD o null.
     * Ejemplo:
     *   "2025-10-30T15:22:10Z" → "2025-10-30"
     */
    const toYmd = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : null)

    // Transformamos cada fila cruda en un objeto amigable para el front.
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      componente: r['Componentes presupuestados'],
      stock: r['Stock'],
      categoria: r.categoria,
      precio: r['Precio'],
      activo: r.activo,
      actualizado_en: toYmd(r.actualizado_en),
    }))

    // ============================================================
    // 7. Respuesta JSON final (paginada)
    // ============================================================
    return new Response(
      JSON.stringify({
        rows,
        total: count ?? 0,
        page,
        pageSize,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )

  } catch (e: any) {
    // ============================================================
    // 8. Manejo de errores generales
    // ============================================================
    console.error('listarRepuestos error:', e?.message || e)
    return new Response(
      JSON.stringify({ error: e?.message || 'Error' }),
      { status: 500 }
    )
  }
}
