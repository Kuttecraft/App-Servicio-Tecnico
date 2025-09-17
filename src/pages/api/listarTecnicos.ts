import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

function splitNombreCompleto(n: string) {
  const raw = (n || '').trim();
  if (!raw) return { nombre: '', apellido: '' };
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { nombre: parts[0], apellido: '' };
  return { nombre: parts[0], apellido: parts.slice(1).join(' ') };
}

export const GET: APIRoute = async () => {
  try {
    // 1) Traer usuarios_perfil (usamos email como "nombre visible" sin @)
    const { data: perfiles, error: upErr } = await supabase
      .from('usuarios_perfil')
      .select('id, email, nombre, activo');

    if (upErr) throw upErr;

    // Filtrar activos + emails válidos
    const activos = (perfiles ?? []).filter(p =>
      (p?.activo !== false) &&
      typeof p?.email === 'string' &&
      p.email.trim().length > 3 &&
      p.email.includes('@')
    );

    if (activos.length === 0) {
      return new Response(JSON.stringify({ ok: true, items: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Normalizar emails (case-insensitive)
    const emails = Array.from(new Set(
      activos.map(p => String(p.email).trim())
    ));
    const emailsLower = emails.map(e => e.toLowerCase());

    // 2) Buscar técnicos existentes por email
    const { data: tecs, error: tecErr } = await supabase
      .from('tecnicos')
      .select('id, email, activo');

    if (tecErr) throw tecErr;

    const tecByEmail = new Map<string, { id:number; email:string; activo:boolean }>();
    (tecs ?? []).forEach(t => {
      if (!t?.email || !t?.id) return;
      tecByEmail.set(String(t.email).toLowerCase(), { id: t.id, email: t.email, activo: t.activo !== false });
    });

    const items: { id: number; label: string }[] = [];

    // 3) Para cada email de usuarios_perfil: si no hay técnico, lo creamos
    for (const p of activos) {
      const rawEmail = String(p.email).trim();
      const key = rawEmail.toLowerCase();
      let tec = tecByEmail.get(key);

      if (!tec) {
        // crear técnico a partir del perfil (nombre opcional)
        const { nombre, apellido } = splitNombreCompleto(String(p.nombre || ''));
        const { data: creado, error: insErr } = await supabase
          .from('tecnicos')
          .insert({
            nombre: nombre || rawEmail.split('@')[0],
            apellido: apellido || '',
            email: rawEmail,
            activo: true
          })
          .select('id, email, activo')
          .single();

        if (insErr) {
          // si no pudimos crearlo, lo salteamos
          // (mejor loguear server-side)
          continue;
        }
        tec = { id: creado!.id, email: creado!.email, activo: creado!.activo !== false };
        tecByEmail.set(key, tec);
      }

      if (tec.activo === false) continue;
      items.push({ id: tec.id, label: rawEmail.split('@')[0] });
    }

    // Únicos por id + orden
    const uniq = new Map<number, { id:number; label:string }>();
    for (const it of items) if (!uniq.has(it.id)) uniq.set(it.id, it);
    const result = Array.from(uniq.values()).sort((a,b) => a.label.localeCompare(b.label));

    return new Response(JSON.stringify({ ok: true, items: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
