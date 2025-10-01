// src/pages/api/presupuestoItems.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/** ===== Helpers ===== */
function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

/** Convierte un string de precio a ENTERO ARS (miles con punto, sin decimales).
 * Reglas:
 * "$7.510" -> 7510
 * "7,51"   -> 7510
 * "7.51"   -> 7510
 * "12.345" -> 12345
 * "12,3"   -> 12300
 */
function parseEnteroARS(s?: string | null): number | null {
  if (!s) return null;
  const raw = String(s).trim();
  if (!raw) return null;

  const hasDot = raw.includes('.');
  const hasCom = raw.includes(',');

  if (hasDot && hasCom) {
    const lastDot = raw.lastIndexOf('.');
    const lastCom = raw.lastIndexOf(',');
    const dec = lastDot > lastCom ? '.' : ',';
    const mil = dec === '.' ? ',' : '.';
    let t = raw.split(mil).join('');
    if (dec === ',') t = t.replace(',', '.');
    const n = Number(t.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(n)) return null;
    return Math.round(n < 1000 ? n * 1000 : n);
  }

  if (hasCom && !hasDot) {
    const only = raw.replace(/[^\d,]/g, '');
    if (/^\d{1,3},\d{1,2}$/.test(only)) {
      const n = Number(only.replace(',', '.'));
      return Number.isFinite(n) ? Math.round(n * 1000) : null;
    }
    const d = raw.replace(/[^\d]/g, '');
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
  }

  if (hasDot && !hasCom) {
    const only = raw.replace(/[^\d.]/g, '');
    if (/^\d{1,3}\.\d{1,2}$/.test(only)) {
      const n = Number(only);
      return Number.isFinite(n) ? Math.round(n * 1000) : null;
    }
    const d = raw.replace(/[^\d]/g, '');
    const n = Number(d);
    return Number.isFinite(n) ? n : null;
  }

  const d = raw.replace(/[^\d]/g, '');
  const n = Number(d);
  return Number.isFinite(n) ? n : null;
}

/** Busca (o crea) un presupuesto y devuelve su id */
async function getOrCreatePresupuestoId(ticket_id: number): Promise<number> {
  const { data: found, error: errFind } = await supabase
    .from('presupuestos')
    .select('id')
    .eq('ticket_id', ticket_id)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errFind) throw errFind;
  if (found?.id) return found.id;

  const { data: created, error: errIns } = await supabase
    .from('presupuestos')
    .insert({ ticket_id, fecha_presupuesto: new Date().toISOString() })
    .select('id')
    .single();
  if (errIns) throw errIns;
  return created!.id as number;
}

/** ================= GET =================
 * Devuelve ítems desde presupuesto_repuestos + info de repuesto,
 * siempre con precio_unit_num como ENTERO ARS.
 */
