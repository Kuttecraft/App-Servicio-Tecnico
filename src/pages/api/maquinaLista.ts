import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor } from '../../lib/resolverAutor';

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

    // 0) Resolver técnico actual desde locals
    const autor = await resolverAutor(locals);
    if (!autor) {
      return new Response(JSON.stringify({ error: 'No se pudo determinar el técnico actual' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (autor.activo === false) {
      return new Response(JSON.stringify({ error: 'El técnico actual no está activo' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1) Traer email real desde la tabla tecnicos
    const { data: tecRow, error: tecErr } = await supabase
      .from('tecnicos')
      .select('id, email, nombre, apellido')
      .eq('id', autor.id)
      .maybeSingle();

    if (tecErr || !tecRow) {
      return new Response(JSON.stringify({ error: 'No se pudo leer el técnico actual' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const email = String(tecRow.email || '').trim();
    const localPart = email.includes('@')
      ? email.split('@')[0]
      : (String(tecRow.nombre || '').trim() || 'tecnico');

    const nowIso = new Date().toISOString();

    // 2) Actualizar ticket
    const { error: updErr } = await supabase
      .from('tickets_mian')
      .update({
        estado: 'Lista',
        fecha_de_reparacion: nowIso,
        tecnico_id: tecRow.id,
      })
      .eq('id', id);

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3) Comentario automático
    try {
      await supabase.from('ticket_comentarios').insert({
        ticket_id: Number(id),
        autor_id: tecRow.id,
        mensaje: `${localPart} marcó Máquina Lista`,
      });
    } catch { /* no bloquear */ }

    // 4) Redirigir al detalle
    return new Response(null, { status: 303, headers: { Location: `/detalle/${id}` } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
