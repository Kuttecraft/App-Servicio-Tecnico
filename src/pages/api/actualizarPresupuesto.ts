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

  // Parseo y limpieza
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value.trim();
    }
  });

  const datos = {
    monto: fields.monto || null,
    link_presupuesto: fields.link_presupuesto || null,
    presupuesto_aprobado: fields.presupuesto_aprobado || null,
    garantia_activa: fields.garantia_activa || null,
    notas_administracion: fields.notas_administracion || null,
    ticket_id: parseInt(ticketId, 10),
  };

  // Verificar si ya existe presupuesto para el ticket
  const { data: existing } = await supabase
    .from('presupuestos')
    .select('id')
    .eq('ticket_id', ticketId)
    .maybeSingle();

  let error = null;

  if (existing) {
    // Actualizar
    ({ error } = await supabase
      .from('presupuestos')
      .update(datos)
      .eq('ticket_id', ticketId));
  } else {
    // Insertar
    ({ error } = await supabase
      .from('presupuestos')
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
