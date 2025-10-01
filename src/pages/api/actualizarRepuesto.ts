import type { APIRoute } from 'astro'
import { z } from 'zod'
import { supabaseServer } from '../../lib/supabaseServer'

const Schema = z.object({
  id: z.number().int().positive().optional(),
  componente: z.string().min(1),
  stock: z.string().nullable().optional(),
  categoria: z.string().nullable().optional(),
  precio: z.string().nullable().optional(),
  activo: z.boolean().default(true),
})

/** Normaliza precio en ARS a "$X.XXX" sin decimales */
function normalizarPrecioARS(input?: string | null): string | null {
  if (input == null) return null
  const digits = String(input).trim().replace(/[^\d]/g, '')
  if (!digits) return null
  const pesos = Number(digits)
  const numero = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(pesos).replace(/\s/g, '')
  return '$' + numero
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const b = Schema.parse(await request.json())

    const componente = b.componente.trim()
    const categoria  = b.categoria ? b.categoria.trim() : null
    const stockStr   = b.stock ? b.stock.trim() : null
    const stockNum =
      stockStr == null || stockStr === ''
        ? null
        : Number(stockStr.replace(/[^\d]/g, '')) || 0
    const stockDigits = stockStr ? stockStr.replace(/[^\d]/g, '') : ''

    const payload: any = {
      'Componentes presupuestados': componente,
      'Stock': stockDigits ? stockDigits : null,
      categoria,
      'Precio': normalizarPrecioARS(b.precio),
      activo: stockNum === 0 ? false : (b.activo ?? true),
      actualizado_en: new Date().toISOString(),
    }

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

    const toYmd = (iso?: string | null) => (iso ? String(iso).slice(0, 10) : null)

    const out = {
      id: data!.id,
      componente: data!['Componentes presupuestados'],
      stock: data!['Stock'],
      categoria: data!.categoria,
      precio: data!['Precio'],
      activo: data!.activo,
      actualizado_en: toYmd(data!.actualizado_en),
    }

    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    console.error('actualizarRepuesto error:', e?.message || e)
    return new Response(JSON.stringify({ error: e?.message || 'Error' }), { status: 400 })
  }
}
