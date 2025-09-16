import { supabase } from '../../lib/supabase';

function normalizarMontoTexto(input?: string | null): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Quitar todo menos dígitos, coma, punto y signo menos
  s = s.replace(/[^0-9.,-]/g, '');

  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');

  if (tienePunto && tieneComa) {
    // El separador decimal es el último que aparezca
    const lastP = s.lastIndexOf('.');
    const lastC = s.lastIndexOf(',');
    const decimalSep = lastP > lastC ? '.' : ',';
    const milesSep = decimalSep === '.' ? ',' : '.';

    s = s.split(milesSep).join(''); // quitar miles
    if (decimalSep === ',') s = s.replace(',', '.'); // dejar decimal como punto
  } else if (tieneComa && !tienePunto) {
    // Solo coma → usar coma como decimal
    s = s.replace(',', '.');
  } else {
    // Solo punto o solo dígitos → queda igual
  }

  // Validar número
  const n = Number(s);
  if (!isFinite(n)) return String(s || '');

  // Devolver string numérica estable (sin tocar cantidad de decimales)
  return s;
}

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
  const ticketIdNum = parseInt(ticketId, 10);
  if (!Number.isFinite(ticketIdNum) || ticketIdNum <= 0) {
    return new Response(JSON.stringify({ error: 'id inválido' }), {
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
  const datos: Record<string, any> = { ticket_id: ticketIdNum };

  if ('monto' in fields) {
    const montoNorm = normalizarMontoTexto(fields.monto);
    datos.monto = montoNorm; // guardamos el string normalizado
  }
  if ('link_presupuesto' in fields) datos.link_presupuesto = fields.link_presupuesto || null;
  if ('presupuesto_aprobado' in fields) datos.presupuesto_aprobado = fields.presupuesto_aprobado || null; // "Si" | "No" | null
  if ('garantia_activa' in fields) datos.garantia_activa = fields.garantia_activa || null;
  if ('notas_administracion' in fields) datos.notas_administracion = fields.notas_administracion || null;

  // Traer todas las filas del presupuesto del ticket
  const { data: rows, error: existErr } = await supabase
    .from('presupuestos')
    .select('id, fecha_presupuesto')
    .eq('ticket_id', ticketIdNum)
    .order('id', { ascending: true });

  if (existErr) {
    return new Response(JSON.stringify({ error: existErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nowIso = new Date().toISOString();
  let opErr: any = null;

  if (Array.isArray(rows) && rows.length > 0) {
    // Usamos la última fila como fuente de verdad
    const last = rows[rows.length - 1];
    if (!last.fecha_presupuesto) (datos as any).fecha_presupuesto = nowIso;

    const { error } = await supabase
      .from('presupuestos')
      .update(datos)
      .eq('id', last.id);
    opErr = error;

    // (Opcional) limpiar duplicados viejos
    if (!opErr && rows.length > 1) {
      const idsViejos = rows.slice(0, rows.length - 1).map(r => r.id);
      await supabase.from('presupuestos').delete().in('id', idsViejos);
    }
  } else {
    // No existía presupuesto → crear uno con fecha actual
    (datos as any).fecha_presupuesto = nowIso;
    const { error } = await supabase
      .from('presupuestos')
      .insert([datos]);
    opErr = error;
  }

  if (opErr) {
    return new Response(JSON.stringify({ error: opErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ✅ Marcar estado = "P. Enviado"
  const { error: updEstadoErr } = await supabase
    .from('tickets_mian')
    .update({ estado: 'P. Enviado' })
    .eq('id', ticketIdNum);

  if (updEstadoErr) {
    return new Response(JSON.stringify({ error: 'No se pudo marcar P. Enviado: ' + updEstadoErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Redirigir al detalle
  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${ticketIdNum}` },
  });
}
