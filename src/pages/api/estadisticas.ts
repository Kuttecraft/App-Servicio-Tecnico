// src/pages/api/estadisticas.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async ({ url, locals }) => {
  // ✅ Solo admin (viene del middleware)
  const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
  const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Permisos insuficientes' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Acepta ?year=YYYY&month=M o ?period=YYYY-MM
  let year = Number(url.searchParams.get('year'));
  let month = Number(url.searchParams.get('month'));
  const period = url.searchParams.get('period'); // ej: 2025-08

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

  // Si `marca_temporal` es TEXT en formato YYYY-MM-DD -> ilike funciona.
  // Si fuese DATE/TIMESTAMPTZ, cambiá por gte/lt (ver comentario debajo).
  const { data, error } = await supabase
    .from('tickets_mian')
    .select(`
      id,
      marca_temporal,
      impresoras:impresora_id ( modelo )
    `)
    .ilike('marca_temporal', `${year}-${monthStr}%`);

  // Alternativa si marca_temporal es DATE/ISO:
  // .gte('marca_temporal', `${year}-${monthStr}-01`)
  // .lt('marca_temporal',  `${year}-${monthStr}-32`)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Agrupar por modelo
  const counts = new Map<string, number>();
  for (const row of (data ?? [])) {
    const modelo = (row as any)?.impresoras?.modelo || 'Sin modelo';
    counts.set(modelo, (counts.get(modelo) || 0) + 1);
  }

  const total = (data ?? []).length;
  const items = Array.from(counts.entries())
    .map(([modelo, count]) => ({
      modelo,
      count,
      porcentaje: total ? (count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return new Response(JSON.stringify({ total, items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
