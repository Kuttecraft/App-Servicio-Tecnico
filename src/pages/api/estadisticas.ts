// src/pages/api/estadisticas.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async ({ url, locals }) => {
  // ✅ Solo admin: validamos rol desde `locals` (inyectado por tu capa de auth/middleware)
  const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
  const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Permisos insuficientes' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ───────────────── Parámetros de entrada ─────────────────
  let year = Number(url.searchParams.get('year'));     // año numérico, ej: 2025
  let month = Number(url.searchParams.get('month'));   // mes 1..12
  const period = url.searchParams.get('period');       // alternativo: 'YYYY-MM'
  const groupParam = (url.searchParams.get('group') || 'modelo').toLowerCase();

  // Normalizamos a uno de los 3 grupos válidos (default: 'modelo')
  const group: 'modelo' | 'estado' | 'tecnico' =
    groupParam === 'estado' ? 'estado' :
    groupParam === 'tecnico' ? 'tecnico' :
    'modelo';

  // Permitir `period=YYYY-MM` como alternativa a year+month
  if ((!year || !month) && period && /^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    year = y;
    month = m;
  }

  // Validaciones mínimas de fecha
  if (!year || !month || month < 1 || month > 12) {
    return new Response(JSON.stringify({ error: 'Parámetros inválidos. Use year+month o period=YYYY-MM.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ───────────────── Filtro por mes en `marca_temporal` ─────────────────
  // Acepta varios formatos históricos: M/D/YYYY, MM/D/YYYY (con % al final por si tiene hora),
  // y variantes ISO-like: YYYY-MM-DD o YYYY/MM/DD.
  const y = String(year);
  const mNoPad = String(month);             // ej: '8'
  const mPad   = String(month).padStart(2, '0'); // ej: '08'
  const patterns = [
    `${mNoPad}/%/${y}%`,                    // 8/%/2025%
    ...(mNoPad !== mPad ? [`${mPad}/%/${y}%`] : []), // 08/%/2025% (si aplica)
    `${y}-${mPad}-%`,                       // 2025-08-%
    `${y}/${mPad}/%`,                       // 2025/08/%
  ];
  // Supabase permite .or("campo.ilike.patron1,campo.ilike.patron2,...")
  const orExpr = patterns.map(p => `marca_temporal.ilike.${p}`).join(',');

  // ───────────────── Query principal ─────────────────
  // Traemos lo mínimo para agrupar:
  // - id, marca_temporal, estado
  // - join a impresoras → modelo
  // - join a tecnicos → email (para agrupar por técnico por parte local del email)
  const { data, error } = await supabase
    .from('tickets_mian')
    .select(`
      id,
      marca_temporal,
      estado,
      tecnico_id,
      impresoras:impresora_id ( modelo ),
      tecnicos:tecnico_id ( email )
    `)
    .or(orExpr);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Helper: obtiene el email del técnico (del join), tolerando array u objeto
  const getTecnicoEmail = (row: any): string | null => {
    const t = Array.isArray(row?.tecnicos) ? row.tecnicos[0] : row?.tecnicos;
    const email: string | undefined = t?.email || undefined;
    return email ? String(email) : null;
  };

  // ───────────────── Aggregation (TOP 10) ─────────────────
  // Recorremos filas y vamos sumando por clave según `group`.
  const counts = new Map<string, number>();
  for (const row of (data ?? [])) {
    let key: string;
    if (group === 'estado') {
      key = (row as any)?.estado?.toString().trim() || 'Sin estado';
    } else if (group === 'tecnico') {
      const email = getTecnicoEmail(row);
      // agrupamos por parte local (antes de @); si no hay, “Sin técnico”
      key = email ? (email.split('@')[0] || 'Sin técnico') : 'Sin técnico';
    } else { // group === 'modelo'
      // del join a impresoras, puede venir como objeto directo (gracias al alias)
      key = (row as any)?.impresoras?.modelo?.toString().trim() || 'Sin modelo';
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  // Transformamos a arreglo, calculamos porcentajes y ordenamos desc
  const total = (data ?? []).length;
  const itemsAll = Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      porcentaje: total ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Limitamos a TOP 10 para UI (gráfico/tabla)
  const TOP_N = 10;
  const items = itemsAll.slice(0, TOP_N);

  // ───────────────── IDs agrupados según tipo (útil para drill-down en UI) ─────────────────

  // IDs por estado (cuando group === 'estado')
  let idsByEstado: Record<string, number[]> | undefined;
  if (group === 'estado') {
    idsByEstado = {};
    for (const row of (data ?? [])) {
      const estado = (row as any)?.estado?.toString().trim() || 'Sin estado';
      if (!idsByEstado[estado]) idsByEstado[estado] = [];
      idsByEstado[estado].push((row as any).id as number);
    }
    // normalizamos: sin duplicados y orden ascendente
    for (const k of Object.keys(idsByEstado)) {
      idsByEstado[k] = Array.from(new Set(idsByEstado[k])).sort((a, b) => a - b);
    }
  }

  // IDs por modelo (cuando group === 'modelo')
  let idsByModelo: Record<string, number[]> | undefined;
  if (group === 'modelo') {
    idsByModelo = {};
    for (const row of (data ?? [])) {
      const modelo = (row as any)?.impresoras?.modelo?.toString().trim() || 'Sin modelo';
      if (!idsByModelo[modelo]) idsByModelo[modelo] = [];
      idsByModelo[modelo].push((row as any).id as number);
    }
    for (const k of Object.keys(idsByModelo)) {
      idsByModelo[k] = Array.from(new Set(idsByModelo[k])).sort((a, b) => a - b);
    }
  }

  // 👉 NUEVO: IDs por técnico (cuando group === 'tecnico')
  let idsByTecnico: Record<string, number[]> | undefined;
  if (group === 'tecnico') {
    idsByTecnico = {};
    for (const row of (data ?? [])) {
      const email = getTecnicoEmail(row);
      const tec = email ? (email.split('@')[0] || 'Sin técnico') : 'Sin técnico';
      if (!idsByTecnico[tec]) idsByTecnico[tec] = [];
      idsByTecnico[tec].push((row as any).id as number);
    }
    for (const k of Object.keys(idsByTecnico)) {
      idsByTecnico[k] = Array.from(new Set(idsByTecnico[k])).sort((a, b) => a - b);
    }
  }

  // ───────────────── Respuesta ─────────────────
  return new Response(JSON.stringify({ total, items, group, idsByEstado, idsByModelo, idsByTecnico }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
