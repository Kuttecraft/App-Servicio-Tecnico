import type { APIRoute } from 'astro'
import { z } from 'zod'
import { supabaseServer } from '../../lib/supabaseServer'

const Schema = z.object({ id: z.number().int().positive() })

/**
 * Borra un repuesto por ID.
 * - Si el hard delete es posible (y tenés FK con ON DELETE CASCADE), elimina las relaciones automáticamente.
 * - Si el hard delete falla (RLS/u otra razón), hace soft delete (activo=false).
 * - 404 si no existe el ID.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const { id } = Schema.parse(await request.json())

    // Intento de HARD DELETE
    const hard = await supabaseServer
      .from('repuestos_csv')
      .delete()
      .eq('id', id)
      .select('id') // para verificar filas afectadas

    if (hard.error) {
      // Fallback: SOFT DELETE
      const soft = await supabaseServer
        .from('repuestos_csv')
        .update({ activo: false, actualizado_en: new Date().toISOString() })
        .eq('id', id)
        .select('id')

      if (soft.error) {
        return new Response(
          JSON.stringify({ ok: false, error: hard.error.message || 'No se pudo borrar' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
      if (!soft.data?.length) {
        return new Response(
          JSON.stringify({ ok: false, error: 'No existe el ID' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ ok: true, mode: 'soft' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Hard delete sin error: verificar filas afectadas
    if (!hard.data?.length) {
      return new Response(
        JSON.stringify({ ok: false, error: 'No existe el ID' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ ok: true, mode: 'hard' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (e: any) {
    console.error('borrarRepuesto error:', e?.message || e)
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || 'Error' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
