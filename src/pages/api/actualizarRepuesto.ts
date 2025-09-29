import type { APIRoute } from 'astro'
import { z } from 'zod'
import { supabaseServer } from '../../lib/supabaseServer'

/** Validación del cuerpo (lo que envía la UI) */
const Schema = z.object({
  id: z.number().int().positive().optional(),
  componente: z.string().min(1),
  stock: z.string().nullable().optional(),
  categoria: z.string().nullable().optional(),
  precio: z.string().nullable().optional(),
  activo: z.boolean().default(true),
})

/** Normaliza precio en ARS a "$X.XXX" sin decimales y SIN redondear (solo quita no-dígitos) */
function normalizarPrecioARS(input?: string | null): string | null {
  if (input == null) return null
  const digits = String(input).replace(/[^\d]/g, '') // deja solo dígitos
  if (!digits) return null
  const pesos = Number(digits) // mantiene el valor exacto
  const numero = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pesos).replace(/\s/g, '')
  return '$' + numero
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const b = Schema.parse(await request.json())

    // Interpreta stock como número (para forzar activo=false cuando stock==0)
    const stockNum =
      b.stock == null || String(b.stock).trim() === ''
        ? null
        : Number(String(b.stock).replace(/[^\d]/g, '')) || 0

    // Mapeo a nombres de columnas reales en la tabla (algunas con espacios)
    const payload: any = {
      'Componentes presupuestados': b.componente,
      'Stock': b.stock ?? null,
      categoria: b.categoria ?? null,
      'Precio': normalizarPrecioARS(b.precio),
      // Regla de negocio: si stock === 0 → inactivo
      activo: stockNum === 0 ? false : (b.activo ?? true),
      actualizado_en: new Date().toISOString(),
    }

    // Update o Insert según si viene ID
    let resp
    if (b.id) {
      resp = await supabaseServer
        .from('repuestos_csv')
        .update(payload)
        .eq('id', b.id)
        .select('id,"Componentes presupuestados","Stock",categoria,"Precio",activo,actualizado_en')
        .single()
    } else {
      payload.creado_en = new Date().toISOString()
      resp = await supabaseServer
        .from('repuestos_csv')
        .insert(payload)
        .select('id,"Componentes presupuestados","Stock",categoria,"Precio",activo,actualizado_en')
        .single()
    }

    const { data, error } = resp
    if (error) throw error

    // Respuesta normalizada para la UI
    const out = {
      id: data!.id,
      componente: data!['Componentes presupuestados'],
      stock: data!['Stock'],
      categoria: data!.categoria,
      precio: data!['Precio'],
      activo: data!.activo,
      actualizado_en: data!.actualizado_en,
    }
    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('actualizarRepuesto error:', e?.message || e)
    return new Response(JSON.stringify({ error: e?.message || 'Error' }), { status: 400 })
  }
}
