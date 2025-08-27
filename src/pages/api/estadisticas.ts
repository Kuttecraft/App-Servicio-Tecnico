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

  // Parámetros: ?year=YYYY&month=M y ?group=modelo|estado
  let year = Number(url.searchParams.get('year'));
  let month = Number(url.searchParams.get('month'));
  const period = url.searchParams.get('period'); // opcional: 2025-08
  const groupParam = (url.searchParams.get('group') || 'modelo').toLowerCase(); // default: modelo
  const group: 'modelo' | 'estado' = groupParam === 'estado' ? 'estado' : 'modelo';

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

  const monthStr = String(month).padStart(2, '0');

  // marcamos el MES en marca_temporal (TEXT ISO: "YYYY-MM-DD...")
  const { data, error } = await supabase
    .from('tickets_mian')
    .select(`
      id,
      marca_temporal,
      estado,
      impresoras:impresora_id ( modelo )
    `)
    .ilike('marca_temporal', `${year}-${monthStr}%`);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Agrupar por el campo solicitado
  const counts = new Map<string, number>();
  for (const row of (data ?? [])) {
    let key: string;
    if (group === 'estado') {
      key = (row as any)?.estado?.toString().trim() || 'Sin estado';
    } else {
      key = (row as any)?.impresoras?.modelo?.toString().trim() || 'Sin modelo';
    }
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const total = (data ?? []).length;
  const items = Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      porcentaje: total ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Para el front no hace falta devolver "group", pero puede servir
  return new Response(JSON.stringify({ total, items, group }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
