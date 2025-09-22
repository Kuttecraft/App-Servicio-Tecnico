import { supabase } from '../../lib/supabase';

function normalizarMontoTexto(input?: string | null): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  s = s.replace(/[^0-9.,-]/g, '');
  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');
  if (tienePunto && tieneComa) {
    const lastP = s.lastIndexOf('.');
    const lastC = s.lastIndexOf(',');
    const decimalSep = lastP > lastC ? '.' : ',';
    const milesSep = decimalSep === '.' ? ',' : '.';
    s = s.split(milesSep).join('');
    if (decimalSep === ',') s = s.replace(',', '.');
  } else if (tieneComa && !tienePunto) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  if (!isFinite(n)) return String(s || '');
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

  const formData = await req.formData();

  // Extraer y limpiar (NO usamos fecha_de_entrega del form)
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') fields[key] = value.trim();
  });

  // Resolver "medio_de_entrega" desde el select + (opcional) texto "otro".
  // También mantenemos compatibilidad con el campo legacy "medio_de_entrega" si llega.
  function resolverMedioEntrega(f: Record<string, string>): string | null {
    const sel = f.medio_de_entrega_select || '';
    const otro = f.medio_de_entrega_otro || '';
    if (sel === 'Otro') {
      return otro ? otro : null;
    }
    if (sel) return sel;
    // fallback legacy:
    return f.medio_de_entrega ? f.medio_de_entrega : null;
  }

  // delivery NO tiene direccion/localidad en el schema
  const baseDelivery: Record<string, any> = {
    cotizar_delivery:
      'cotizar_delivery' in fields
        ? (normalizarMontoTexto(fields.cotizar_delivery) ?? null)
        : null,
    informacion_adicional_delivery: fields.informacion_adicional_delivery || null,
    medio_de_entrega: resolverMedioEntrega(fields),
    forma_de_pago: fields.forma_de_pago || null,
    pagado: fields.pagado || null, // "true" | "false" | null
    ticket_id: parseInt(ticketId, 10),
  };

  const nuevaDireccion = fields.direccion || null;
  const nuevaLocalidad = fields.localidad || null;

  // Buscar TODAS las filas de delivery del ticket
  const { data: rows, error: selErr } = await supabase
    .from('delivery')
    .select('id, fecha_de_entrega')
    .eq('ticket_id', ticketId)
    .order('id', { ascending: true });

  if (selErr) {
    return new Response(JSON.stringify({ error: selErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const hoyYMD = new Date().toISOString().slice(0, 10);
  let error = null;

  if (Array.isArray(rows) && rows.length > 0) {
    // Usamos la ÚLTIMA fila como “fuente de verdad”
    const last = rows[rows.length - 1];

    const datos = {
      ...baseDelivery,
      fecha_de_entrega: last.fecha_de_entrega ?? hoyYMD,
    };

    ({ error } = await supabase
      .from('delivery')
      .update(datos)
      .eq('id', last.id));

    // (Opcional) limpiar duplicados viejos, si hubiera más de 1
    if (!error && rows.length > 1) {
      const idsViejos = rows.slice(0, rows.length - 1).map(r => r.id);
      await supabase.from('delivery').delete().in('id', idsViejos);
    }

  } else {
    // No existe ninguna fila: creamos una
    const datos = {
      ...baseDelivery,
      fecha_de_entrega: hoyYMD,
    };
    ({ error } = await supabase
      .from('delivery')
      .insert([datos]));
  }

  if (error) {
    return new Response(JSON.stringify({ error: (error as any).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Si el form trae direccion/localidad, actualizamos el cliente del ticket
  if (nuevaDireccion || nuevaLocalidad) {
    const { data: tkt, error: tErr } = await supabase
      .from('tickets_mian')
      .select('cliente_id')
      .eq('id', ticketId)
      .single();

    if (!tErr && tkt?.cliente_id) {
      const updateCliente: Record<string, any> = {};
      if (nuevaDireccion !== null) updateCliente.direccion = nuevaDireccion;
      if (nuevaLocalidad !== null) updateCliente.localidad = nuevaLocalidad;

      if (Object.keys(updateCliente).length > 0) {
        await supabase
          .from('cliente')
          .update(updateCliente)
          .eq('id', tkt.cliente_id);
      }
    }
  }

  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${ticketId}` },
  });
}
