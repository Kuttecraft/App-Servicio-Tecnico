import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/**
 * Row: tipo de fila que devuelve el SELECT con joins a impresoras, tecnicos y clientes.
 */
type Row = {
  id: number;
  marca_temporal?: string | null;
  estado?: string | null;
  fecha_de_reparacion?: string | null;
  maquina_reparada?: string | null;

  impresora_id?: number | null;
  impresoras?: any[] | { modelo?: string | null } | null;

  tecnico_id?: number | null;
  tecnicos?: any[] | { email?: string | null } | null;

  cliente_id?: number | null;
  clientes?: any[] | { cliente?: string | null } | null;
};

/** Estados que consideramos como “impresora reparada” */
const ESTADOS_REPARADA = ['Lista', 'Entregada', 'Archivada'];

/** localPart del email */
const localPart = (email?: string | null) => {
  let e = String(email || '').toLowerCase();
  e = e.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  return e.includes('@') ? e.split('@')[0] : e;
};

/** Normaliza joins (array/objeto) a un objeto o null */
const normalizeJoin = <T,>(val: T | T[] | null | undefined): T | null =>
  Array.isArray(val) ? ((val[0] ?? null) as any) : ((val as any) ?? null);

/** Heurística: fila refiere a una impresora identificable */
const esImpresora = (row: Row) => {
  const imp = normalizeJoin(row.impresoras) as any;
  const tieneJoin = !!imp?.modelo;
  const tieneTexto = !!String(row.maquina_reparada || '').trim();
  return tieneJoin || tieneTexto;
};

/** Heurística: está reparada por estado o por fecha_de_reparacion */
const esReparada = (row: Row) => {
  const est = String(row.estado || '').trim();
  if (ESTADOS_REPARADA.includes(est)) return true;
  return !!String(row.fecha_de_reparacion || '').trim();
};

/** Patrones para filtrar por mes contra `marca_temporal` (varios formatos) */
function patronesMes(year: number, month: number) {
  const y = String(year);
  const mNoPad = String(month);
  const mPad = String(month).padStart(2, '0');
  const patterns = [
    `${mNoPad}/%/${y}%`,
    ...(mNoPad !== mPad ? [`${mPad}/%/${y}%`] : []),
    `${y}-${mPad}-%`,
    `${y}/${mPad}/%`,
  ];
  return patterns.map((p) => `marca_temporal.ilike.${p}`).join(',');
}

/** Normaliza varias formas de fecha a 'YYYY-MM-DD' (best-effort) */
function normDateLite(value?: string | null): string | null {
  if (!value) return null;
  const s = String(value).trim();
  if (!s) return null;
  const onlyDate = s.split('T')[0].split(' ')[0];
  let m = onlyDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = onlyDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = onlyDate.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const a = parseInt(m[1],10), b = parseInt(m[2],10), yyyy = m[3];
    let dd:number, mm:number;
    if (b > 12 && a <= 12) { mm = a; dd = b; }
    else if (a > 12 && b <= 12) { dd = a; mm = b; }
    else { mm = a; dd = b; }
    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }
  const d = new Date(onlyDate);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/** Diferencia en días de calendario entre dos fechas 'YYYY-MM-DD' (cuenta fines de semana) */
function diffDays(ymdStart?: string | null, ymdEnd?: string | null): number | null {
  if (!ymdStart || !ymdEnd) return null;
  const [y1,m1,d1] = ymdStart.split('-').map(Number);
  const [y2,m2,d2] = ymdEnd.split('-').map(Number);
  const a = new Date(Date.UTC(y1, m1-1, d1));
  const b = new Date(Date.UTC(y2, m2-1, d2));
  const ms = b.getTime() - a.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000); // días de calendario (puede ser 0 o negativo si fuera el caso)
}

/** Consulta tickets con joins a impresoras, tecnicos y clientes */
async function fetchTickets(orFecha: string | null) {
  let qb = supabase
    .from('tickets_mian')
    .select(`
      id,
      marca_temporal,
      estado,
      fecha_de_reparacion,
      maquina_reparada,
      impresora_id,
      impresoras:impresora_id ( modelo ),
      tecnico_id,
      tecnicos:tecnico_id ( email ),
      cliente_id,
      clientes:cliente_id ( cliente )
    `);

  if (orFecha) qb = qb.or(orFecha);

  const { data, error } = await qb;
  if (error) throw new Error(error.message);
  return (data as Row[]) || [];
}

/** Trae el último presupuesto por ticket (por id desc) y retorna mapa ticket_id->fecha_presupuesto */
async function fetchUltimosPresupuestos(ticketIds: number[]) {
  if (!ticketIds.length) return new Map<number, string | null>();
  const { data, error } = await supabase
    .from('presupuestos')
    .select('id, ticket_id, fecha_presupuesto')
    .in('ticket_id', ticketIds)
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  const map = new Map<number, string | null>();
  for (const row of (data || [])) {
    const tid = Number((row as any).ticket_id);
    if (!map.has(tid)) {
      map.set(tid, (row as any).fecha_presupuesto ?? null); // primer registro (id más alto)
    }
  }
  return map;
}

