// src/pages/api/agregarComentario.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor, nombreAutor } from '../../lib/resolverAutor';

/**
 * Endpoint POST para agregar un comentario manual a un ticket.
 * Flujo:
 * 1) Parsear body JSON y validar parámetros (ticketId, mensaje).
 * 2) Resolver autor actual (técnico) desde `locals` y validar que esté activo.
 * 3) Verificar existencia del ticket.
 * 4) Insertar comentario (append-only) en `ticket_comentarios`.
 * 5) Responder con metadatos del comentario creado.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Intentamos leer el body como JSON, y si falla devolvemos null para validar luego.
    const body = await request.json().catch(() => null) as { ticketId?: number|string; mensaje?: string };

    // Normalizamos y validamos entrada.
    const ticketIdNum = Number(body?.ticketId);           // Forzamos a number para la consulta
    const mensaje = (body?.mensaje || '').trim();         // Quitamos espacios al mensaje

    // Validaciones básicas del input
    if (!Number.isFinite(ticketIdNum) || ticketIdNum <= 0) {
      return jsonError('ticketId inválido', 400);
    }
    if (!mensaje) {
      return jsonError('El mensaje no puede estar vacío', 400);
    }
    if (mensaje.length > 2000) {
      return jsonError('Mensaje demasiado largo (máx 2000)', 400);
    }

    // 1) Resolver autor (usuario/técnico actual) desde `locals`.
    const autor = await resolverAutor(locals);
    if (!autor) {
      // Sin autor no podemos auditar quién escribió el comentario
      return jsonError('No se pudo determinar el técnico actual', 401);
    }
    if (autor.activo === false) {
      // Bloqueamos a técnicos inactivos
      return jsonError('El técnico no está activo', 403);
    }

    // 2) Validar existencia del ticket destino
    const { data: tk } = await supabase
      .from('tickets_mian')
      .select('id')
      .eq('id', ticketIdNum)
      .maybeSingle();
    if (!tk?.id) return jsonError('Ticket inexistente', 404);

    // 3) Insertar comentario (append-only) en la tabla de comentarios del ticket
    const { data: inserted, error: insErr } = await supabase
      .from('ticket_comentarios')
      .insert({
        ticket_id: ticketIdNum,
        autor_id: autor.id, // referenciamos al autor resuelto
        mensaje
      })
      .select('id, creado_en') // devolvemos campos útiles para el front
      .single();

    if (insErr || !inserted) {
      return jsonError('No se pudo agregar el comentario: ' + (insErr?.message || ''), 500);
    }

    // 4) Armamos respuesta amigable: nombre del autor y fecha legible
    const autorNombre = nombreAutor(autor);
    const creadoHumano = new Date(inserted.creado_en).toLocaleString('es-AR', { hour12: false });

    // 5) Responder JSON con OK + metadatos del comentario creado
    return new Response(JSON.stringify({
      ok: true,
      id: inserted.id,
      creado_en: inserted.creado_en,
      creado_en_humano: creadoHumano,
      autor: autorNombre,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    // Fallback de error no controlado
    return jsonError('Error inesperado: ' + (err?.message || String(err)), 500);
  }
};

/**
 * Helper para responder errores en JSON con status configurable.
 * Estandariza content-type y payload { error: message }.
 */
function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
