import { supabase } from '../../lib/supabase';

export async function POST(context: { request: Request }) {
  const req = context.request;
  const url = new URL(req.url);
  const ticketId = url.searchParams.get('id');

  if (!ticketId) {
    return new Response(JSON.stringify({ error: 'Falta el parámetro id (ticket_id)' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const formData = await req.formData();

  // Extraer y limpiar (NO usamos fecha_de_entrega del form)
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') fields[key] = value.trim();
  });

  const base: Record<string, any> = {
    cotizar_delivery: fields.cotizar_delivery || null,
    informacion_adicional_delivery: fields.informacion_adicional_delivery || null,
    medio_de_entrega: fields.medio_de_entrega || null,
    forma_de_pago: fields.forma_de_pago || null,
    pagado: fields.pagado || null,  // "true" | "false" | null
    ticket_id: parseInt(ticketId, 10),
  };

  // ¿Existe delivery?
  const { data: existing, error: selErr } = await supabase
    .from('delivery')
    .select('id, fecha_de_entrega')
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (selErr) {
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Guardar SOLO fecha (YYYY-MM-DD)
  const hoyYMD = new Date().toISOString().slice(0, 10);
  let error = null;

  if (existing) {
    const datos = {
      ...base,
      fecha_de_entrega: existing.fecha_de_entrega ?? hoyYMD,
    };
    ({ error } = await supabase
      .from('delivery')
      .update(datos)
      .eq('ticket_id', ticketId));
  } else {
    const datos = {
      ...base,
      fecha_de_entrega: hoyYMD,
    };
    ({ error } = await supabase
      .from('delivery')
      .insert([datos]));
  }

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${ticketId}` },
  });
}
