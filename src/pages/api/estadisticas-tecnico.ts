// src/pages/api/estadisticas-Tecnicos.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/**
 * Row: tipo de fila que devuelve el SELECT con joins a impresoras y tecnicos.
 * Notas:
 * - `impresoras` y `tecnicos` pueden venir como array (por el join) o como objeto único.
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
  tecnicos?: any[] | { email?: string | null } | null; // 👈 join
};

/** Estados que consideramos como “impresora reparada” */
const ESTADOS_REPARADA = ['Lista', 'Entregada', 'Archivada'];

/**
 * localPart: toma un email y devuelve la parte local (antes de @).
 * - Limpia caracteres invisibles y espacios raros.
 * - Si no trae '@', devuelve el string tal cual normalizado.
 */
const localPart = (email?: string | null) => {
  let e = String(email || '').toLowerCase();
  // limpia espacios y caracteres invisibles raros
  e = e.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  return e.includes('@') ? e.split('@')[0] : e;
};

/**
 * normalizeJoin: algunos joins de Supabase pueden venir como array de 0..n;
 * esta helper normaliza a un único objeto o null.
 */
const normalizeJoin = <T,>(val: T | T[] | null | undefined): T | null =>
  Array.isArray(val) ? ((val[0] ?? null) as any) : ((val as any) ?? null);

/**
 * esImpresora: determina si una fila corresponde a una impresora identificable,
 * ya sea porque el join de `impresoras` trae un modelo o porque hay texto en `maquina_reparada`.
 */
const esImpresora = (row: Row) => {
  const imp = normalizeJoin(row.impresoras) as any;
  const tieneJoin = !!imp?.modelo;
  const tieneTexto = !!String(row.maquina_reparada || '').trim();
  return tieneJoin || tieneTexto;
};

/**
 * esReparada: heurística para marcar una impresora como reparada.
 * - Si el estado está en ESTADOS_REPARADA → true
 * - Si hay fecha_de_reparacion no vacía → true
 */
const esReparada = (row: Row) => {
  const est = String(row.estado || '').trim();
  if (ESTADOS_REPARADA.includes(est)) return true;
  return !!String(row.fecha_de_reparacion || '').trim();
};

/**
 * patronesMes: arma una lista de patrones OR para filtrar por `marca_temporal`
 * admitiendo múltiples formatos de fecha:
 * - "M/%/YYYY%" (sin pad) y "MM/%/YYYY%" (con pad) — cuando se guarda como M/D/YYYY
 * - "YYYY-MM-%" — estilo ISO parcial
 * - "YYYY/MM/%" — estilo con barras
 *
 * Devuelve un string para usar en `qb.or(...)` de Supabase (campos con `ilike`).
 */
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

/**
 * fetchTickets: consulta tickets con joins a impresoras y tecnicos.
 * - Si `orFecha` viene con patrones, los aplica via qb.or().
 * - Devuelve la lista tipada como Row[].
 */
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

/**
 * GET /api/estadisticas-Tecnicos
 * Parámetros:
 * - tecnico: (opcional) parte local del email del técnico. Si no se envía, se usa el email de la sesión (locals).
 * - all: "true" para ignorar periodo y traer histórico completo.
 * - year, month: numéricos (si no se pasan y no hay 'all', se usa el mes actual).
 * - period: "YYYY-MM" alternativo a (year, month).
 * - debug: "true" para incluir metadatos de depuración.
 *
 * Respuesta:
 * {
 *   tecnico, year?, month?,
 *   totalImpresoras, totalImpresorasReparadas,
 *   items: [{ id, modelo, estado, fecha, reparada }, ...],
 *   debug?: { intento, totRowsRaw, totRowsDelTecnico, sample: [...] }
 * }
 */
export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const debug = (url.searchParams.get('debug') || '').toLowerCase() === 'true';

    // 1) Determinar técnico: querystring `tecnico` o parte local del email de sesión
    const qTec = (url.searchParams.get('tecnico') || '').trim().toLowerCase();
    const perfil = (locals as any)?.perfil || {};
    const emailSesion: string | undefined = perfil?.email || (locals as any)?.user?.email;
    const tecnicoLocal = qTec || (emailSesion ? localPart(emailSesion) : '');
    if (!tecnicoLocal) {
      return new Response(JSON.stringify({ error: 'Falta el técnico' }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2) Determinar periodo (mes/año) o todo histórico
    const all = (url.searchParams.get('all') || '').toLowerCase() === 'true';
    let year = Number(url.searchParams.get('year'));
    let month = Number(url.searchParams.get('month'));
    const period = url.searchParams.get('period');
    const now = new Date();

    // Permite "period=YYYY-MM" como alternativa
    if ((!year || !month) && period && /^\d{4}-\d{2}$/.test(period)) {
      const [y, m] = period.split('-').map(Number);
      year = y; month = m;
    }
    // Si no es all, y el periodo es inválido, usamos el mes actual
    if (!all && (!year || !month || month < 1 || month > 12)) {
      year = now.getFullYear(); month = now.getMonth() + 1;
    }

    // 3) Fetch: primer intento por mes; si no trae filas, nos vamos a histórico
    let rows: Row[] = [];
    let intento = 'mes';
    if (!all) {
      rows = await fetchTickets(patronesMes(year!, month!));
      if (!rows.length) { rows = await fetchTickets(null); intento = 'historico'; }
    } else {
      rows = await fetchTickets(null);
      intento = 'historico(force)';
    }

    // 4) Filtrado por técnico usando el email del join `tecnicos`
    const filasDelTecnico = rows.filter((r) => {
      const tec = normalizeJoin(r.tecnicos) as any;
      const email = tec?.email || null;
      return localPart(email) === tecnicoLocal;
    });

    // 5) Filtrar las filas que realmente refieren a una impresora
    const filasImpresoras = filasDelTecnico.filter(esImpresora);

    // Mapeo a estructura compacta para el frontend
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

    // 6) Agregados
    const totalImpresoras = items.length;
    const totalImpresorasReparadas = items.filter((i) => i.reparada).length;

    // 7) Respuesta
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
    // Manejo de error general
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
