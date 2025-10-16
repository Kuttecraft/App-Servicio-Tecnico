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

  // ── Parámetros ─────────────────────────────────────────────
  let year = Number(url.searchParams.get('year'));
  let month = Number(url.searchParams.get('month'));
  const period = url.searchParams.get('period');
  const groupParam = (url.searchParams.get('group') || 'modelo').toLowerCase();

  const group: 'modelo' | 'estado' | 'tecnico' =
    groupParam === 'estado' ? 'estado' :
    groupParam === 'tecnico' ? 'tecnico' :
    'modelo';

  if ((!year || !month) && period && /^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    year = y; month = m;
  }

  if (!year || !month || month < 1 || month > 12) {
    return new Response(JSON.stringify({ error: 'Parámetros inválidos. Use year+month o period=YYYY-MM.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Filtro por mes en marca_temporal ───────────────────────
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

  // ── Query principal ────────────────────────────────────────
  // 👉 Se agrega join a clientes para recuperar el nombre (cliente)
  const { data, error } = await supabase
    .from('tickets_mian')
    .select(`
      id,
      marca_temporal,
      estado,
      tecnico_id,
      cliente_id,
      impresoras:impresora_id ( modelo ),
      tecnicos:tecnico_id ( email ),
      clientes:cliente_id ( cliente )
    `)
    .or(orExpr);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Helpers normalizadores
  const getTecnicoEmail = (row: any): string | null => {
    const t = Array.isArray(row?.tecnicos) ? row.tecnicos[0] : row?.tecnicos;
    const email: string | undefined = t?.email || undefined;
    return email ? String(email) : null;
  };
  const getClienteNombre = (row: any): string | null => {
    const c = Array.isArray(row?.clientes) ? row.clientes[0] : row?.clientes;
    const nom: string | undefined = c?.cliente || undefined;
    return nom ? String(nom) : null;
  };

  // ── Aggregation (TOP 10) ───────────────────────────────────
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

  // ── Mapas de IDs con cliente (para drill-down) ─────────────
  // Estructura: { clave: [{ id, cliente }] }
  function pushId(map: Record<string, {id:number,cliente:string|null}[]>, key: string, row: any) {
    if (!map[key]) map[key] = [];
    map[key].push({ id: row.id as number, cliente: getClienteNombre(row) });
  }
  function normalizeIdsMap(map: Record<string, {id:number,cliente:string|null}[]>) {
    for (const k of Object.keys(map)) {
      // eliminar duplicados por id manteniendo el primer cliente visto
      const seen = new Set<number>();
      map[k] = map[k].filter(it => {
        if (seen.has(it.id)) return false;
        seen.add(it.id);
        return true;
      }).sort((a,b)=>a.id-b.id);
    }
  }

  let idsByEstado: Record<string, {id:number,cliente:string|null}[]> | undefined;
  let idsByModelo: Record<string, {id:number,cliente:string|null}[]> | undefined;
  let idsByTecnico: Record<string, {id:number,cliente:string|null}[]> | undefined;

  if (group === 'estado') {
    idsByEstado = {};
    for (const row of (data ?? [])) {
      const key = (row as any)?.estado?.toString().trim() || 'Sin estado';
      pushId(idsByEstado, key, row);
    }
    normalizeIdsMap(idsByEstado);
  } else if (group === 'modelo') {
    idsByModelo = {};
    for (const row of (data ?? [])) {
      const key = (row as any)?.impresoras?.modelo?.toString().trim() || 'Sin modelo';
      pushId(idsByModelo, key, row);
    }
    normalizeIdsMap(idsByModelo);
  } else if (group === 'tecnico') {
    idsByTecnico = {};
    for (const row of (data ?? [])) {
      const email = getTecnicoEmail(row);
      const key = email ? (email.split('@')[0] || 'Sin técnico') : 'Sin técnico';
      pushId(idsByTecnico, key, row);
    }
    normalizeIdsMap(idsByTecnico);
  }

  // ── Respuesta ──────────────────────────────────────────────
  return new Response(
    JSON.stringify({ total, items, group, idsByEstado, idsByModelo, idsByTecnico }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
