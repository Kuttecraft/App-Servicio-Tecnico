import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async () => {
  try {
    // 1) Traer perfiles (usamos SOLO el email; ignoramos "nombre" del perfil)
    const { data: perfiles, error: upErr } = await supabase
      .from('usuarios_perfil')
      .select('id, email, activo');

    if (upErr) throw upErr;

    // Filtrar activos con email válido
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

    // Normalizar emails
    const emails = Array.from(new Set(
      activos.map(p => String(p.email).trim())
    ));
    const emailsLower = emails.map(e => e.toLowerCase());

    // 2) Cargar técnicos existentes para mapear por email
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

    // 3) Por cada email de usuarios_perfil: si no hay técnico, crearlo
    for (const rawEmail of emails) {
      const key = rawEmail.toLowerCase();
      const local = rawEmail.split('@')[0] || rawEmail; // parte antes del @
      if (!local) continue;

      let tec = tecByEmail.get(key);

      if (!tec) {
        // 👇 Forzamos que el "nombre" del técnico sea SIEMPRE el local-part del email
        const { data: creado, error: insErr } = await supabase
          .from('tecnicos')
          .insert({
            nombre: local,     // <-- nombre = parte antes de @
            apellido: '',      // sin apellido
            email: rawEmail,
            activo: true
          })
          .select('id, email, activo')
          .single();

        if (insErr || !creado) {
          // no pudimos crear; seguir con el próximo
          continue;
        }
        tec = { id: creado.id, email: creado.email, activo: creado.activo !== false };
        tecByEmail.set(key, tec);
      }

      if (tec.activo === false) continue;

      // label que se muestra en UI = local-part
      items.push({ id: tec.id, label: local });
    }

    // Únicos por id + orden
    const uniq = new Map<number, { id:number; label:string }>();
    for (const it of items) if (!uniq.has(it.id)) uniq.set(it.id, it);
    const result = Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label));

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
