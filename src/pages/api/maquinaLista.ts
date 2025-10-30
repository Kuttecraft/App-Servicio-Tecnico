// src/pages/api/maquinaLista.ts
import type { APIRoute } from 'astro';
import { supabaseServer } from '../../lib/supabaseServer';
import { supabase } from '../../lib/supabase';
import { resolverAutor } from '../../lib/resolverAutor';

/**
 * Convierte strings tipo "1.234", "1234", "-5" a número entero seguro.
 *
 * 🔎 Por qué existe:
 *   - En la DB el stock de repuestos puede venir como string con puntos,
 *     o incluso con caracteres que no son dígitos.
 *   - Necesitamos operarlo como entero para restar cantidades.
 *
 * Ejemplos:
 *   parseIntSafe("1.234")   -> 1234
 *   parseIntSafe("-5")      -> -5
 *   parseIntSafe(undefined) -> 0
 */
function parseIntSafe(v?: string | null): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * ¿El "stock" de un repuesto representa un "servicio" (stock infinito)?
 *
 * 📌 Contexto:
 *   Hay repuestos que no son físicos (ej: mano de obra, servicio).
 *   En esos casos, en la columna "Stock" puede venir:
 *     - "∞"
 *     - "infinito", "infinite", "inf..." (cualquier cosa que empiece con 'inf')
 *     - palabras sin números tipo "servicio"
 *
 * Para esos repuestos NO se descuenta stock ni se los desactiva.
 */
function esServicioStock(s?: string | null): boolean {
  if (s == null) return false;
  const t = String(s).trim();
  // Regla:
  // - exactamente "∞"
  // - empieza con "inf" (ej. "infinito", "infinite")
  // - o es texto sin ningún dígito (ej. "servicio", "mano de obra", etc.)
  return t === '∞' || /^inf/i.test(t) || (t !== '' && !/\d/.test(t));
}

/**
 * Devuelve la fecha actual en formato YYYY-MM-DD.
 *
 * ✅ Uso:
 *   Se guarda en `fecha_de_reparacion` del ticket cuando se marca "Lista".
 */
