// src/pages/api/actualizarRepuesto.ts
import type { APIRoute } from 'astro'
import { z } from 'zod'
import { supabaseServer } from '../../lib/supabaseServer'

const Schema = z.object({
  id: z.number().int().positive().optional(),
  componentes: z.string().min(1),
  cantidad: z.string().nullable().optional(),
  stock: z.string().nullable().optional(),
  categoria: z.string().nullable().optional(),
  precio: z.string().nullable().optional(),
  activo: z.boolean().default(true),
})

export const POST: APIRoute = async ({ request }) => {
  try {
    const b = Schema.parse(await request.json())
    const payload: any = {
      'Componentes presupuestados': b.componentes,
      'Cantidad': b.cantidad ?? null,
      'Stock': b.stock ?? null,
      categoria: b.categoria ?? null,
      'Precio': b.precio ?? null,
      activo: b.activo ?? true,
      actualizado_en: new Date().toISOString(),
    }

    let resp
    if (b.id) {
      // UPDATE
      resp = await supabaseServer
        .from('repuestos_csv')
        .update(payload)
        .eq('id', b.id)
        .select('id,"Componentes presupuestados","Cantidad","Stock",categoria,"Precio",activo,actualizado_en')
        .single()
    } else {
      // INSERT
      payload.creado_en = new Date().toISOString()
      resp = await supabaseServer
        .from('repuestos_csv')
        .insert(payload)
        .select('id,"Componentes presupuestados","Cantidad","Stock",categoria,"Precio",activo,actualizado_en')
        .single()
    }

    const { data, error } = resp
    if (error) {
      console.error('actualizarRepuesto:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 400 })
    }

    const out = {
      id: data!.id,
      componentes_presupuestados: data!['Componentes presupuestados'],
      cantidad: data!['Cantidad'],
      stock: data!['Stock'],
      categoria: data!.categoria,
      precio: data!['Precio'],
      activo: data!.activo,
      actualizado_en: data!.actualizado_en,
    }
    return new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Error' }), { status: 400 })
  }
}
