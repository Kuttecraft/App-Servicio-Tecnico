import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor, nombreAutor } from '../../lib/resolverAutor';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return new Response(JSON.stringify({ error: 'Falta parámetro id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const nowIso = new Date().toISOString();

    // 1) Actualizar ticket
    const { error: updErr } = await supabase
      .from('tickets_mian')
      .update({ estado: 'Lista', fecha_de_reparacion: nowIso })
      .eq('id', id);
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2) Comentario automático (no bloqueante)
    try {
      const autor = await resolverAutor(locals);
      if (autor && autor.activo !== false) {
        const mensaje = `${nombreAutor(autor)} marcó Máquina Lista`; // o: 'Marcó Máquina Lista'
        await supabase.from('ticket_comentarios').insert({
          ticket_id: Number(id),
          autor_id: autor.id,
          mensaje,
        });
      }
    } catch { /* no bloquear el flujo */ }

    // 3) Redirigir al detalle
    return new Response(null, { status: 303, headers: { Location: `/detalle/${id}` } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
