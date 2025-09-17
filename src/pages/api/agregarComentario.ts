import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor, nombreAutor } from '../../lib/resolverAutor';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null) as { ticketId?: number|string; mensaje?: string };

    const ticketIdNum = Number(body?.ticketId);
    const mensaje = (body?.mensaje || '').trim();

    if (!Number.isFinite(ticketIdNum) || ticketIdNum <= 0) {
      return jsonError('ticketId inválido', 400);
    }
    if (!mensaje) {
      return jsonError('El mensaje no puede estar vacío', 400);
    }
    if (mensaje.length > 2000) {
      return jsonError('Mensaje demasiado largo (máx 2000)', 400);
    }

    // Autor
    const autor = await resolverAutor(locals);
    if (!autor) {
      return jsonError('No se pudo determinar el técnico actual', 401);
    }
    if (autor.activo === false) {
      return jsonError('El técnico no está activo', 403);
    }

    // Validar ticket
    const { data: tk } = await supabase
      .from('tickets_mian')
      .select('id')
      .eq('id', ticketIdNum)
      .maybeSingle();
    if (!tk?.id) return jsonError('Ticket inexistente', 404);

    // Insertar comentario (append-only)
    const { data: inserted, error: insErr } = await supabase
      .from('ticket_comentarios')
      .insert({
        ticket_id: ticketIdNum,
        autor_id: autor.id,
        mensaje
      })
      .select('id, creado_en')
      .single();

    if (insErr || !inserted) {
      return jsonError('No se pudo agregar el comentario: ' + (insErr?.message || ''), 500);
    }

    const autorNombre = nombreAutor(autor);
    const creadoHumano = new Date(inserted.creado_en).toLocaleString('es-AR', { hour12: false });

    return new Response(JSON.stringify({
      ok: true,
      id: inserted.id,
      creado_en: inserted.creado_en,
      creado_en_humano: creadoHumano,
      autor: autorNombre,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return jsonError('Error inesperado: ' + (err?.message || String(err)), 500);
  }
};

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