export const GET: APIRoute = async ({ url }) => {
  try {
    const ticketId = toInt(url.searchParams.get('ticket_id'));
    if (!ticketId) {
      return new Response(JSON.stringify({ rows: [], error: 'ticket_id inválido' }), { status: 400 });
    }

    const presupuesto_id = await getOrCreatePresupuestoId(ticketId);

    const { data: itemsRaw, error: errItems } = await supabase
      .from('presupuesto_repuestos')
      .select('repuesto_id, cantidad, precio_unit')
      .eq('presupuesto_id', presupuesto_id);
    if (errItems) throw errItems;

    const items = Array.isArray(itemsRaw) ? itemsRaw : [];
    if (items.length === 0) {
      return new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ids = Array.from(new Set(items.map((r: any) => r.repuesto_id)));
    const { data: repRaw, error: errRep } = await supabase
      .from('repuestos_csv')
      .select('id, "Componentes presupuestados", "Precio"')
      .in('id', ids);
    if (errRep) throw errRep;

    type RepRow = { id: number; ['Componentes presupuestados']?: string | null; ['Precio']?: string | null };
    const repuestos: RepRow[] = Array.isArray(repRaw) ? (repRaw as RepRow[]) : [];
    const byId: Record<number, RepRow> = {};
    for (const r of repuestos) byId[r.id] = r;

    const rows = items.map((it: any) => {
      const preferStr = byId[it.repuesto_id]?.['Precio'] ?? null;
      const preferNum =
        it?.precio_unit != null && Number.isFinite(Number(it.precio_unit))
          ? Number(it.precio_unit)
          : parseEnteroARS(preferStr);

      return {
        repuesto_id: it.repuesto_id,
        cantidad: it.cantidad,
        componente: byId[it.repuesto_id]?.['Componentes presupuestados'] ?? '',
        precio: preferStr ?? '',
        precio_unit_al_momento: it?.precio_unit ?? null,
        precio_unit_num: preferNum ?? 0, // ENTERO ARS
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

/** ================= POST =================
 * Reemplaza ítems del presupuesto y guarda snapshot del precio como ENTERO ARS.
 * No permite repuestos inactivos.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json()) as { ticket_id?: unknown; items?: Array<{ repuesto_id: unknown; cantidad?: unknown }> };
    const ticket_id = toInt(body?.ticket_id);
    const incoming = Array.isArray(body?.items) ? body!.items : [];

    if (!ticket_id) {
      return new Response(JSON.stringify({ ok: false, error: 'ticket_id inválido' }), { status: 400 });
    }

    const clean = incoming
      .map((it) => {
        const repuesto_id = toInt(it?.repuesto_id);
        if (!Number.isFinite(repuesto_id)) return null;
        const cr = toInt(it?.cantidad ?? 1);
        const cantidad = Math.max(1, Number.isFinite(cr) ? cr : 1);
        return { repuesto_id, cantidad };
      })
      .filter((x): x is { repuesto_id: number; cantidad: number } => x !== null);

    const presupuesto_id = await getOrCreatePresupuestoId(ticket_id);

    // Traigo estado + precio actual (string) de los repuestos
    const ids = Array.from(new Set(clean.map((x) => x.repuesto_id)));
    const { data: repRaw, error: errRep } = await supabase
      .from('repuestos_csv')
      .select('id, "Precio", activo')
      .in('id', ids);
    if (errRep) throw errRep;

    type RepRow = { id: number; ['Precio']?: string | null; activo?: boolean | null };
    const repuestos: RepRow[] = Array.isArray(repRaw) ? repRaw : [];
    const priceById: Record<number, string | null> = {};
    const activeById: Record<number, boolean> = {};
    for (const r of repuestos) {
      priceById[r.id] = r['Precio'] ?? null;
      activeById[r.id] = !!r.activo;
    }

    // Bloqueo inactivos
    const inactivos = clean.filter(x => activeById[x.repuesto_id] === false).map(x => x.repuesto_id);
    if (inactivos.length > 0) {
      return new Response(JSON.stringify({ ok: false, error: `Hay repuestos inactivos: ${inactivos.join(', ')}` }), { status: 400 });
    }

    // Reemplazo total
    const del = await supabase.from('presupuesto_repuestos').delete().eq('presupuesto_id', presupuesto_id);
    if (del.error) throw del.error;

    if (clean.length === 0) {
      return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
    }

    // Inserto snapshot con precio ENTERO ARS
    const payload = clean.map(x => ({
      presupuesto_id,
      repuesto_id: x.repuesto_id,
      cantidad: x.cantidad,
      precio_unit: (() => {
        const parsed = parseEnteroARS(priceById[x.repuesto_id]);
        return parsed ?? null; // NUMERIC entero en ARS
      })(),
    }));

    const { error: insErr } = await supabase.from('presupuesto_repuestos').insert(payload);
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, count: payload.length }), { status: 200 });
  } catch (e: any) {
    console.error('presupuestoItems POST error:', e?.message || e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'Error' }), { status: 500 });
  }
};