function hoyAR(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Endpoint POST /api/maquinaLista?id={ticketId}
 *
 * 🛠 Qué hace (flujo completo):
 * 1. Lee el ticket por `id` (query param).
 * 2. Determina el técnico autenticado (`resolverAutor(locals)`).
 *    - Rechaza si no hay técnico válido o está inactivo.
 * 3. Busca el presupuesto más reciente asociado al ticket.
 * 4. Si hay presupuesto:
 *    - Lee items del presupuesto (`presupuesto_repuestos`).
 *    - Suma cantidades por repuesto.
 *    - Valida que no haya repuestos inactivos.
 *    - Descuenta stock en `repuestos_csv` (permite ir a negativo).
 *      • Si un repuesto queda con stock <= 0 se marca `activo=false`.
 *      • Repuestos "servicio" (stock infinito) no descuentan.
 *    - Marca si algún stock quedó negativo.
 * 5. Actualiza el ticket en `tickets_mian`:
 *      estado = "Lista"
 *      fecha_de_reparacion = hoy
 *      tecnico_id = el técnico actual
 * 6. Registra comentarios automáticos en `ticket_comentarios`:
 *      - "X marcó Máquina Lista"
 *      - Si hubo stock negativo, también avisa.
 * 7. Devuelve un redirect 303 a `/detalle/{ticketId}`.
 *
 * 🔐 Seguridad:
 * - Requiere un técnico activo (usa `resolverAutor` + `tecnicos`).
 * - Si no hay técnico, 401.
 * - Si técnico está inactivo, 403.
 *
 * 🔄 Efectos secundarios importantes:
 * - Descuenta stock real de repuestos.
 * - Puede dejar stock negativo.
 * - Puede desactivar (`activo=false`) repuestos con stock <= 0.
 * - Cambia estado del ticket.
 * - Inserta comentarios en el ticket.
 *
 * 📤 Respuestas:
 *   - 303 redirect → éxito
 *   - 400 → falta `id`
 *   - 401 → no se pudo determinar técnico
 *   - 403 → técnico inactivo
 *   - 409 → hay repuestos inactivos en el presupuesto
 *   - 500 → error interno en DB u otra falla
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // ============================================================
    // 0️⃣ Leer ID de ticket desde query (?id=123)
    // ============================================================
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Falta parámetro id' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    const ticketId = Number(id);

    // ============================================================
    // 1️⃣ Determinar técnico actual (autor de la acción)
    // ============================================================
    //
    // `resolverAutor(locals)` debería darnos algo tipo:
    //   { id, activo, ... }
    // Validamos que exista y esté activo.
    //
    const autor = await resolverAutor(locals);
    if (!autor) {
      return new Response(
        JSON.stringify({ error: 'No se pudo determinar el técnico actual' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    if (autor.activo === false) {
      return new Response(
        JSON.stringify({ error: 'El técnico actual no está activo' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Confirmamos que el técnico efectivamente existe en la tabla `tecnicos`
    const { data: tecRow, error: tecErr } = await supabase
      .from('tecnicos')
      .select('id, email, nombre, apellido')
      .eq('id', autor.id)
      .maybeSingle();

    if (tecErr || !tecRow) {
      return new Response(
        JSON.stringify({ error: 'No se pudo leer el técnico actual' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // ============================================================
    // 2️⃣ Buscar el presupuesto más reciente del ticket
    // ============================================================
    //
    // - Se busca en `presupuestos` por ticket_id.
    // - Se ordena desc por id y se toma el primero.
    //
    const { data: presu, error: presErr } = await supabaseServer
      .from('presupuestos')
      .select('id')
      .eq('ticket_id', ticketId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (presErr) {
      return new Response(
        JSON.stringify({ error: presErr.message }),
        { status: 500 }
      );
    }

    // Flag para saber si algún stock quedó negativo luego del descuento
    let huboNegativos = false;

    // ============================================================
    // 3️⃣ Si hay presupuesto, descontar stock según sus items
    // ============================================================
    //
    // Flujo:
    //   3.1. Traer todos los repuestos (repuesto_id, cantidad) del presupuesto.
    //   3.2. Sumar cantidades por repuesto (por si se repite).
    //   3.3. Traer info actual de cada repuesto (stock, activo).
    //   3.4. Evitar continuar si alguno está inactivo -> 409.
    //   3.5. Descontar stock:
    //        - Parsear stock actual (string → int).
    //        - Restar cantidad.
    //        - Permitir negativo (marca `huboNegativos=true`).
    //        - Si queda <=0 → marcar activo=false.
    //        - Timestamp de actualización.
    //
    if (presu?.id) {
      // 3.1 Items del presupuesto
      const { data: items, error: itemsErr } = await supabaseServer
        .from('presupuesto_repuestos')
        .select('repuesto_id, cantidad')
        .eq('presupuesto_id', presu.id);

      if (itemsErr) {
        return new Response(
          JSON.stringify({ error: itemsErr.message }),
          { status: 500 }
        );
      }

      if (Array.isArray(items) && items.length > 0) {
        // 3.2 Unificamos cantidades por repuesto_id
        //
        // Ejemplo:
        //   [{rid:10,cant:1},{rid:10,cant:2},{rid:12,cant:1}]
        // → agregados:
        //   10:3, 12:1
        //
        const agregados = new Map<number, number>();
        for (const it of items) {
          const rid = Number(it.repuesto_id);
          // Tomamos cantidad como mínimo 1
          const cant = Math.max(1, Number(it.cantidad) || 1);
          agregados.set(rid, (agregados.get(rid) ?? 0) + cant);
        }
        const ids = Array.from(agregados.keys());

        // 3.3 Traer metadata de todos los repuestos usados en este presupuesto
        const { data: repRows, error: repErr } = await supabaseServer
          .from('repuestos_csv')
          .select('id, "Stock", activo')
          .in('id', ids);

        if (repErr) {
          return new Response(
            JSON.stringify({ error: repErr.message }),
            { status: 500 }
          );
        }

        // Mapeamos id → { Stock, activo }
        const byId = new Map<number, { id: number; Stock: string | null; activo: boolean | null }>();
        for (const r of repRows ?? []) {
          byId.set(Number(r.id), {
            id: r.id,
            Stock: (r as any)['Stock'],
            activo: (r as any).activo,
          });
        }

        // 3.4 Validar que no haya repuestos inactivos.
        //
        // Defensa en profundidad:
        // - Si un repuesto está marcado inactivo en la DB,
        //   no deberíamos poder "usar" ese repuesto ahora
        //   al marcar Máquina Lista.
        //
        const inactivos: number[] = [];
        for (const rid of ids) {
          const meta = byId.get(rid);
          if (!meta) continue;
          if (meta.activo === false) inactivos.push(rid);
        }

        if (inactivos.length > 0) {
          return new Response(
            JSON.stringify({
              error: `Hay repuestos inactivos en el presupuesto: ${inactivos.join(', ')}. Quitalos o reactivalos antes de marcar Máquina Lista.`,
            }),
            {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        // 3.5 Descontar stock de cada repuesto usado
        //
        // Reglas de descuento:
        //   - Si es "servicio" (stock infinito) → NO descontar.
        //   - Si es físico:
        //       stockNuevo = stockActual - cant
        //       puede quedar negativo -> se marca `huboNegativos=true`
        //   - Si queda <= 0 → desactivar (activo=false)
        //
        for (const [rid, cant] of agregados) {
          const meta = byId.get(rid);
          if (!meta) continue;

          // ⛔ Repuestos de tipo "servicio": NO tocan stock ni activo
          if (esServicioStock(meta.Stock)) continue;

          const stockActual = parseIntSafe(meta.Stock);
          const nuevoStock = stockActual - cant; // puede ser negativo
          if (nuevoStock < 0) huboNegativos = true;

          await supabaseServer
            .from('repuestos_csv')
            .update({
              Stock: String(nuevoStock),
              activo: nuevoStock <= 0 ? false : meta.activo,
              actualizado_en: new Date().toISOString(),
            })
            .eq('id', rid);
        }
      }
    }

    // ============================================================
    // 4️⃣ Actualizar el ticket a estado 'Lista'
    // ============================================================
    //
    // - Se cambia estado a "Lista"
    // - Se setea la fecha de reparación (YYYY-MM-DD)
    // - Se guarda qué técnico lo marcó
    //
    const fechaHoy = hoyAR();
    const { error: updErr } = await supabase
      .from('tickets_mian')
      .update({
        estado: 'Lista',
        fecha_de_reparacion: fechaHoy,
        tecnico_id: tecRow.id,
      })
      .eq('id', ticketId);

    if (updErr) {
      return new Response(
        JSON.stringify({ error: updErr.message }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // ============================================================
    // 5️⃣ Agregar comentarios automáticos al ticket
    // ============================================================
    //
    // - Un comentario para dejar traza de quién marcó "Máquina Lista".
    // - Si hubo stock negativo, se deja advertencia adicional.
    //
    const email = String(tecRow.email || '').trim();
    const localPart = email.includes('@')
      ? email.split('@')[0]
      : (tecRow.nombre || 'tecnico');

    // Comentario base: "tecnicoX marcó Máquina Lista"
    try {
      await supabase.from('ticket_comentarios').insert({
        ticket_id: ticketId,
        autor_id: tecRow.id,
        mensaje: `${localPart} marcó Máquina Lista`,
      });
    } catch {
      // Best-effort: si falla comentar, no rompemos el flujo
    }

    // Comentario adicional si algún repuesto quedó con stock negativo
    if (huboNegativos) {
      try {
        await supabase.from('ticket_comentarios').insert({
          ticket_id: ticketId,
          autor_id: tecRow.id,
          mensaje:
            '⚠️ Atención: se marcaron repuestos con cantidad superior al stock disponible; el stock quedó negativo.',
        });
      } catch {
        // también best-effort
      }
    }

    // ============================================================
    // 6️⃣ Redirección final al detalle del ticket
    // ============================================================
    //
    // ✔ Comportamiento esperado por el front:
    //   después de marcar Máquina Lista, queremos ver el detalle del ticket.
    //
    return new Response(null, {
      status: 303,
      headers: { Location: `/detalle/${ticketId}` },
    });

  } catch (e: any) {
    // ============================================================
    // ❌ Error inesperado
    // ============================================================
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
