// src/pages/api/actualizarPresupuesto.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor, nombreAutor } from '../../lib/resolverAutor';

/**
 * Normaliza un texto de monto para almacenarlo en DB:
 * - Elimina caracteres no numéricos (excepto coma, punto y signo).
 * - Detecta el separador decimal (último entre coma o punto).
 * - Convierte siempre a notación con punto decimal.
 * - Devuelve el string limpio o null si estaba vacío.
 */
function normalizarMontoTexto(input?: string | null): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s.replace(/[^0-9.,-]/g, '');
  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');
  if (tienePunto && tieneComa) {
    const lastP = s.lastIndexOf('.'); const lastC = s.lastIndexOf(',');
    const decimalSep = lastP > lastC ? '.' : ','; const milesSep = decimalSep === '.' ? ',' : '.';
    s = s.split(milesSep).join('');
    if (decimalSep === ',') s = s.replace(',', '.');
  } else if (tieneComa && !tienePunto) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  if (!isFinite(n)) return String(s || '');
  return s;
}

/**
 * Helper para responder errores en formato JSON.
 */
function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  // === 1) Validación de ID ===
  const url = new URL(request.url);
  const ticketId = url.searchParams.get('id') || params?.id?.toString();
  if (!ticketId) return jsonError('Falta el parámetro id (ticket_id)', 400);

  const ticketIdNum = Number(ticketId);
  if (!Number.isFinite(ticketIdNum) || ticketIdNum <= 0) {
    return jsonError('id inválido', 400);
  }

  try {
    // === 2) Parseo form ===
    const formData = await request.formData();
    const fields: Record<string, string> = {};
    formData.forEach((value, key) => { if (typeof value === 'string') fields[key] = value.trim(); });

    // === 3) Datos a upsertear en presupuestos ===
    const datos: Record<string, any> = { ticket_id: ticketIdNum };
    if ('monto' in fields) datos.monto = normalizarMontoTexto(fields.monto);
    if ('link_presupuesto' in fields) datos.link_presupuesto = fields.link_presupuesto || null;
    if ('presupuesto_aprobado' in fields) datos.presupuesto_aprobado = fields.presupuesto_aprobado || null; // "Si"|"No"|null
    if ('garantia_activa' in fields) datos.garantia_activa = fields.garantia_activa || null;
    if ('notas_administracion' in fields) datos.notas_administracion = fields.notas_administracion || null;

    // Tri-estado: 'Si' | 'No' | null (Sin seleccionar)
    let solicitarPresuUpdate: 'Si' | 'No' | null = null;
    if ('solicitar_presupuesto' in fields) {
      const raw = fields.solicitar_presupuesto;
      solicitarPresuUpdate = raw === 'Si' ? 'Si' : raw === 'No' ? 'No' : null;
    }

    // === 4) Ticket existe ===
    const { data: tk } = await supabase
      .from('tickets_mian')
      .select('id')
      .eq('id', ticketIdNum)
      .maybeSingle();
    if (!tk?.id) return jsonError('Ticket inexistente', 404);

    // === 5) Upsert en presupuestos (manteniendo sólo la última fila) ===
    const { data: rows, error: existErr } = await supabase
      .from('presupuestos')
      .select('id, fecha_presupuesto')
      .eq('ticket_id', ticketIdNum)
      .order('id', { ascending: true });

    if (existErr) return jsonError(existErr.message, 500);

    const nowIso = new Date().toISOString();
    let opErr: any = null;
    let huboInsert = false;

    if (Array.isArray(rows) && rows.length > 0) {
      // Si existe, actualizar la última fila (fuente de verdad)
      const last = rows[rows.length - 1];
      if (!last.fecha_presupuesto) (datos as any).fecha_presupuesto = nowIso;
      const { error } = await supabase.from('presupuestos').update(datos).eq('id', last.id);
      opErr = error;
      // Limpieza de duplicados: si hay más de 1 fila, borrar las viejas
      if (!opErr && rows.length > 1) {
        const idsViejos = rows.slice(0, rows.length - 1).map(r => r.id);
        await supabase.from('presupuestos').delete().in('id', idsViejos);
      }
    } else {
      // Si no hay filas, crear una nueva
      (datos as any).fecha_presupuesto = nowIso;
      const { error } = await supabase.from('presupuestos').insert([datos]);
      opErr = error;
      huboInsert = !error;
    }

    if (opErr) return jsonError(opErr.message, 500);

    // === 6) Guardar preferencia tri-estado en tickets (si viene) ===
    if ('solicitar_presupuesto' in fields) {
      const { error: updPrefErr } = await supabase
        .from('tickets_mian')
        .update({ solicitar_presupuesto: solicitarPresuUpdate })
        .eq('id', ticketIdNum);
      if (updPrefErr) return jsonError('No se pudo guardar la preferencia: ' + updPrefErr.message, 500);
    }

    // === 7) Estado = "P. Enviado" ===
    const { error: updEstadoErr } = await supabase
      .from('tickets_mian')
      .update({ estado: 'P. Enviado' })
      .eq('id', ticketIdNum);
    if (updEstadoErr) return jsonError('No se pudo marcar P. Enviado: ' + updEstadoErr.message, 500);

    // === 8) Comentario automático "<local-part> envió el presupuesto" ===
    // Obligatorio: si falla, devolvemos error
    const autor = await resolverAutor(locals);
    if (!autor || autor.activo === false) {
      return jsonError('No se pudo determinar el autor para comentar el presupuesto', 401);
    }

    const userEmail: string | null =
      (locals as any)?.user?.email ||
      (locals as any)?.perfil?.email ||
      (locals as any)?.usuario?.email ||
      null;

    const localPart =
      (typeof userEmail === 'string' && userEmail.includes('@'))
        ? userEmail.split('@')[0]
        : nombreAutor(autor); // fallback razonable

    const mensaje = `${localPart} envió el presupuesto`;

    const { error: comErr } = await supabase
      .from('ticket_comentarios')
      .insert({
        ticket_id: ticketIdNum,
        autor_id: autor.id,
        mensaje,
      });

    if (comErr) {
      return jsonError('No se pudo crear el comentario: ' + comErr.message, 500);
    }

    // === 9) Redirect al detalle ===
    return new Response(null, { status: 303, headers: { Location: `/detalle/${ticketIdNum}` } });

  } catch (err: any) {
    return jsonError('Error inesperado: ' + (err?.message || String(err)), 500);
  }
};
