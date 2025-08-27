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
    if (typeof value === 'string') fields[key] = value.trim();
  });

  const datos: Record<string, any> = {
    monto: fields.monto || null,
    link_presupuesto: fields.link_presupuesto || null,
    presupuesto_aprobado: fields.presupuesto_aprobado || null,
    garantia_activa: fields.garantia_activa || null,
    notas_administracion: fields.notas_administracion || null,
    ticket_id: parseInt(ticketId, 10),
  };

  // ¿Existe presupuesto para este ticket?
  const { data: existing, error: existErr } = await supabase
    .from('presupuestos')
    .select('id, fecha_presupuesto')
    .eq('ticket_id', ticketId)
    .maybeSingle();

  if (existErr) {
    return new Response(JSON.stringify({ error: existErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nowIso = new Date().toISOString();
  let error = null;

  if (existing) {
    // Si ya tenía fecha_presupuesto, la conservamos. Si no, la seteamos ahora.
    datos.fecha_presupuesto = existing.fecha_presupuesto ?? nowIso;

    ({ error } = await supabase
      .from('presupuestos')
      .update(datos)
      .eq('ticket_id', ticketId));
  } else {
    // Alta con fecha automática
    datos.fecha_presupuesto = nowIso;

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
