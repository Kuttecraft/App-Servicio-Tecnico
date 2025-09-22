import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

type Row = {
  id: number;
  marca_temporal?: string | null;
  estado?: string | null;
  fecha_de_reparacion?: string | null;
  maquina_reparada?: string | null;
  impresora_id?: number | null;
  impresoras?: any[] | { modelo?: string | null } | null;
  tecnico_id?: number | null;
  tecnicos?: any[] | { email?: string | null } | null; // 👈 join
};

const ESTADOS_REPARADA = ['Lista', 'Entregada', 'Archivada'];

const localPart = (email?: string | null) => {
  let e = String(email || '').toLowerCase();
  // limpia espacios y caracteres invisibles raros
  e = e.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  return e.includes('@') ? e.split('@')[0] : e;
};

const normalizeJoin = <T,>(val: T | T[] | null | undefined): T | null =>
  Array.isArray(val) ? ((val[0] ?? null) as any) : ((val as any) ?? null);

const esImpresora = (row: Row) => {
  const imp = normalizeJoin(row.impresoras) as any;
  const tieneJoin = !!imp?.modelo;
  const tieneTexto = !!String(row.maquina_reparada || '').trim();
  return tieneJoin || tieneTexto;
};

const esReparada = (row: Row) => {
  const est = String(row.estado || '').trim();
  if (ESTADOS_REPARADA.includes(est)) return true;
  return !!String(row.fecha_de_reparacion || '').trim();
};

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
      tecnicos:tecnico_id ( email )
    `);

  if (orFecha) qb = qb.or(orFecha);

  const { data, error } = await qb;
  if (error) throw new Error(error.message);
  return (data as Row[]) || [];
}


export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const debug = (url.searchParams.get('debug') || '').toLowerCase() === 'true';

    // técnico (parte local)
    const qTec = (url.searchParams.get('tecnico') || '').trim().toLowerCase();
    const perfil = (locals as any)?.perfil || {};
    const emailSesion: string | undefined = perfil?.email || (locals as any)?.user?.email;
    const tecnicoLocal = qTec || (emailSesion ? localPart(emailSesion) : '');
    if (!tecnicoLocal) {
      return new Response(JSON.stringify({ error: 'Falta el técnico' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // fechas
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

    // primer intento: por mes
    let rows: Row[] = [];
    let intento = 'mes';
    if (!all) {
      rows = await fetchTickets(patronesMes(year!, month!));
      if (!rows.length) { rows = await fetchTickets(null); intento = 'historico'; }
    } else {
      rows = await fetchTickets(null);
      intento = 'historico(force)';
    }

    // filtrar por técnico por el **email del join**
    const filasDelTecnico = rows.filter((r) => {
      const tec = normalizeJoin(r.tecnicos) as any;
      const email = tec?.email || null;
      return localPart(email) === tecnicoLocal;
    });

    // impresoras + agregados
    const filasImpresoras = filasDelTecnico.filter(esImpresora);
    const items = filasImpresoras.map((r) => {
      const imp = normalizeJoin(r.impresoras) as any;
      const modelo = imp?.modelo || r.maquina_reparada || 'Sin modelo';
      return {
        id: r.id,
        modelo,
        estado: r.estado || 'Sin estado',
        fecha: r.marca_temporal || '',
        reparada: esReparada(r),
      };
    });

    const totalImpresoras = items.length;
    const totalImpresorasReparadas = items.filter((i) => i.reparada).length;

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
