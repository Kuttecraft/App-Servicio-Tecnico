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

  // Extraer y limpiar campos
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value.trim();
    }
  });

  // Estructura final con valores limpios
  const datosDelivery = {
    cotizar_delivery: fields.cotizar_delivery || null,
    informacion_adicional_delivery: fields.informacion_adicional_delivery || null,
    medio_de_entrega: fields.medio_de_entrega || null,
    fecha_de_entrega: fields.fecha_de_entrega || null,
    forma_de_pago: fields.forma_de_pago || null,
    pagado: fields.pagado || null,
    ticket_id: parseInt(ticketId, 10),
  };

  // Verificar si ya existe un registro de delivery
  const { data: existingDelivery } = await supabase
    .from('delivery')
    .select('id')
    .eq('ticket_id', ticketId)
    .maybeSingle();

  let error = null;

  if (existingDelivery) {
    // Si existe, actualizar
    ({ error } = await supabase
      .from('delivery')
      .update(datosDelivery)
      .eq('ticket_id', ticketId));
  } else {
    // Si no existe, insertar nuevo
    ({ error } = await supabase
      .from('delivery')
      .insert([datosDelivery]));
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
