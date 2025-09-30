// src/pages/api/presupuestoItems.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/** Helpers numéricos seguros */
function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

/** Filas guardadas en presupuesto_items (lo que nos devuelve la DB) */
interface DBPresupuestoItemRow {
  repuesto_id: number;
  cantidad: number;
  precio_unit_al_momento: string | null;
}

/** Ítems recibidos por el POST del cliente */
interface IncomingItem {
  repuesto_id: unknown;
  cantidad?: unknown;
}

/** Ítems saneados y tipados que vamos a guardar */
interface CleanItem {
  repuesto_id: number;
  cantidad: number;
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const ticketId = toInt(url.searchParams.get('ticket_id'));
    if (!ticketId) {
      return new Response(JSON.stringify({ rows: [], error: 'ticket_id inválido' }), { status: 400 });
    }

    // 1) Traer ítems guardados
    const { data: itemsRaw, error: errItems } = await supabase
      .from('presupuesto_items')
      .select('repuesto_id, cantidad, precio_unit_al_momento')
      .eq('ticket_id', ticketId);

    if (errItems) throw errItems;

    const items: DBPresupuestoItemRow[] = Array.isArray(itemsRaw)
      ? (itemsRaw as DBPresupuestoItemRow[])
      : [];

    if (items.length === 0) {
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2) Traer info de repuestos por id
    const ids = Array.from(new Set(items.map((r: DBPresupuestoItemRow) => r.repuesto_id)));
    const { data: repRaw, error: errRep } = await supabase
      .from('repuestos_csv')
      .select('id, "Componentes presupuestados", "Precio"')
      .in('id', ids);

    if (errRep) throw errRep;

    type RepRow = { id: number; ['Componentes presupuestados']?: string | null; ['Precio']?: string | null };
    const repuestos: RepRow[] = Array.isArray(repRaw) ? (repRaw as RepRow[]) : [];

    const byId: Record<number, RepRow> = {};
    for (const r of repuestos) byId[r.id] = r;

    // 3) Unificamos para el cliente
    const rows = items.map((it: DBPresupuestoItemRow) => ({
      repuesto_id: it.repuesto_id,
      cantidad: it.cantidad,
      componente: byId[it.repuesto_id]?.['Componentes presupuestados'] ?? '',
      precio: byId[it.repuesto_id]?.['Precio'] ?? it.precio_unit_al_momento ?? '',
      precio_unit_al_momento: it.precio_unit_al_momento ?? null,
    }));

    return new Response(JSON.stringify({ rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('presupuestoItems GET error:', e?.message || e);
    return new Response(JSON.stringify({ rows: [], error: e?.message || 'Error' }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as { ticket_id?: unknown; items?: IncomingItem[] } | unknown;
    const parsed = body as { ticket_id?: unknown; items?: IncomingItem[] };

    const ticket_id = toInt(parsed?.ticket_id);
    const incoming = Array.isArray(parsed?.items) ? (parsed!.items as IncomingItem[]) : [];

    if (!ticket_id) {
      return new Response(JSON.stringify({ ok: false, error: 'ticket_id inválido' }), { status: 400 });
    }

    // Saneamos: repuesto_id INT y cantidad >= 1
    const clean: CleanItem[] = incoming
      .map((it: IncomingItem): CleanItem | null => {
        const repuesto_id = toInt(it?.repuesto_id);
        if (!Number.isFinite(repuesto_id)) return null;
        const cantidadRaw = toInt(it?.cantidad ?? 1);
        const cantidad = Math.max(1, Number.isFinite(cantidadRaw) ? cantidadRaw : 1);
        return { repuesto_id, cantidad };
      })
      .filter((x: CleanItem | null): x is CleanItem => x !== null);

    // Reemplazo total: borro lo anterior
    const del = await supabase.from('presupuesto_items').delete().eq('ticket_id', ticket_id);
    if (del.error) throw del.error;

    if (clean.length === 0) {
      return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
    }

    // Traigo precios actuales para snapshot
    const ids = Array.from(new Set(clean.map((x: CleanItem) => x.repuesto_id)));
    const { data: repRaw, error: errRep } = await supabase
      .from('repuestos_csv')
      .select('id, "Precio"')
      .in('id', ids);

    if (errRep) throw errRep;

    type RepRow = { id: number; ['Precio']?: string | null };
    const repuestos: RepRow[] = Array.isArray(repRaw) ? (repRaw as RepRow[]) : [];

    const priceById: Record<number, string | null> = {};
    for (const r of repuestos) priceById[r.id] = r['Precio'] ?? null;

    // Payload final
    const payload = clean.map((x: CleanItem) => ({
      ticket_id,
      repuesto_id: x.repuesto_id,
      cantidad: x.cantidad,
      precio_unit_al_momento: priceById[x.repuesto_id] ?? null,
    }));

    const { error: insErr } = await supabase.from('presupuesto_items').insert(payload);
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, count: payload.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('presupuestoItems POST error:', e?.message || e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'Error' }), { status: 500 });
  }
};
