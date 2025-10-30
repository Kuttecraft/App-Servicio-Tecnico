// src/pages/api/actualizarPresupuesto.ts
import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';
import { resolverAutor, nombreAutor } from '../../lib/resolverAutor';

/**
 * normalizarMontoTexto()
 * --------------------------------------------------
 * Limpia y normaliza un monto ingresado por el usuario para guardarlo en DB.
 *
 * Qué hace:
 *  - Quita todo lo que no sea dígitos, coma, punto o signo "-".
 *    Ej: "$ 20.000,50" -> "20.000,50"
 *
 *  - Si el string tiene coma Y punto (ej "1.234,56" o "1,234.56"):
 *      • El ÚLTIMO separador encontrado se interpreta como separador decimal.
 *      • El otro se toma como separador de miles y se remueve.
 *      • Si el decimal final era coma, lo reemplaza por punto.
 *
 *  - Si sólo hay coma, asume que la coma es el decimal y la reemplaza por punto.
 *
 *  - Intenta convertirlo a Number:
 *      • Si es finito → devuelve el string limpio (ej "1234.5")
 *      • Si no es finito → devuelve el string igual igual (para debug)
 *
 *  - Si el input era vacío / null / undefined → devuelve null.
 *
 * Esto devuelve SIEMPRE un string final "amigable para Number / guardado"
 * o null si no había un monto real.
 */
function normalizarMontoTexto(input?: string | null): string | null {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;

  // Dejamos sólo dígitos, coma, punto y signo menos.
  s = s.replace(/[^0-9.,-]/g, '');

  const tienePunto = s.includes('.');
  const tieneComa = s.includes(',');

  if (tienePunto && tieneComa) {
    // Caso "mixto": "1.234,56" (Europa) o "1,234.56" (US)
    //
    // Tomamos el ÚLTIMO separador como el decimal real.
    // El otro lo consideramos miles (lo sacamos).
    const lastP = s.lastIndexOf('.');
    const lastC = s.lastIndexOf(',');

    const decimalSep = lastP > lastC ? '.' : ',';
    const milesSep = decimalSep === '.' ? ',' : '.';

    // Remover el separador de miles
    s = s.split(milesSep).join('');

    // Si el decimal que queda es coma, lo volvemos punto
    if (decimalSep === ',') {
      s = s.replace(',', '.');
    }
  } else if (tieneComa && !tienePunto) {
    // Sólo coma presente.
    // Interpretamos la coma como separador decimal.
    // "123,45" -> "123.45"
    s = s.replace(',', '.');
  }
  // Caso sólo punto → ya es aceptable para Number()

  const n = Number(s);
  if (!isFinite(n)) {
    // Si no podemos interpretarlo como número finito,
    // devolvemos el string igual, así el backend ve lo que llegó.
    return String(s || '');
  }

  return s;
}

/**
 * jsonError()
 * --------------------------------------------------
 * Helper para devolver errores consistentes en JSON,
 * con status HTTP personalizado.
 *
 * @param message Mensaje de error
 * @param status Código HTTP (default 500)
 */
function jsonError(message: string, status = 500) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * POST /api/actualizarPresupuesto
 * --------------------------------------------------
 * Este endpoint guarda / actualiza datos de presupuesto para un ticket.
 *
 * Flujo completo:
 *
 * 1. Lee el `id` del ticket desde:
 *    - query param (?id=123)
 *    - o params.id (por si usás /api/actualizarPresupuesto/[id].ts)
 *
 * 2. Lee el formData y construye `fields`.
 *
 * 3. Arma `datos` para la tabla `presupuestos`:
 *    - ticket_id
 *    - monto (normalizado con normalizarMontoTexto)
 *    - link_presupuesto
 *    - presupuesto_aprobado ("Si" | "No" | null)
 *    - garantia_activa
 *    - notas_administracion
 *
 *    Además maneja un tri-estado `solicitar_presupuesto` que va directo al ticket.
 *
 * 4. Verifica que el ticket exista en tickets_mian.
 *
 * 5. Upsert-like en presupuestos:
 *    - Busca filas previas de presupuestos del ticket.
 *    - Si ya existe alguna, actualiza la ÚLTIMA y borra duplicados viejos.
 *    - Si no existe ninguna, inserta una nueva.
 *    - Asegura `fecha_presupuesto` en la fila vigente.
 *
 * 6. Actualiza:
 *    - `solicitar_presupuesto` en tickets_mian (si vino en el form)
 *    - estado del ticket a "P. Enviado"
 *
 * 7. Registra un comentario automático del estilo:
 *      "<usuario> envió el presupuesto"
 *    usando resolverAutor() para saber quién es el técnico actual.
 *
 * 8. Redirige con 303 a /detalle/{ticketId}.
 *
 * Si algo falla en el camino → responde con jsonError().
 */
