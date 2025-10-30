// src/pages/api/agregarComentario.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor, nombreAutor } from '../../lib/resolverAutor';

/**
 * jsonError()
 * --------------------------------------------------
 * Helper reutilizable para devolver errores en formato JSON
 * con un status HTTP específico. Esto mantiene consistencia
 * en todas las respuestas de error del endpoint.
 */
function jsonError(message: string, status = 500) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * POST /api/agregarComentario
 * --------------------------------------------------
 * Este endpoint agrega un comentario manual (libre) a un ticket.
 *
 * Flujo:
 *   1. Lee el body JSON que envía el front { ticketId, mensaje }.
 *   2. Valida que:
 *      - haya ticketId numérico válido (>0),
 *      - el mensaje no esté vacío y no supere el máximo.
 *   3. Resuelve el autor actual con `resolverAutor(locals)`:
 *      - si no hay autor, devolvemos 401 (no autorizado/técnico no resuelto)
 *      - si el autor está inactivo, devolvemos 403
 *   4. Verifica que el ticket exista en `tickets_mian`.
 *   5. Inserta una fila en `ticket_comentarios` con:
 *        - ticket_id
 *        - autor_id
 *        - mensaje
 *   6. Devuelve JSON con info útil para el frontend:
 *        - id del comentario creado
 *        - marca de tiempo
 *        - nombre del autor en formato legible
 *
 * Seguridad / Auditoría:
 * - Cada comentario queda trazado con `autor_id`, que viene del técnico
 *   autenticado/resuelto vía `locals`.
 * - No permite comentar si el técnico está marcado como inactivo.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    /**
     * 1) Parseo del body
     * ----------------------------------------------------------------------------
     * El frontend debería mandar:
     *    { "ticketId": 123, "mensaje": "Texto del comentario..." }
     *
     * Hacemos request.json(), pero como podría fallar si no viene JSON válido,
     * usamos .catch(() => null) para evitar que reviente el try/catch externo.
     *
     * Tipamos el body como un objeto con `ticketId?` y `mensaje?`
     * para que TypeScript sepa qué esperamos.
     */
    const body = (await request.json().catch(() => null)) as {
      ticketId?: number | string;
      mensaje?: string;
    } | null;

    // 2) Normalizamos y validamos los parámetros de entrada
    const ticketIdNum = Number(body?.ticketId); // lo forzamos a number para usarlo en queries
    const mensaje = (body?.mensaje || '').trim(); // quitamos espacios alrededor

    // Validación del ticketId
    if (!Number.isFinite(ticketIdNum) || ticketIdNum <= 0) {
      return jsonError('ticketId inválido', 400);
    }

    // Validación del mensaje
    if (!mensaje) {
      return jsonError('El mensaje no puede estar vacío', 400);
    }
    if (mensaje.length > 2000) {
      return jsonError('Mensaje demasiado largo (máx 2000)', 400);
    }

    /**
     * 3) Resolver autor
     * ----------------------------------------------------------------------------
     * `resolverAutor(locals)` busca el técnico actual usando varias heurísticas:
     *   - locals.tecnico_id
     *   - email en locals.user / locals.perfil / locals.usuario
     *   - si no existe el técnico, incluso lo crea
     *
     * De ese autor usamos:
     *   - autor.id       → lo guardamos como autor_id en la tabla
     *   - autor.activo   → para bloquear técnicos inactivos
     *   - nombreAutor()  → para mostrar un label legible en respuesta
     */
    const autor = await resolverAutor(locals);
    if (!autor) {
      // No pudimos determinar quién sos → no registramos el comentario
      return jsonError('No se pudo determinar el técnico actual', 401);
    }
    if (autor.activo === false) {
      // El técnico existe pero está marcado como inactivo → bloqueado
      return jsonError('El técnico no está activo', 403);
    }

    /**
     * 4) Confirmar que el ticket existe
     * ----------------------------------------------------------------------------
     * Si alguien intenta comentar un ticket inexistente o borrado,
     * respondemos 404 y no creamos ruido en la DB.
     */
    const { data: tk } = await supabase
      .from('tickets_mian')
      .select('id')
      .eq('id', ticketIdNum)
      .maybeSingle();

    if (!tk?.id) {
      return jsonError('Ticket inexistente', 404);
    }

    /**
     * 5) Insertar el comentario en ticket_comentarios
     * ----------------------------------------------------------------------------
     * Guardamos:
     *   - ticket_id   → relación con el ticket
     *   - autor_id    → FK al técnico que hizo el comentario
     *   - mensaje     → el texto que escribió
     *
     * .select('id, creado_en').single() nos devuelve la fila recién creada
     * con su `id` y el timestamp `creado_en` para mostrar al frontend.
     */
    const { data: inserted, error: insErr } = await supabase
      .from('ticket_comentarios')
      .insert({
        ticket_id: ticketIdNum,
        autor_id: autor.id,
        mensaje,
      })
      .select('id, creado_en')
      .single();

    if (insErr || !inserted) {
      return jsonError(
        'No se pudo agregar el comentario: ' +
          (insErr?.message || ''),
        500
      );
    }

    /**
     * 6) Preparar respuesta amigable para el frontend
     * ----------------------------------------------------------------------------
     * - autorNombre: mostramos "Nombre Apellido" o "Técnico" o derivado del email,
     *   usando nombreAutor(autor).
     * - creadoHumano: lo pasamos por toLocaleString('es-AR') para que el front
     *   ya pueda pintar algo listo (ej: "29/10/2025 14:30:12").
     */
    const autorNombre = nombreAutor(autor);

    // inserted.creado_en es un timestamp ISO (Supabase).
    // Lo convertimos a algo legible en Argentina (es-AR, 24h).
    const creadoHumano = new Date(inserted.creado_en).toLocaleString(
      'es-AR',
      { hour12: false }
    );

    /**
     * 7) Responder con éxito
     * ----------------------------------------------------------------------------
     * Devolvemos:
     *   ok: true
     *   id: id interno del comentario creado
     *   creado_en: timestamp ISO crudo
     *   creado_en_humano: string ya formateada para UI rápida
     *   autor: nombre legible del técnico que comentó
     */
    return new Response(
      JSON.stringify({
        ok: true,
        id: inserted.id,
        creado_en: inserted.creado_en,
        creado_en_humano: creadoHumano,
        autor: autorNombre,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    // Cualquier excepción no controlada cae acá
    return jsonError(
      'Error inesperado: ' + (err?.message || String(err)),
      500
    );
  }
};
