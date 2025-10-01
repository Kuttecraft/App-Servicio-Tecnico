// src/pages/api/presupuestoItems.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/** Helpers numéricos seguros */
function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

/** Normalizador de precio a número ARS (para guardar en NUMERIC) */
function precioStringToNumber(v?: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  // quitar moneda/espacios/puntos de miles y normalizar coma/punto
  let t = s.replace(/[^\d,.-]/g, '');
  // si hay ambos, detecto decimal real
  const hasDot = t.includes('.');
  const hasCom = t.includes(',');
  if (hasDot && hasCom) {
    const lastDot = t.lastIndexOf('.');
    const lastCom = t.lastIndexOf(',');
    const dec = lastDot > lastCom ? '.' : ',';
    const mil = dec === '.' ? ',' : '.';
    t = t.split(mil).join('');
    if (dec === ',') t = t.replace(',', '.');
  } else if (hasCom && !hasDot) {
    // tratar la coma como miles salvo patrón claro de decimales de 1-2 dígitos
    const onlyDigitsComma = t.replace(/[^\d,]/g, '');
    if (/^\d{1,3},\d{1,2}$/.test(onlyDigitsComma)) {
      t = t.replace(',', '.');
    } else {
      t = t.replace(/,/g, '');
    }
  }
  const n = Number(t.replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Busca (o crea si no existe) un presupuesto para el ticket_id */
async function getOrCreatePresupuestoId(ticket_id: number): Promise<number> {
  // Intento encontrar el presupuesto más reciente del ticket
  const { data: found, error: errFind } = await supabase
    .from('presupuestos')
    .select('id')
    .eq('ticket_id', ticket_id)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errFind) throw errFind;
  if (found?.id) return found.id;

  // Si no existe, creo uno mínimo
  const { data: created, error: errIns } = await supabase
    .from('presupuestos')
    .insert({
      ticket_id,
      fecha_presupuesto: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (errIns) throw errIns;
  return created!.id as number;
}

/** GET: devuelve los ítems del presupuesto (derivado de ticket_id) */
export const GET: APIRoute = async ({ url }) => {
  try {
    const ticketId = toInt(url.searchParams.get('ticket_id'));
    if (!ticketId) {
      return new Response(JSON.stringify({ rows: [], error: 'ticket_id inválido' }), { status: 400 });
    }

    // 1) presupuesto_id por ticket
    const presuId = await getOrCreatePresupuestoId(ticketId);

    // 2) Traer ítems actuales del puente
    const { data: itemsRaw, error: errItems } = await supabase
      .from('presupuesto_repuestos')
      .select('repuesto_id, cantidad, precio_unit')
      .eq('presupuesto_id', presuId);

    if (errItems) throw errItems;

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3) Enriquecer con componente y precio visible
    const ids = Array.from(new Set(items.map((r: any) => r.repuesto_id)));
    const { data: repRaw, error: errRep } = await supabase
      .from('repuestos_csv')
      .select('id, "Componentes presupuestados", "Precio"')
      .in('id', ids);

    if (errRep) throw errRep;

    type RepRow = {
      id: number;
      ['Componentes presupuestados']?: string | null;
      ['Precio']?: string | null;
    };
    const repuestos: RepRow[] = Array.isArray(repRaw) ? (repRaw as RepRow[]) : [];
    const byId: Record<number, RepRow> = {};
    for (const r of repuestos) byId[r.id] = r;

    const rows = items.map((it: any) => {
      const precioPrefer = byId[it.repuesto_id]?.['Precio'] ?? null;
      const unitFromTable = it.precio_unit as number | null;
      const precio_unit_num = unitFromTable ?? precioStringToNumber(precioPrefer) ?? 0;
      return {
        repuesto_id: it.repuesto_id,
        cantidad: it.cantidad,
        componente: byId[it.repuesto_id]?.['Componentes presupuestados'] ?? '',
        precio: precioPrefer ?? '',                 // string original visible
        precio_unit_al_momento: unitFromTable,      // lo que hay en el puente
        precio_unit_num,                            // numérico normalizado
      };
    });

    return new Response(JSON.stringify({ rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('presupuestoItems GET error:', e?.message || e);
    return new Response(JSON.stringify({ rows: [], error: e?.message || 'Error' }), { status: 500 });
  }
};

/** POST: reemplaza los ítems del presupuesto (derivado de ticket_id) */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as { ticket_id?: unknown; items?: Array<{ repuesto_id: unknown; cantidad?: unknown }> };
    const ticket_id = toInt(body?.ticket_id);
    const incoming = Array.isArray(body?.items) ? body!.items : [];

    if (!ticket_id) {
      return new Response(JSON.stringify({ ok: false, error: 'ticket_id inválido' }), { status: 400 });
    }

    // Saneado
    const clean = incoming
      .map((it) => {
        const repuesto_id = toInt(it?.repuesto_id);
        if (!Number.isFinite(repuesto_id)) return null;
        const cantRaw = toInt(it?.cantidad ?? 1);
        const cantidad = Math.max(1, Number.isFinite(cantRaw) ? cantRaw : 1);
        return { repuesto_id, cantidad };
      })
      .filter((x): x is { repuesto_id: number; cantidad: number } => x !== null);

    // presupuesto_id por ticket (lo crea si no existe)
    const presupuesto_id = await getOrCreatePresupuestoId(ticket_id);

    // Traigo precios ACTUALES y estado activo
    const ids = Array.from(new Set(clean.map((x) => x.repuesto_id)));
    const { data: repRaw, error: errRep } = await supabase
      .from('repuestos_csv')
      .select('id, "Precio", activo')
      .in('id', ids);

    if (errRep) throw errRep;

    type RepRow = { id: number; ['Precio']?: string | null; activo?: boolean | null };
    const repuestos: RepRow[] = Array.isArray(repRaw) ? (repRaw as RepRow[]) : [];

    const priceById: Record<number, string | null> = {};
    const activeById: Record<number, boolean> = {};
    for (const r of repuestos) {
      priceById[r.id] = r['Precio'] ?? null;
      activeById[r.id] = !!r.activo;
    }

    // Validación: no permitir inactivos
    const inactivos = clean.filter((x) => activeById[x.repuesto_id] === false).map((x) => x.repuesto_id);
    if (inactivos.length > 0) {
      return new Response(
        JSON.stringify({ ok: false, error: `Hay repuestos inactivos: ${inactivos.join(', ')}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Reemplazo total: borro lo anterior
    const del = await supabase
      .from('presupuesto_repuestos')
      .delete()
      .eq('presupuesto_id', presupuesto_id);
    if (del.error) throw del.error;

    if (clean.length === 0) {
      return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
    }

    // Payload final para el puente
    const payload = clean.map((x) => ({
      presupuesto_id,
      repuesto_id: x.repuesto_id,
      cantidad: x.cantidad,
      // snapshot del precio actual (NUMERIC) si existe; si no, null
      precio_unit: (() => {
        const p = priceById[x.repuesto_id];
        const n = precioStringToNumber(p);
        return n === null ? null : n;
      })(),
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
