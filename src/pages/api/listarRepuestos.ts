// src/pages/api/listarRepuestos.ts
import type { APIRoute } from 'astro'
import { supabaseServer } from '../../lib/supabaseServer'

export const GET: APIRoute = async () => {
  const { data, error } = await supabaseServer
    .from('repuestos_csv')
    .select('id,"Componentes presupuestados","Cantidad","Stock",categoria,"Precio",activo,actualizado_en')
    .order('actualizado_en', { ascending: false })
    .order('id', { ascending: false })
    .limit(500)

  if (error) {
    console.error('listarRepuestos:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    componentes_presupuestados: r['Componentes presupuestados'],
    cantidad: r['Cantidad'],
    stock: r['Stock'],
    categoria: r.categoria,
    precio: r['Precio'],
    activo: r.activo,
    actualizado_en: r.actualizado_en,
  }))

  return new Response(JSON.stringify(rows), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
