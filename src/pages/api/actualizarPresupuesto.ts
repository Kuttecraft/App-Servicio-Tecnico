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

  // Solo incluimos lo que realmente vino en el form
  const datos: Record<string, any> = { ticket_id: parseInt(ticketId, 10) };
  if ('monto' in fields) datos.monto = fields.monto || null;
  if ('link_presupuesto' in fields) datos.link_presupuesto = fields.link_presupuesto || null;
  if ('presupuesto_aprobado' in fields) datos.presupuesto_aprobado = fields.presupuesto_aprobado || null; // "Si" | "No" | null
  if ('garantia_activa' in fields) datos.garantia_activa = fields.garantia_activa || null;
  if ('notas_administracion' in fields) datos.notas_administracion = fields.notas_administracion || null;

  // ¿Existe presupuesto?
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
    if (!existing.fecha_presupuesto) (datos as any).fecha_presupuesto = nowIso;

    ({ error } = await supabase
      .from('presupuestos')
      .update(datos)
      .eq('ticket_id', ticketId));
  } else {
    (datos as any).fecha_presupuesto = nowIso;

    ({ error } = await supabase
      .from('presupuestos')
      .insert([datos]));
  }

  if (error) {
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${ticketId}` },
  });
}
