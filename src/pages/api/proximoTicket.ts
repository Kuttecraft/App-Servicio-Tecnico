import { supabase } from '../../lib/supabase';

export async function GET() {
  // Buscar el ticket de mayor valor (NO null)
  const { data, error } = await supabase
    .from('TestImpresoras')
    .select('ticket')
    .not('ticket', 'is', null)
    .order('ticket', { ascending: false }) // DESCENDENTE: el más alto primero
    .limit(1)
    .maybeSingle();

  let sugerido = 1;
  let ticketEncontrado = null;
  if (data && typeof data.ticket === "number" && !isNaN(data.ticket)) {
    ticketEncontrado = data.ticket;
    sugerido = ticketEncontrado + 1;
  }

  // === Zona de test/debug: descomentá para ver logs ===
  // console.log(
  //   `[DEBUG proximoTicket] Ticket más grande encontrado: ${ticketEncontrado !== null ? ticketEncontrado : 'NINGUNO'} | Sugerido: ${sugerido}`,
  //   { data, error }
  // );
  // === Fin zona de test/debug ===

  return new Response(JSON.stringify({ sugerido }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
