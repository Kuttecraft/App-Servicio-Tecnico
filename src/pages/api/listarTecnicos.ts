// src/pages/api/listarTecnicos.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/**
 * Endpoint GET /api/listarTecnicos
 *
 * 👷 Qué hace:
 * - Sin requerir parámetros, sincroniza y lista los técnicos activos.
 * - Combina datos de dos tablas:
 *     1. `usuarios_perfil` → contiene todos los usuarios registrados (con su email).
 *     2. `tecnicos`        → contiene sólo los técnicos existentes (nombre, email, activo...).
 *
 * 🔄 Lógica principal:
 * 1. Obtiene todos los usuarios de `usuarios_perfil` y filtra los activos con email válido.
 * 2. Consulta la tabla `tecnicos` existente para ver cuáles ya están creados.
 * 3. Por cada usuario con email válido:
 *    - Si no existe en `tecnicos`, lo crea automáticamente.
 *    - Si ya existe y está activo, lo incluye en la lista final.
 * 4. Devuelve una lista deduplicada y ordenada alfabéticamente.
 *
 * 🧱 Campos relevantes:
 *   - usuarios_perfil: id, email, activo
 *   - tecnicos: id, nombre, apellido, email, activo
 *
 * 📤 Respuesta:
 * {
 *   ok: true,
 *   items: [
 *     { id: number, label: string }  // label = parte antes del '@' del email
 *   ]
 * }
 *
 * 🚨 Errores:
 *   - Si Supabase falla → { ok:false, error:"mensaje" }
 *   - No se lanza 403: endpoint accesible, pero controlable desde el front.
 *
 * 🧠 Nota:
 *   - El "nombre" visible del técnico se construye con el local-part del email.
 *   - Se ignora el apellido o nombre real del perfil.
 *   - Técnicos inactivos no se incluyen en el resultado.
 */
export const GET: APIRoute = async () => {
  try {
    // ============================================================
    // 1️⃣ Obtener todos los perfiles de usuario
    // ============================================================
    //
    // Solo se necesitan: id, email y si están activos.
    // El nombre no se usa, ya que el label del técnico será la parte
    // antes del '@' en su email.
    //
    const { data: perfiles, error: upErr } = await supabase
      .from('usuarios_perfil')
      .select('id, email, activo');

    if (upErr) throw upErr;

    // ============================================================
    // 2️⃣ Filtrar usuarios activos con email válido
    // ============================================================
    //
    // Criterios:
    // - activo !== false
    // - email es string con '@' y al menos 4 caracteres
    //
    const activos = (perfiles ?? []).filter(p =>
      (p?.activo !== false) &&
      typeof p?.email === 'string' &&
      p.email.trim().length > 3 &&
      p.email.includes('@')
    );

    // Si no hay perfiles activos → devolvemos lista vacía (no error)
    if (activos.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, items: [] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // ============================================================
    // 3️⃣ Normalizar emails y eliminar duplicados
    // ============================================================
    //
    // - Trim de espacios
    // - Eliminación de duplicados con Set
    // - También preparamos versión en minúsculas (para comparaciones case-insensitive)
    //
    const emails = Array.from(new Set(
      activos.map(p => String(p.email).trim())
    ));
    const emailsLower = emails.map(e => e.toLowerCase()); // opcional (guardado para uso futuro)

    // ============================================================
    // 4️⃣ Consultar técnicos ya existentes en la tabla `tecnicos`
    // ============================================================
    //
    // Campos relevantes:
    //   id, email, activo
    //
    // Luego armamos un mapa email(lowercase) → técnico
    //
    const { data: tecs, error: tecErr } = await supabase
      .from('tecnicos')
      .select('id, email, activo');

    if (tecErr) throw tecErr;

    const tecByEmail = new Map<string, { id: number; email: string; activo: boolean }>();
    (tecs ?? []).forEach(t => {
      if (!t?.email || !t?.id) return;
      tecByEmail.set(
        String(t.email).toLowerCase(),
        { id: t.id, email: t.email, activo: t.activo !== false }
      );
    });

    // ============================================================
    // 5️⃣ Recorrer cada usuario activo y crear técnico si no existe
    // ============================================================
    //
    // items → lista que irá al front: { id, label }
    // label = parte antes de '@' del email
    //
    const items: { id: number; label: string }[] = [];

    for (const rawEmail of emails) {
      const key = rawEmail.toLowerCase();
      const local = rawEmail.split('@')[0] || rawEmail; // local-part del email
      if (!local) continue;

      let tec = tecByEmail.get(key);

      // ------------------------------------------------------------
      // Si el técnico NO existe en la tabla, lo creamos automáticamente
      // ------------------------------------------------------------
      if (!tec) {
        const { data: creado, error: insErr } = await supabase
          .from('tecnicos')
          .insert({
            nombre: local,   // nombre = parte antes del @
            apellido: '',    // sin apellido
            email: rawEmail,
            activo: true
          })
          .select('id, email, activo')
          .single();

        // Si no se pudo crear → se ignora y se pasa al siguiente
        if (insErr || !creado) continue;

        tec = { id: creado.id, email: creado.email, activo: creado.activo !== false };
        tecByEmail.set(key, tec);
      }

      // Si el técnico existe pero está inactivo → no se muestra
      if (tec.activo === false) continue;

      // Agregamos el técnico activo a la lista visible
      items.push({ id: tec.id, label: local });
    }

    // ============================================================
    // 6️⃣ Eliminar duplicados por id y ordenar alfabéticamente
    // ============================================================
    //
    // Esto asegura que si un técnico se agregó más de una vez
    // (por duplicidad de correos u otras razones), sólo quede una entrada.
    //
    const uniq = new Map<number, { id: number; label: string }>();
    for (const it of items)
      if (!uniq.has(it.id)) uniq.set(it.id, it);

    const result = Array.from(uniq.values())
      .sort((a, b) => a.label.localeCompare(b.label));

    // ============================================================
    // 7️⃣ Respuesta final JSON
    // ============================================================
    //
    // - ok: true
    // - items: lista ordenada de técnicos {id, label}
    //
    return new Response(
      JSON.stringify({ ok: true, items: result }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store', // evita cacheo del listado
        },
      }
    );

  } catch (e: any) {
    // ============================================================
    // 8️⃣ Manejo genérico de errores
    // ============================================================
    //
    // Cualquier error (Supabase u otro) devuelve 500 con ok:false
    //
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || String(e) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