export const POST: APIRoute = async ({ request, params, locals }) => {
  // === 1) Validación de ID ===
  // Buscamos el id del ticket en el querystring (?id=123) o en params
  const url = new URL(request.url);
  const ticketId =
    url.searchParams.get('id') ||
    params?.id?.toString();

  if (!ticketId) {
    return jsonError('Falta el parámetro id (ticket_id)', 400);
  }

  const ticketIdNum = Number(ticketId);
  if (!Number.isFinite(ticketIdNum) || ticketIdNum <= 0) {
    return jsonError('id inválido', 400);
  }

  try {
    // === 2) Parseo del formData ===
    //
    // Pasamos formData a un objeto plano `fields` sólo con strings.
    // Ignoramos File/Blob porque acá sólo esperamos inputs de texto/select/textarea.
    //
    const formData = await request.formData();
    const fields: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === 'string') {
        fields[key] = value.trim();
      }
    });

    // === 3) Construir datos para la tabla presupuestos ===
    //
    // `datos` es lo que vamos a guardar o actualizar en la fila vigente del
    // presupuesto de este ticket.
    //
    // Nota: no seteamos fecha_presupuesto acá todavía, porque eso depende
    // de si hay fila existente o si creamos una nueva.
    //
    const datos: Record<string, any> = {
      ticket_id: ticketIdNum,
    };

    // Monto (normalizado como string estilo "1234.5")
    if ('monto' in fields) {
      datos.monto = normalizarMontoTexto(fields.monto);
    }

    // Link / URL del presupuesto (Drive, PDF, etc.)
    if ('link_presupuesto' in fields) {
      datos.link_presupuesto = fields.link_presupuesto || null;
    }

    // Aprobado? "Si" | "No" | null
    if ('presupuesto_aprobado' in fields) {
      datos.presupuesto_aprobado =
        fields.presupuesto_aprobado || null;
    }

    // Garantía activa? (puede venir "Si", "No", etc., depende de tu UI)
    if ('garantia_activa' in fields) {
      datos.garantia_activa =
        fields.garantia_activa || null;
    }

    // Notas internas para administración
    if ('notas_administracion' in fields) {
      datos.notas_administracion =
        fields.notas_administracion || null;
    }

    // Tri-estado del campo solicitar_presupuesto:
    // "Si" | "No" | null
    let solicitarPresuUpdate: 'Si' | 'No' | null = null;
    if ('solicitar_presupuesto' in fields) {
      const raw = fields.solicitar_presupuesto;
      solicitarPresuUpdate =
        raw === 'Si' ? 'Si' :
        raw === 'No' ? 'No' :
        null;
    }

    // === 4) Confirmar que el ticket exista ===
    //
    // En caso de invalid ID seguimos con un 404 para evitar
    // insertar basura huérfana.
    const { data: tk } = await supabase
      .from('tickets_mian')
      .select('id')
      .eq('id', ticketIdNum)
      .maybeSingle();

    if (!tk?.id) {
      return jsonError('Ticket inexistente', 404);
    }

    // === 5) Upsert "a mano" en la tabla presupuestos ===
    //
    // Estrategia:
    //  - Traemos todas las filas de presupuestos de ese ticket.
    //  - Si ya hay filas:
    //      → actualizamos la ÚLTIMA (la consideramos la "fuente de verdad")
    //      → si esa fila no tenía fecha_presupuesto, la seteamos a nowIso
    //      → borramos las filas viejas (deja sólo una viva)
    //  - Si NO hay filas:
    //      → insertamos una nueva con fecha_presupuesto = nowIso
    //
    const { data: rows, error: existErr } = await supabase
      .from('presupuestos')
      .select('id, fecha_presupuesto')
      .eq('ticket_id', ticketIdNum)
      .order('id', { ascending: true });

    if (existErr) {
      return jsonError(existErr.message, 500);
    }

    const nowIso = new Date().toISOString();
    let opErr: any = null;

    if (Array.isArray(rows) && rows.length > 0) {
      // Ya existía al menos un presupuesto
      const last = rows[rows.length - 1];

      // Si la fila actual no tiene fecha_presupuesto, la seteamos ahora.
      if (!last.fecha_presupuesto) {
        (datos as any).fecha_presupuesto = nowIso;
      }

      // Actualizamos esa última fila
      const { error } = await supabase
        .from('presupuestos')
        .update(datos)
        .eq('id', last.id);

      opErr = error;

      // Si salió bien y había más de una fila histórica,
      // limpiamos duplicados viejos dejando sólo la última.
      if (!opErr && rows.length > 1) {
        const idsViejos = rows
          .slice(0, rows.length - 1)
          .map((r: { id: number }) => r.id);

        await supabase
          .from('presupuestos')
          .delete()
          .in('id', idsViejos);
      }
    } else {
      // No había ninguna fila → insert nueva
      (datos as any).fecha_presupuesto = nowIso;

      const { error } = await supabase
        .from('presupuestos')
        .insert([datos]);

      opErr = error;
    }

    if (opErr) {
      return jsonError(opErr.message, 500);
    }

    // === 6) Guardar preferencia tri-estado en tickets_mian (si vino) ===
    //
    // Campo: solicitar_presupuesto
    // Valores posibles: "Si", "No", null
    //
    if ('solicitar_presupuesto' in fields) {
      const { error: updPrefErr } = await supabase
        .from('tickets_mian')
        .update({ solicitar_presupuesto: solicitarPresuUpdate })
        .eq('id', ticketIdNum);

      if (updPrefErr) {
        return jsonError(
          'No se pudo guardar la preferencia: ' + updPrefErr.message,
          500
        );
      }
    }

    // === 7) Forzar estado del ticket a "P. Enviado" ===
    //
    // Después de enviar/actualizar presupuesto, el estado del ticket
    // pasa siempre a "P. Enviado".
    const { error: updEstadoErr } = await supabase
      .from('tickets_mian')
      .update({ estado: 'P. Enviado' })
      .eq('id', ticketIdNum);

    if (updEstadoErr) {
      return jsonError(
        'No se pudo marcar P. Enviado: ' + updEstadoErr.message,
        500
      );
    }

    // === 8) Registrar comentario automático ===
    //
    // Ejemplo de comentario:
    //   "juan.perez envió el presupuesto"
    //
    // Para eso:
    //  - Determinamos autor técnico actual con resolverAutor(locals).
    //  - Sacamos el "alias" del usuario a partir del email en locals
    //    (antes de la @). Si no hay email, usamos nombreAutor(autor).
    //
    const autor = await resolverAutor(locals);
    if (!autor || autor.activo === false) {
      // No se pudo identificar un técnico válido
      return jsonError(
        'No se pudo determinar el autor para comentar el presupuesto',
        401
      );
    }

    const userEmail: string | null =
      (locals as any)?.user?.email ||
      (locals as any)?.perfil?.email ||
      (locals as any)?.usuario?.email ||
      null;

    const localPart =
      (typeof userEmail === 'string' && userEmail.includes('@'))
        ? userEmail.split('@')[0]
        : nombreAutor(autor); // fallback si no hay email claro

    const mensaje = `${localPart} envió el presupuesto`;

    const { error: comErr } = await supabase
      .from('ticket_comentarios')
      .insert({
        ticket_id: ticketIdNum,
        autor_id: autor.id,
        mensaje,
      });

    if (comErr) {
      return jsonError(
        'No se pudo crear el comentario: ' + comErr.message,
        500
      );
    }

    // === 9) Redirección final al detalle del ticket ===
    //
    // 303 "See Other" es ideal post-POST: le dice al navegador
    // que haga GET a la URL de detalle.
    return new Response(null, {
      status: 303,
      headers: {
        Location: `/detalle/${ticketIdNum}`,
      },
    });

  } catch (err: any) {
    // Cualquier error inesperado cae acá
    return jsonError(
      'Error inesperado: ' + (err?.message || String(err)),
      500
    );
  }
};
