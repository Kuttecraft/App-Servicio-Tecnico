// src/pages/api/maquinaLista.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor } from '../../lib/resolverAutor';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Parseamos el querystring para obtener el id del ticket (?id=123)
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      // Sin ID no podemos continuar
      return new Response(JSON.stringify({ error: 'Falta parámetro id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 0) Resolver el técnico actual desde `locals` (inyectado por tu auth/middleware)
    const autor = await resolverAutor(locals);
    if (!autor) {
      // Si no tenemos un autor autenticado, denegamos
      return new Response(JSON.stringify({ error: 'No se pudo determinar el técnico actual' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (autor.activo === false) {
      // Bloqueamos técnicos inactivos
      return new Response(JSON.stringify({ error: 'El técnico actual no está activo' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1) Confirmamos datos del técnico en BD (para obtener email/nombre reales)
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

    // Derivamos un "display name" corto a partir del email (local-part)
    const email = String(tecRow.email || '').trim();
    const localPart = email.includes('@')
      ? email.split('@')[0]
      : (String(tecRow.nombre || '').trim() || 'tecnico');

    // Fecha/hora actual en ISO (se guardará en fecha_de_reparacion)
    const nowIso = new Date().toISOString();

    // 2) Actualizar el ticket:
    //    - estado → 'Lista'
    //    - fecha_de_reparacion → ahora (ISO)
    //    - tecnico_id → id del técnico que ejecuta la acción
    const { error: updErr } = await supabase
      .from('tickets_mian')
      .update({
        estado: 'Lista',
        fecha_de_reparacion: nowIso,
        tecnico_id: tecRow.id,
      })
      .eq('id', id);

    if (updErr) {
      // Si falló la actualización, devolvemos 500 con el mensaje de error
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3) Agregar comentario automático (best-effort: si falla, no bloquea el flujo)
    try {
      await supabase.from('ticket_comentarios').insert({
        ticket_id: Number(id),
        autor_id: tecRow.id,
        mensaje: `${localPart} marcó Máquina Lista`,
      });
    } catch {
      /* no bloquear en caso de error al comentar */
    }

    // 4) Redirigir al detalle del ticket
    return new Response(null, { status: 303, headers: { Location: `/detalle/${id}` } });
  } catch (e: any) {
    // Fallback de error inesperado
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
