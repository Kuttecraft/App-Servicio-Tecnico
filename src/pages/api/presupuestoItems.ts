import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/* ===================== Helpers ===================== */

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

function parseNumberLike(s?: string | null): number | null {
  if (s == null) return null;
  let t = String(s).trim();
  if (!t) return null;
  // deja dígitos, coma, punto y signo
  t = t.replace(/[^0-9.,-]/g, '');
  const lastDot = t.lastIndexOf('.');
  const lastCom = t.lastIndexOf(',');
  if (lastDot !== -1 && lastCom !== -1) {
    const dec = lastDot > lastCom ? '.' : ',';
    const mil = dec === '.' ? ',' : '.';
    t = t.split(mil).join('');
    if (dec === ',') t = t.replace(',', '.');
  } else if (lastCom !== -1) {
    t = t.replace(',', '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/* ===================== Tipos ===================== */

interface IncomingItem {
  repuesto_id: unknown;
  cantidad?: unknown;
}

interface CleanItem {
  repuesto_id: number;
  cantidad: number;
}

interface DBBridgeRow {
  repuesto_id: number;
  cantidad: number;
  precio_unit: number | null;
}

/* ===================== Utiles de presupuesto ===================== */

async function getOrCreatePresupuestoId(ticketId: number): Promise<number | null> {
  // 1) buscar último presupuesto del ticket
  const { data: rows, error } = await supabase
    .from('presupuestos')
    .select('id')
    .eq('ticket_id', ticketId)
    .order('id', { ascending: false })
    .limit(1);

  if (error) throw error;

  if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) {
    return rows[0].id as number;
  }

  // 2) si no existe, crear uno mínimo (para poder asociar ítems)
  const nowIso = new Date().toISOString();
  const { data: ins, error: insErr } = await supabase
    .from('presupuestos')
    .insert([{ ticket_id: ticketId, fecha_presupuesto: nowIso }])
    .select('id')
    .single();

  if (insErr) throw insErr;
  return ins?.id ?? null;
}

/* ===================== GET ===================== */

export const GET: APIRoute = async ({ url }) => {
  try {
    const ticketId = toInt(url.searchParams.get('ticket_id'));
    if (!ticketId) {
      return new Response(JSON.stringify({ rows: [], error: 'ticket_id inválido' }), { status: 400 });
    }

    // presupuesto asociado
    const presupuestoId = await getOrCreatePresupuestoId(ticketId);
    if (!presupuestoId) {
      return new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ítems guardados en la tabla puente
    const { data: itemsRaw, error: errItems } = await supabase
      .from('presupuesto_repuestos')
      .select('repuesto_id, cantidad, precio_unit')
      .eq('presupuesto_id', presupuestoId);

    if (errItems) throw errItems;

    const items: DBBridgeRow[] = Array.isArray(itemsRaw) ? (itemsRaw as DBBridgeRow[]) : [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // info de repuestos
    const ids = Array.from(new Set(items.map(r => r.repuesto_id)));
    const { data: repRaw, error: errRep } = await supabase
      .from('repuestos_csv')
      .select('id, "Componentes presupuestados", "Precio"')
      .in('id', ids);
    if (errRep) throw errRep;

    type RepRow = { id: number; ['Componentes presupuestados']?: string | null; ['Precio']?: string | null };
    const repuestos: RepRow[] = Array.isArray(repRaw) ? (repRaw as RepRow[]) : [];
    const byId: Record<number, RepRow> = {};
    for (const r of repuestos) byId[r.id] = r;

    // respuesta unificada (precio: preferimos precio_unit snapshot; si no hay, tomamos el actual)
    const rows = items.map((it) => {
      const precioDeTabla = parseNumberLike(byId[it.repuesto_id]?.['Precio'] ?? null);
      const precio = (it.precio_unit ?? precioDeTabla ?? null);
      return {
        repuesto_id: it.repuesto_id,
        cantidad: it.cantidad,
        componente: byId[it.repuesto_id]?.['Componentes presupuestados'] ?? '',
        precio: precio != null ? precio : null,
        precio_unit: it.precio_unit,
      };
    });

    return new Response(JSON.stringify({ rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('presupuestoItems GET error:', e?.message || e);
    return new Response(JSON.stringify({ rows: [], error: e?.message || 'Error' }), { status: 500 });
  }
};

/* ===================== POST ===================== */

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as { ticket_id?: unknown; items?: IncomingItem[] } | unknown;
    const parsed = body as { ticket_id?: unknown; items?: IncomingItem[] };

    const ticket_id = toInt(parsed?.ticket_id);
    if (!ticket_id) {
      return new Response(JSON.stringify({ ok: false, error: 'ticket_id inválido' }), { status: 400 });
    }

    const incoming = Array.isArray(parsed?.items) ? (parsed!.items as IncomingItem[]) : [];
    const clean: CleanItem[] = incoming
      .map((it): CleanItem | null => {
        const repuesto_id = toInt(it?.repuesto_id);
        if (!Number.isFinite(repuesto_id)) return null;
        const cantidadRaw = toInt(it?.cantidad ?? 1);
        const cantidad = Math.max(1, Number.isFinite(cantidadRaw) ? cantidadRaw : 1);
        return { repuesto_id, cantidad };
      })
      .filter((x): x is CleanItem => x !== null);

    // presupuesto destino
    const presupuesto_id = await getOrCreatePresupuestoId(ticket_id);
    if (!presupuesto_id) {
      return new Response(JSON.stringify({ ok: false, error: 'No se pudo obtener/crear presupuesto' }), { status: 500 });
    }

    // si viene vacío, limpiamos y salimos
    if (clean.length === 0) {
      await supabase.from('presupuesto_repuestos').delete().eq('presupuesto_id', presupuesto_id);
      return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
    }

    // Traer precios y stock actuales para validar y snapshot
    const ids = Array.from(new Set(clean.map(x => x.repuesto_id)));
    const { data: repRaw, error: errRep } = await supabase
      .from('repuestos_csv')
      .select('id, "Precio", "Stock"')
      .in('id', ids as number[]);
    if (errRep) throw errRep;

    type RepRow = { id: number; ['Precio']?: string | null; ['Stock']?: string | null };
    const repuestos: RepRow[] = Array.isArray(repRaw) ? (repRaw as RepRow[]) : [];
    const stockById: Record<number, number> = {};
    const priceById: Record<number, number | null> = {};

    for (const r of repuestos) {
      stockById[r.id] = parseNumberLike(r['Stock'] ?? null) ?? 0;
      priceById[r.id] = parseNumberLike(r['Precio'] ?? null);
    }

    // Validación de stock (si stock > 0, no permitir exceder)
    const stockErrors = clean
      .filter(x => {
        const st = stockById[x.repuesto_id] ?? 0;
      return (st === 0 && x.cantidad > 0) || (st > 0 && x.cantidad > st);
      })
      .map(x => ({ repuesto_id: x.repuesto_id, cantidad: x.cantidad, stock: stockById[x.repuesto_id] ?? 0 }));

    if (stockErrors.length > 0) {
      return new Response(JSON.stringify({ ok: false, error: 'Cantidad supera stock', stock_errors: stockErrors }), { status: 400 });
    }

    // Reemplazo total: borro anteriores y cargo nuevos (snapshot de precio)
    const del = await supabase.from('presupuesto_repuestos').delete().eq('presupuesto_id', presupuesto_id);
    if (del.error) throw del.error;

    const payload = clean.map((x) => ({
      presupuesto_id,
      repuesto_id: x.repuesto_id,
      cantidad: x.cantidad,
      precio_unit: priceById[x.repuesto_id] ?? null,
    }));

    const { error: insErr } = await supabase.from('presupuesto_repuestos').insert(payload);
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