/**
 * GET /api/estadisticas-tecnico
 * Query:
 * - tecnico: local-part del email (opcional; si no, toma de la sesión)
 * - all=true | year, month | period=YYYY-MM
 * - debug=true para metadata
 */
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const debug = (url.searchParams.get('debug') || '').toLowerCase() === 'true';

    // 1) Técnico (query > sesión)
    const qTec = (url.searchParams.get('tecnico') || '').trim().toLowerCase();
    const perfil = (locals as any)?.perfil || {};
    const emailSesion: string | undefined = perfil?.email || (locals as any)?.user?.email;
    const tecnicoLocal = qTec || (emailSesion ? localPart(emailSesion) : '');
    if (!tecnicoLocal) {
      return new Response(JSON.stringify({ error: 'Falta el técnico' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2) Periodo
    const all = (url.searchParams.get('all') || '').toLowerCase() === 'true';
    let year = Number(url.searchParams.get('year'));
    let month = Number(url.searchParams.get('month'));
    const period = url.searchParams.get('period');
    const now = new Date();

    if ((!year || !month) && period && /^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split('-').map(Number);
      year = y; month = m;
    }
    if (!all && (!year || !month || month < 1 || month > 12)) {
      year = now.getFullYear(); month = now.getMonth() + 1;
    }

    // 3) Fetch tickets
    let rows: Row[] = [];
    let intento = 'mes';
    if (!all) {
      rows = await fetchTickets(patronesMes(year!, month!));
      if (!rows.length) { rows = await fetchTickets(null); intento = 'historico'; }
    } else {
      rows = await fetchTickets(null);
      intento = 'historico(force)';
    }

    // 4) Filtrar por técnico
    const filasDelTecnico = rows.filter((r) => {
      const tec = normalizeJoin(r.tecnicos) as any;
      const email = tec?.email || null;
      return localPart(email) === tecnicoLocal;
    });

    // 5) Filtrar impresoras
    const filasImpresoras = filasDelTecnico.filter(esImpresora);

    // 6) Traer último presupuesto por ticket (para fecha_presupuesto)
    const ids = filasImpresoras.map(r => r.id);
    const mapPres = await fetchUltimosPresupuestos(ids);

    // 7) Map a estructura simple con fechas y tardanza
    const items = filasImpresoras.map((r) => {
      const imp = normalizeJoin(r.impresoras) as any;
      const cli = normalizeJoin(r.clientes) as any;
      const modelo = imp?.modelo || r.maquina_reparada || 'Sin modelo';
      const cliente = cli?.cliente || '—';

      const fechaPresRaw = mapPres.get(r.id) ?? null;
      const fechaPres = normDateLite(fechaPresRaw);
      const fechaLista = normDateLite(r.fecha_de_reparacion || null);
      const tardanzaDias = (fechaPres && fechaLista) ? diffDays(fechaPres, fechaLista) : null;

      return {
        id: r.id,
        modelo,
        estado: r.estado || 'Sin estado',
        fecha_presupuesto: fechaPres,     // 👈 nueva
        fecha_lista: fechaLista,          // 👈 nueva
        tardanza_dias: tardanzaDias,      // 👈 nueva (cuenta fines)
        reparada: esReparada(r),
        cliente,
      };
    });

    // 8) Agregados
    const totalImpresoras = items.length;
    const totalImpresorasReparadas = items.filter((i) => i.reparada).length;

    // 9) Respuesta
    return new Response(JSON.stringify({
      tecnico: tecnicoLocal,
      year: (!all && intento === 'mes') ? year : null,
      month: (!all && intento === 'mes') ? month : null,
      totalImpresoras,
      totalImpresorasReparadas,
      items,
      ...(debug ? {
        debug: {
          intento,
          totRowsRaw: rows.length,
          totRowsDelTecnico: filasDelTecnico.length,
          sample: filasDelTecnico.slice(0,5).map(r => ({
            id: r.id,
            tecnico_id: r.tecnico_id,
            tecEmail: normalizeJoin(r.tecnicos)?.email || null,
            cliente: normalizeJoin(r.clientes)?.cliente || null,
            marca_temporal: r.marca_temporal,
            estado: r.estado,
            impresora_id: r.impresora_id,
            maquina_reparada: r.maquina_reparada,
            fecha_de_reparacion: r.fecha_de_reparacion
          }))
        }
      } : {})
    }), { status: 200, headers: { 'Content-Type': 'application/json' }});
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
