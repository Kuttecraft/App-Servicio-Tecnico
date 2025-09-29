import type { APIRoute } from 'astro'
import { z } from 'zod'
import { supabaseServer } from '../../lib/supabaseServer'

const Schema = z.object({ id: z.number().int().positive() })

export const POST: APIRoute = async ({ request }) => {
  try {
    const { id } = Schema.parse(await request.json())

    // Intento de borrado REAL
    let { error } = await supabaseServer
      .from('repuestos_csv')
      .delete()
      .eq('id', id)

    if (error) {
      // Fallback a soft delete
      console.warn('DELETE falló, intentando soft delete:', error?.message || error)
      const upd = await supabaseServer
        .from('repuestos_csv')
        .update({ activo: false, actualizado_en: new Date().toISOString() })
        .eq('id', id)

      if (upd.error) throw upd.error
      return new Response(JSON.stringify({ ok: true, mode: 'soft' }), { status: 200 })
    }

    return new Response(JSON.stringify({ ok: true, mode: 'hard' }), { status: 200 })
  } catch (e: any) {
    console.error('borrarRepuesto error:', e?.message || e)
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'Error' }), { status: 400 })
  }
}
