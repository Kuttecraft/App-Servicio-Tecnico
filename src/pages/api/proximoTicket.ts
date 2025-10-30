// src/pages/api/proximoTicket.ts
import { supabase } from '../../lib/supabase';

/**
 * Endpoint GET /api/proximoTicket
 *
 * 🎫 Objetivo:
 *   Sugerir el próximo número de ticket a asignar.
 *
 * 🧠 Lógica:
 *   1. Busca en la tabla `tickets_mian` el valor más alto que exista en la columna `ticket`.
 *      - Ignora `ticket = null`.
 *   2. Convierte ese ticket máximo a número.
 *   3. Devuelve ese número + 1.
 *
 *   Si la tabla está vacía, o no hay datos válidos, o hay error → devuelve 1.
 *
 * 📤 Respuesta:
 * {
 *   "sugerido": 1234
 * }
 *
 * 🔎 Notas:
 * - `ticket` en la base puede estar guardado como texto o número, por eso se hace `Number(...)`.
 * - No escribe nada en la DB, solo calcula y responde.
 * - No valida permisos acá, eso debería pasar antes (middleware / ruta protegida si aplica).
 */
export async function GET() {
  // ────────────────────────────────────────────────
  // 1️⃣ Buscar el ticket más grande actualmente usado
  // ────────────────────────────────────────────────
  //
  //   SELECT ticket
  //   FROM tickets_mian
  //   WHERE ticket IS NOT NULL
  //   ORDER BY ticket DESC
  //   LIMIT 1;
  //
  // Usamos maybeSingle() porque esperamos 0 o 1 fila.
  //
  const { data, error } = await supabase
    .from('tickets_mian')
    .select('ticket')
    .not('ticket', 'is', null)
    .order('ticket', { ascending: false })
    .limit(1)
    .maybeSingle();

  // ────────────────────────────────────────────────
  // 2️⃣ Calcular sugerencia
  // ────────────────────────────────────────────────
  //
  // Valor por defecto si no hay registros válidos o hay error.
  //
  let sugerido = 1;

  // Si no hubo error y obtuvimos un `ticket` con valor numérico,
  // usamos ese valor+1 como sugerido.
  if (!error && data) {
    const ticketNum = Number(data.ticket);

    // Aceptamos solo números válidos y positivos
    if (!isNaN(ticketNum) && ticketNum > 0) {
      sugerido = ticketNum + 1;
    }
  }

  // ────────────────────────────────────────────────
  // 3️⃣ Responder JSON
  // ────────────────────────────────────────────────
  //
  // Ejemplo:
  //   { "sugerido": 1521 }
  //
  return new Response(
    JSON.stringify({ sugerido }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
