// src/pages/api/maquinaLista.ts
import type { APIRoute } from 'astro';
import { supabaseServer } from '../../lib/supabaseServer';
import { supabase } from '../../lib/supabase';
import { resolverAutor } from '../../lib/resolverAutor';

/** Convierte "1.234" / "1234" / "-5" a entero seguro */
function parseIntSafe(v?: string | null): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Fecha YYYY-MM-DD (zona del server) */
function hoyAR(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // === 0) Ticket ID ===
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'Falta parámetro id' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    const ticketId = Number(id);

    // === 1) Técnico actual ===
    const autor = await resolverAutor(locals);
    if (!autor) {
      return new Response(JSON.stringify({ error: 'No se pudo determinar el técnico actual' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      });
    }
    if (autor.activo === false) {
      return new Response(JSON.stringify({ error: 'El técnico actual no está activo' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    // Confirmar datos del técnico
    const { data: tecRow, error: tecErr } = await supabase
      .from('tecnicos')
      .select('id, email, nombre, apellido')
      .eq('id', autor.id)
      .maybeSingle();
    if (tecErr || !tecRow) {
      return new Response(JSON.stringify({ error: 'No se pudo leer el técnico actual' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    // === 2) Presupuesto más reciente ===
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

    let huboNegativos = false;

    // === 3) Si hay presupuesto, traer items, validar inactivos y descontar stock (permitiendo negativo) ===
    if (presu?.id) {
      // 3.1 Items del presupuesto
      const { data: items, error: itemsErr } = await supabaseServer
        .from('presupuesto_repuestos')
        .select('repuesto_id, cantidad')
        .eq('presupuesto_id', presu.id);
      if (itemsErr) {
        return new Response(JSON.stringify({ error: itemsErr.message }), { status: 500 });
      }

      if (Array.isArray(items) && items.length > 0) {
        // 3.2 Agregar cantidades por repuesto_id
        const agregados = new Map<number, number>();
        for (const it of items) {
          const rid = Number(it.repuesto_id);
          const cant = Math.max(1, Number(it.cantidad) || 1);
          agregados.set(rid, (agregados.get(rid) ?? 0) + cant);
        }
        const ids = Array.from(agregados.keys());

        // 3.3 Traer metadatos de repuestos (1 sola query)
        const { data: repRows, error: repErr } = await supabaseServer
          .from('repuestos_csv')
          .select('id, "Stock", activo')
          .in('id', ids);
        if (repErr) {
          return new Response(JSON.stringify({ error: repErr.message }), { status: 500 });
        }

        const byId = new Map<number, { id: number; Stock: string | null; activo: boolean | null }>();
        for (const r of repRows ?? []) byId.set(Number(r.id), { id: r.id, Stock: (r as any)['Stock'], activo: (r as any).activo });

        // 3.4 Validar inactivos (defensa en profundidad)
        const inactivos: number[] = [];
        for (const rid of ids) {
          const meta = byId.get(rid);
          if (!meta) continue;
          if (meta.activo === false) inactivos.push(rid);
        }
        if (inactivos.length > 0) {
          return new Response(
            JSON.stringify({
              error: `Hay repuestos inactivos en el presupuesto: ${inactivos.join(', ')}. Quitalos o reactivalos antes de marcar Máquina Lista.`,
            }),
            { status: 409, headers: { 'Content-Type': 'application/json' } }
          );
        }

        // 3.5 Descontar (permitiendo stock negativo) y actualizar "activo" si queda <= 0
        for (const [rid, cant] of agregados) {
          const meta = byId.get(rid);
          if (!meta) continue;
          const stockActual = parseIntSafe(meta.Stock);
          const nuevoStock = stockActual - cant;      // 👈 puede ser negativo
          if (nuevoStock < 0) huboNegativos = true;

          await supabaseServer
            .from('repuestos_csv')
            .update({
              Stock: String(nuevoStock),
              activo: nuevoStock <= 0 ? false : meta.activo,
              actualizado_en: new Date().toISOString(),
            })
            .eq('id', rid);
        }
      }
    }

    // === 4) Marcar ticket como "Lista" ===
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
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    // === 5) Comentarios automáticos (best-effort) ===
    const email = String(tecRow.email || '').trim();
    const localPart = email.includes('@') ? email.split('@')[0] : (tecRow.nombre || 'tecnico');

    try {
      await supabase.from('ticket_comentarios').insert({
        ticket_id: ticketId,
        autor_id: tecRow.id,
        mensaje: `${localPart} marcó Máquina Lista`,
      });
    } catch {}

    if (huboNegativos) {
      try {
        await supabase.from('ticket_comentarios').insert({
          ticket_id: ticketId,
          autor_id: tecRow.id,
          mensaje: '⚠️ Atención: se marcaron repuestos con cantidad superior al stock disponible; el stock quedó negativo.',
        });
      } catch {}
    }

    // === 6) Redirigir al detalle ===
    return new Response(null, { status: 303, headers: { Location: `/detalle/${ticketId}` } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
