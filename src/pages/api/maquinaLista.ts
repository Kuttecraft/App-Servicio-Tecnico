// src/pages/api/maquinaLista.ts
import type { APIRoute } from 'astro';
import { supabaseServer } from '../../lib/supabaseServer';
import { supabase } from '../../lib/supabase';
import { resolverAutor } from '../../lib/resolverAutor';

/** Convierte string "123" o "1.234" a número entero seguro */
function parseIntSafe(v?: string | null): number {
  if (!v) return 0;
  const num = Number(String(v).replace(/[^\d-]/g, ''));
  return Number.isFinite(num) ? num : 0;
}

/** Fecha YYYY-MM-DD en zona AR */
function hoyAR(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // === 0) Obtener ID de ticket ===
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'Falta parámetro id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const ticketId = Number(id);

    // === 1) Resolver técnico actual ===
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

    // === 2) Confirmar técnico en BD ===
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

    // === 3) Buscar presupuesto más reciente del ticket ===
    const { data: presu, error: presErr } = await supabaseServer
      .from('presupuestos')
      .select('id')
      .eq('ticket_id', ticketId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (presErr) {
      return new Response(JSON.stringify({ error: presErr.message }), { status: 500 });
    }

    if (presu?.id) {
      const presupuestoId = presu.id;

      // === 4) Obtener ítems de repuestos de ese presupuesto ===
      const { data: items, error: itemsErr } = await supabaseServer
        .from('presupuesto_repuestos')
        .select('repuesto_id, cantidad')
        .eq('presupuesto_id', presupuestoId);

      if (itemsErr) {
        return new Response(JSON.stringify({ error: itemsErr.message }), { status: 500 });
      }

      if (Array.isArray(items) && items.length > 0) {
        // Agrupar cantidades por repuesto_id
        const agregados = new Map<number, number>();
        for (const it of items) {
          const rid = Number(it.repuesto_id);
          const cant = Number(it.cantidad) || 1;
          agregados.set(rid, (agregados.get(rid) ?? 0) + cant);
        }

        // === 5) Descontar stock uno por uno ===
        for (const [repuestoId, cantidad] of agregados) {
          const { data: repRow, error: repErr } = await supabaseServer
            .from('repuestos_csv')
            .select('id, "Stock", activo')
            .eq('id', repuestoId)
            .maybeSingle();

          if (repErr || !repRow) continue;

          const stockActual = parseIntSafe(repRow['Stock']);
          const nuevoStock = Math.max(0, stockActual - cantidad);

          // Evitar negativos
          if (stockActual < cantidad) {
            return new Response(
              JSON.stringify({
                error: `Stock insuficiente para repuesto ID ${repuestoId} (stock actual ${stockActual}, necesita ${cantidad})`,
              }),
              { status: 409, headers: { 'Content-Type': 'application/json' } }
            );
          }

          await supabaseServer
            .from('repuestos_csv')
            .update({
              Stock: String(nuevoStock),
              activo: nuevoStock > 0 ? repRow.activo : false,
              actualizado_en: new Date().toISOString(),
            })
            .eq('id', repuestoId);
        }
      }
    }

    // === 6) Actualizar ticket a "Lista" ===
    const fechaHoy = hoyAR();
    const { error: updErr } = await supabase
      .from('tickets_mian')
      .update({
        estado: 'Lista',
        fecha_de_reparacion: fechaHoy,
        tecnico_id: tecRow.id,
      })
      .eq('id', ticketId);

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // === 7) Registrar comentario automático (no bloqueante) ===
    const email = String(tecRow.email || '').trim();
    const localPart = email.includes('@')
      ? email.split('@')[0]
      : (tecRow.nombre || 'tecnico');
    try {
      await supabase.from('ticket_comentarios').insert({
        ticket_id: ticketId,
        autor_id: tecRow.id,
        mensaje: `${localPart} marcó Máquina Lista`,
      });
    } catch {
      /* no bloquear si falla */
    }

    // === 8) Redirigir ===
    return new Response(null, { status: 303, headers: { Location: `/detalle/${ticketId}` } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
