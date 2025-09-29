import type { APIRoute } from 'astro'
import { supabaseServer } from '../../lib/supabaseServer'

/**
 * Lista repuestos con filtros (q, categoría, estado), orden por ID y paginación.
 * Devuelve filas normalizadas para la UI.
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    // Filtros desde querystring
    const q = (url.searchParams.get('q') || '').trim()
    const categoria = (url.searchParams.get('categoria') || '').trim()
    const estado = (url.searchParams.get('estado') || '').trim().toLowerCase()

    // Paginación y orden
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
    const pageSize = 30
    const sortDirParam = (url.searchParams.get('sortDir') || 'asc').toLowerCase()
    const ascending = sortDirParam !== 'desc'

    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    // Construcción de la query a Supabase
    let query = supabaseServer
      .from('repuestos_csv')
      .select('id,"Componentes presupuestados","Stock",categoria,"Precio",activo,actualizado_en', { count: 'exact' })

    if (q) query = query.ilike('Componentes presupuestados', `%${q}%`)
    if (categoria) query = query.eq('categoria', categoria)
    if (estado === 'activo') query = query.eq('activo', true)
    if (estado === 'inactivo') query = query.eq('activo', false)

    query = query.order('id', { ascending }).range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    // Normalización de columnas con nombres con espacios
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      componente: r['Componentes presupuestados'],
      stock: r['Stock'],
      categoria: r.categoria,
      precio: r['Precio'],
      activo: r.activo,
      actualizado_en: r.actualizado_en ? String(r.actualizado_en).slice(0, 10) : null, // yyyy-mm-dd
    }))

    return new Response(JSON.stringify({ rows, total: count ?? 0, page, pageSize }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('listarRepuestos error:', e?.message || e)
    return new Response(JSON.stringify({ error: e?.message || 'Error' }), { status: 500 })
  }
}
