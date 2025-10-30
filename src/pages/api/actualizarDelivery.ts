import { supabase } from '../../lib/supabase';

/**
 * normalizarMontoTexto()
 * --------------------------------------------------
 * Normaliza un monto tipeado por el usuario para poder guardarlo
 * de forma consistente en la base (por ejemplo en delivery.cotizar_delivery).
 *
 * Qué hace:
 *  - Limpia todo lo que no sea dígitos, coma, punto o signo "-".
 *    Ej: "$ 20.000,50" → "20.000,50"
 *
 *  - Si hay COMA y PUNTO (ej "1.234,56" o "1,234.56"):
 *      -> asume que el ÚLTIMO separador es el decimal.
 *      -> el otro se toma como miles y se elimina.
 *      -> cambia el decimal final a '.' para que sea parseable en JS/DB.
 *
 *  - Si sólo hay COMA:
 *      -> reemplaza coma por punto, asumiendo que es decimal.
 *
 *  - Devuelve:
 *      string "normalizado" (ej "1234.5") listo para guardar,
 *      o null si el input está vacío.
 *
 * Edge case:
 *  - Si al final Number(s) da NaN, devolvemos igualmente el string limpio
 *    (por ejemplo "----"). Eso evita tirar null silenciosamente y te deja
 *    debuggear qué llegó.
 *
 * @param input string | null | undefined
 * @returns string normalizado ("1234.5") o null si estaba vacío
 */
function normalizarMontoTexto(input?: string | null): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Permitimos sólo dígitos, coma, punto y signo menos
  s = s.replace(/[^0-9.,-]/g, '');

  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');

  if (tienePunto && tieneComa) {
    // Caso mixto: "1.234,56" (UE) o "1,234.56" (US)
    // Regla:
    //   - El último separador que aparece es el decimal real.
    //   - El otro es separador de miles → se elimina.
    const lastP = s.lastIndexOf('.');
    const lastC = s.lastIndexOf(',');
    const decimalSep = lastP > lastC ? '.' : ',';
    const milesSep = decimalSep === '.' ? ',' : '.';

    // Quitamos separadores de miles
    s = s.split(milesSep).join('');

    // Si decimal era coma, convertimos a punto para Number()
    if (decimalSep === ',') s = s.replace(',', '.');
  } else if (tieneComa && !tienePunto) {
    // Sólo coma → interpretamos coma como decimal
    // "123,45" → "123.45"
    s = s.replace(',', '.');
  }
  // Caso "sólo punto" no requiere cambio salvo quitar símbolos (ya hecho)

  const n = Number(s);
  if (!isFinite(n)) {
    // Si no se puede parsear a número, devolvemos el string limpio
    // para no perder lo que el usuario mandó.
    return String(s || '');
  }

  return s;
}

/**
 * Handler del método POST
 * --------------------------------------------------
 * Este endpoint procesa el form de actualización de datos de delivery
 * asociado a un ticket específico.
 *
 * Flujo:
 *  1. Lee `id` (el ticketId) del query string.
 *  2. Lee el formData enviado por el usuario.
 *  3. Construye un objeto `baseDelivery` con:
 *      - cotizar_delivery (normalizado con normalizarMontoTexto)
 *      - medio_de_entrega (resuelto según select/otro)
 *      - forma_de_pago
 *      - informacion_adicional_delivery
 *      - pagado
 *      - ticket_id
 *  4. Busca registros previos en la tabla `delivery` para ese ticket:
 *      - Si ya hay filas, actualiza la última, rellena fecha_de_entrega si faltaba
 *        y opcionalmente elimina duplicados viejos.
 *      - Si no hay filas, inserta una nueva.
 *  5. Si el form también incluía `direccion` / `localidad`, actualiza esos datos
 *     en la tabla `cliente` del ticket.
 *  6. Redirige (303) a /detalle/{ticketId}.
 *
 * Nota:
 * - No tomamos fecha_de_entrega del form directamente. El servidor decide la fecha.
 */
