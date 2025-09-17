// src/pages/api/estadisticas.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async ({ url, locals }) => {
  // ✅ Solo admin
  const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
  const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Permisos insuficientes' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parámetros
  let year = Number(url.searchParams.get('year'));
  let month = Number(url.searchParams.get('month'));
  const period = url.searchParams.get('period'); // opcional: 2025-08
  const groupParam = (url.searchParams.get('group') || 'modelo').toLowerCase();
  const group: 'modelo' | 'estado' | 'tecnico' =
    groupParam === 'estado' ? 'estado' :
    groupParam === 'tecnico' ? 'tecnico' :
    'modelo';

  if ((!year || !month) && period && /^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    year = y;
    month = m;
  }
  if (!year || !month || month < 1 || month > 12) {
    return new Response(JSON.stringify({ error: 'Parámetros inválidos. Use year+month o period=YYYY-MM.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Aceptar M/D/YYYY, MM/D/YYYY, YYYY-MM-DD y YYYY/MM/DD en marca_temporal
  const y = String(year);
  const mNoPad = String(month);
  const mPad   = String(month).padStart(2, '0');
  const patterns = [
    `${mNoPad}/%/${y}%`,
    ...(mNoPad !== mPad ? [`${mPad}/%/${y}%`] : []),
    `${y}-${mPad}-%`,
    `${y}/${mPad}/%`,
  ];
  const orExpr = patterns.map(p => `marca_temporal.ilike.${p}`).join(',');

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

  const getTecnicoEmail = (row: any): string | null => {
    const t = Array.isArray(row?.tecnicos) ? row.tecnicos[0] : row?.tecnicos;
    const email: string | undefined = t?.email || undefined;
    return email ? String(email) : null;
  };

  // Agrupar (TOP 10 para el gráfico/tabla)
  const counts = new Map<string, number>();
  for (const row of (data ?? [])) {
    let key: string;
    if (group === 'estado') {
      key = (row as any)?.estado?.toString().trim() || 'Sin estado';
    } else if (group === 'tecnico') {
      const email = getTecnicoEmail(row);
      key = email ? (email.split('@')[0] || 'Sin técnico') : 'Sin técnico';
    } else { // modelo
      key = (row as any)?.impresoras?.modelo?.toString().trim() || 'Sin modelo';
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const total = (data ?? []).length;
  const itemsAll = Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      porcentaje: total ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const TOP_N = 10;
  const items = itemsAll.slice(0, TOP_N);

  // IDs por estado (cuando group === 'estado')
  let idsByEstado: Record<string, number[]> | undefined;
  if (group === 'estado') {
    idsByEstado = {};
    for (const row of (data ?? [])) {
      const estado = (row as any)?.estado?.toString().trim() || 'Sin estado';
      if (!idsByEstado[estado]) idsByEstado[estado] = [];
      idsByEstado[estado].push((row as any).id as number);
    }
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

  return new Response(JSON.stringify({ total, items, group, idsByEstado, idsByModelo, idsByTecnico }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
