// src/pages/api/proximoTicket.ts
import { supabase } from '../../lib/supabase';

export async function GET() {
  // ────────────────────────────────────────────────
  // Este endpoint sugiere el próximo número de ticket.
  // La lógica es: buscar el ticket más grande ya usado
  // y devolver ese valor + 1.
  // ────────────────────────────────────────────────

  // 1) Buscar en la tabla `tickets_mian` el valor máximo de `ticket`
  //    - ignoramos los tickets nulos
  //    - ordenamos descendente y tomamos solo 1 fila
  const { data, error } = await supabase
    .from('tickets_mian')
    .select('ticket')
    .not('ticket', 'is', null)
    .order('ticket', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Valor sugerido por defecto
  let sugerido = 1;

  // 2) Si no hubo error y tenemos un ticket válido,
  //    lo convertimos a número y sumamos +1
  if (!error && data) {
    const ticketNum = Number(data.ticket);
    if (!isNaN(ticketNum) && ticketNum > 0) {
      sugerido = ticketNum + 1;
    }
  }

  // 3) Devolver la sugerencia como JSON
  return new Response(JSON.stringify({ sugerido }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
