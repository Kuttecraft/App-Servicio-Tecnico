// src/pages/api/borrarRepuesto.ts
import type { APIRoute } from 'astro'
import { z } from 'zod'
import { supabaseServer } from '../../lib/supabaseServer'

const Schema = z.object({ id: z.number().int().positive() })

export const POST: APIRoute = async ({ request }) => {
  try {
    const { id } = Schema.parse(await request.json())
    const { error } = await supabaseServer
      .from('repuestos_csv')
      .update({ activo: false, actualizado_en: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('borrarRepuesto:', error)
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 400 })
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'Error' }), { status: 400 })
  }
}
