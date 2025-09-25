// src/pages/api/listarTecnicos.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const GET: APIRoute = async () => {
  try {
    // 1) Traer perfiles de usuarios (solo usamos email y si están activos).
    //    Ignoramos nombre del perfil: el "nombre" del técnico será el local-part del email.
    const { data: perfiles, error: upErr } = await supabase
      .from('usuarios_perfil')
      .select('id, email, activo');

    if (upErr) throw upErr;

    // Filtrar perfiles "activos" con email válido y con '@'
    const activos = (perfiles ?? []).filter(p =>
      (p?.activo !== false) &&
      typeof p?.email === 'string' &&
      p.email.trim().length > 3 &&
      p.email.includes('@')
    );

    // Si no hay perfiles activos con email válido, devolvemos lista vacía
    if (activos.length === 0) {
      return new Response(JSON.stringify({ ok: true, items: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }

    // Normalizamos emails (trim) y eliminamos duplicados (Set)
    const emails = Array.from(new Set(
      activos.map(p => String(p.email).trim())
    ));
    // Versión lowercase para mapear con tecnicos.email sin problemas de case
    const emailsLower = emails.map(e => e.toLowerCase()); // (se deja por si se quisiera usar)

    // 2) Cargar técnicos existentes para mapearlos por email (case-insensitive)
    const { data: tecs, error: tecErr } = await supabase
      .from('tecnicos')
      .select('id, email, activo');

    if (tecErr) throw tecErr;

    // Mapa email(lower) → técnico
    const tecByEmail = new Map<string, { id:number; email:string; activo:boolean }>();
    (tecs ?? []).forEach(t => {
      if (!t?.email || !t?.id) return;
      tecByEmail.set(String(t.email).toLowerCase(), { id: t.id, email: t.email, activo: t.activo !== false });
    });

    // items para UI: { id, label } donde label = local-part del email (antes de @)
    const items: { id: number; label: string }[] = [];

    // 3) Recorremos cada email de usuarios_perfil:
    //    - Si NO hay técnico asociado, lo creamos (nombre = local-part, sin apellido).
    //    - Si existe y está activo, lo agregamos a la lista.
    for (const rawEmail of emails) {
      const key = rawEmail.toLowerCase();
      const local = rawEmail.split('@')[0] || rawEmail; // parte antes del @
      if (!local) continue;

      let tec = tecByEmail.get(key);

      if (!tec) {
        // Crear nuevo técnico con nombre = local-part y apellido vacío
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
          // Si no pudimos crearlo por algún motivo, seguimos con el próximo email
          continue;
        }
        tec = { id: creado.id, email: creado.email, activo: creado.activo !== false };
        tecByEmail.set(key, tec);
      }

      // Si el técnico existe pero está inactivo, no lo incluimos
      if (tec.activo === false) continue;

      // label mostrado en la UI = local-part del email
      items.push({ id: tec.id, label: local });
    }

    // Eliminamos posibles duplicados por id y ordenamos alfabéticamente por label
    const uniq = new Map<number, { id:number; label:string }>();
    for (const it of items) if (!uniq.has(it.id)) uniq.set(it.id, it);
    const result = Array.from(uniq.values()).sort((a, b) => a.label.localeCompare(b.label));

    return new Response(JSON.stringify({ ok: true, items: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    // Fallback de error genérico
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
};
