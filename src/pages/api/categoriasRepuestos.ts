import type { APIRoute } from 'astro';
import { supabaseServer } from '../../lib/supabaseServer';

/**
 * Devuelve categorías únicas, limpias y ordenadas (ES).
 */
export const GET: APIRoute = async () => {
  try {
    const { data, error } = await supabaseServer
      .from('repuestos_csv')
      .select('categoria')
      .not('categoria', 'is', null)
      .neq('categoria', '')
      .order('categoria', { ascending: true });

    if (error) throw error;

    const set = new Set<string>();
    for (const r of data ?? []) {
      const cleaned = String(r.categoria ?? '').trim();
      if (cleaned) set.add(cleaned);
    }

    const categorias = Array.from(set).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );

    return new Response(JSON.stringify({ categorias }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('categoriasRepuestos error:', e?.message || e);
    return new Response(JSON.stringify({ categorias: [], error: e?.message || 'Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