export async function POST(context: { request: Request }) {
  const req = context.request;

  // Obtenemos el ticketId desde el query param ?id=...
  // Ejemplo de URL esperada: /api/actualizarDelivery?id=123
  const url = new URL(req.url);
  const ticketId = url.searchParams.get('id');

  if (!ticketId) {
    return new Response(
      JSON.stringify({ error: 'Falta el parámetro id (ticket_id)' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Leemos todo el form enviado por el usuario
  const formData = await req.formData();

  // Pasamos formData a un diccionario plano { [key]: string }
  // Sólo guardamos valores string (ignoramos File / Blob).
  //
  // Tip explícito para evitar "implicitly has an 'any' type" en TS estricto.
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value.trim();
    }
  });

  /**
   * resolverMedioEntrega()
   * --------------------------------------------------
   * Reglas para guardar medio_de_entrega:
   * 1) Si el select (medio_de_entrega_select) valía "Otro",
   *    usamos el texto libre en medio_de_entrega_otro.
   * 2) Si el select trae una opción normal (Delivery / Taller),
   *    usamos ese valor.
   * 3) Fallback legacy: intentamos medio_de_entrega directo si vino.
   *
   * Devuelve string (el valor final) o null si no hay nada claro.
   *
   * @param f Diccionario de campos del form ya limpios
   */
  function resolverMedioEntrega(f: Record<string, string>): string | null {
    const sel = f.medio_de_entrega_select || '';
    const otro = f.medio_de_entrega_otro || '';

    if (sel === 'Otro') {
      return otro ? otro : null;
    }
    if (sel) {
      return sel;
    }

    // Fallback legacy: si por compatibilidad vieja sigue viniendo un campo
    // "medio_de_entrega" directo, lo usamos.
    return f.medio_de_entrega ? f.medio_de_entrega : null;
  }

  // Armamos objeto base para la tabla `delivery`.
  //
  // delivery NO tiene campos direccion/localidad en su schema, así que
  // esos campos van a ir más tarde a la tabla `cliente`.
  //
  // Tipamos baseDelivery como Record<string, any> porque tiene mezcla
  // de strings, nulls y numbers, y Supabase no siempre tiene tipos
  // generados acá explícitamente.
  const baseDelivery: Record<string, any> = {
    cotizar_delivery:
      'cotizar_delivery' in fields
        ? normalizarMontoTexto(fields.cotizar_delivery) ?? null
        : null,
    informacion_adicional_delivery:
      fields.informacion_adicional_delivery || null,
    medio_de_entrega: resolverMedioEntrega(fields),
    forma_de_pago: fields.forma_de_pago || null,
    pagado: fields.pagado || null, // puede ser "true", "false" o ""
    ticket_id: parseInt(ticketId, 10),
  };

  // Estos van a la tabla cliente más abajo (si existen)
  const nuevaDireccion = fields.direccion || null;
  const nuevaLocalidad = fields.localidad || null;

  // 1) Traemos todas las filas previas de delivery para este ticket.
  //    Suponemos que en la práctica debería haber 0 o 1, pero por si acaso
  //    puede haber múltiples históricos.
  //
  //    Seleccionamos sólo id y fecha_de_entrega porque son los que
  //    necesitamos para decidir qué actualizar/reusar.
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

  // Fecha actual en formato YYYY-MM-DD
  // Usada como fallback si la fila existente no tiene fecha_de_entrega.
  const hoyYMD = new Date().toISOString().slice(0, 10);

  let error: unknown = null;

  if (Array.isArray(rows) && rows.length > 0) {
    // Caso: ya existía al menos una fila de delivery para este ticket.
    // Vamos a tomar la ÚLTIMA fila como "fuente de verdad",
    // actualizarla con los nuevos datos y mantener/forzar fecha_de_entrega.

    const last = rows[rows.length - 1];

    const datos = {
      ...baseDelivery,
      fecha_de_entrega: last.fecha_de_entrega ?? hoyYMD,
    };

    ({ error } = await supabase
      .from('delivery')
      .update(datos)
      .eq('id', last.id));

    // Limpieza opcional:
    // Si había más de una fila histórica, borramos las más viejas.
    // Esto mantiene un único registro "vivo" por ticket.
    if (!error && rows.length > 1) {
      const idsViejos = rows
        .slice(0, rows.length - 1)
        .map((r: { id: number }) => r.id);

      await supabase
        .from('delivery')
        .delete()
        .in('id', idsViejos);
    }

  } else {
    // Caso: no hay ninguna fila de delivery asociada a este ticket.
    // Creamos una nueva con fecha_de_entrega = hoy.

    const datos = {
      ...baseDelivery,
      fecha_de_entrega: hoyYMD,
    };

    ({ error } = await supabase
      .from('delivery')
      .insert([datos]));
  }

  // Si hubo problema al insertar/actualizar delivery, devolvemos 500.
  if (error) {
    return new Response(
      JSON.stringify({ error: (error as any).message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // 2) Si el form incluía direccion/localidad,
  //    actualizamos los datos del cliente asociado al ticket.
  //
  //    Para eso primero necesitamos saber el cliente_id del ticket.
  if (nuevaDireccion || nuevaLocalidad) {
    const { data: tkt, error: tErr } = await supabase
      .from('tickets_mian')
      .select('cliente_id')
      .eq('id', ticketId)
      .single();

    if (!tErr && tkt?.cliente_id) {
      // Construimos el objeto con las columnas a actualizar
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

  // 3) Redirección "See Other" (303) al detalle del ticket actualizado.
  //    Esto permite que el navegador vaya a la vista del ticket después de guardar.
  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${ticketId}` },
  });
}
