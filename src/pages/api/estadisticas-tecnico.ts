// src/pages/api/estadisticas-tecnico.ts
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
  clientes?: any[] | { cliente?: string | null } | null; // 👈 join cliente
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

    // 3) Fetch
    let rows: Row[] = [];
    let intento = 'mes';
    if (!all) {
      rows = await fetchTickets(patronesMes(year!, month!));
      if (!rows.length) { rows = await fetchTickets(null); intento = 'historico'; }
    } else {
      rows = await fetchTickets(null);
      intento = 'historico(force)';
    }

    // 4) Filtrar por técnico (local-part del email del join `tecnicos`)
    const filasDelTecnico = rows.filter((r) => {
      const tec = normalizeJoin(r.tecnicos) as any;
      const email = tec?.email || null;
      return localPart(email) === tecnicoLocal;
    });

    // 5) Quedarnos con filas que refieren a impresora
    const filasImpresoras = filasDelTecnico.filter(esImpresora);

    // 6) Map a estructura simple (agregamos `cliente`)
    const items = filasImpresoras.map((r) => {
      const imp = normalizeJoin(r.impresoras) as any;
      const cli = normalizeJoin(r.clientes) as any;
      const modelo = imp?.modelo || r.maquina_reparada || 'Sin modelo';
      const cliente = cli?.cliente || '—';
      return {
        id: r.id,
        modelo,
        estado: r.estado || 'Sin estado',
        fecha: r.marca_temporal || '',
        reparada: esReparada(r),
        cliente, // 👈 agregado
      };
    });

    // 7) Agregados
    const totalImpresoras = items.length;
    const totalImpresorasReparadas = items.filter((i) => i.reparada).length;

    // 8) Respuesta
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
            maquina_reparada: r.maquina_reparada
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
