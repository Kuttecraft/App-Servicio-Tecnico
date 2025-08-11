import { supabase } from '../../lib/supabase';

export async function GET() {
  // Busca el ticket numérico más grande (ignora nulls)
  const { data, error } = await supabase
    .from('tickets_mian')
    .select('ticket')
    .not('ticket', 'is', null)
    .order('ticket', { ascending: false })
    .limit(1)
    .maybeSingle();

  let sugerido = 1;

  if (!error && data) {
    const ticketNum = Number(data.ticket);
    if (!isNaN(ticketNum) && ticketNum > 0) {
      sugerido = ticketNum + 1;
    }
  }

  return new Response(JSON.stringify({ sugerido }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
