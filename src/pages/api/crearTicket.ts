// src/pages/api/crearTicket.ts
import { supabase } from '../../lib/supabase';

/**
 * redirect303()
 * ------------------------------------------------------------------
 * Helper para redirigir después de un POST usando HTTP 303 (See Other).
 * Esto es importante porque:
 *   - Evita que el navegador reenvíe el mismo form si el usuario refresca.
 *   - Indica al browser que haga un GET a la nueva URL.
 */
function redirect303(location: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: location },
  });
}

/**
 * partirNombreApellido()
 * ------------------------------------------------------------------
 * Dado un string tipo "Juan Pérez García", devuelve:
 *   { nombre: "Juan", apellido: "Pérez García" }
 *
 * Reglas:
 * - Limpia espacios múltiples.
 * - Si hay una sola palabra ("Juan"), la toma como nombre
 *   y deja el apellido como "(sin apellido)".
 * - Devuelve siempre algo, nunca strings vacíos totales.
 *
 * Esto alimenta tanto la tabla `cliente` como la tabla `tecnicos`
 * cuando generamos filas nuevas.
 */
function partirNombreApellido(completo: string): {
  nombre: string;
  apellido: string;
} {
  const limpio = (completo || '').trim().replace(/\s+/g, ' ');
  if (!limpio) {
    return { nombre: 'Sin nombre', apellido: '(sin apellido)' };
  }

  const partes = limpio.split(' ');
  if (partes.length === 1) {
    // Solo una palabra → la tomamos como nombre
    return { nombre: partes[0], apellido: '(sin apellido)' };
  }

  const nombre = partes.shift() as string;
  const apellido = partes.join(' ') || '(sin apellido)';
  return { nombre, apellido };
}

/**
 * normalizarMime()
 * ------------------------------------------------------------------
 * Forzamos el MIME a image/webp para los uploads.
 * ¿Por qué?
 * - En el flujo del front estás convirtiendo imágenes a WebP antes de subirlas.
 * - Nos aseguramos de que al guardarlas en el bucket tengan contentType coherente.
 *
 * Si no hay archivo, devolvemos null.
 */
function normalizarMime(file: File | null): string | null {
  return file ? 'image/webp' : null;
}

/**
 * normalizarDniCuit()
 * ------------------------------------------------------------------
 * Intenta formatear DNI/CUIT de forma legible antes de guardar:
 *
 * - 7 dígitos   → X.XXX.XXX
 * - 8 dígitos   → XX.XXX.XXX
 * - 11 dígitos  → XX-XXXXXXXX-X  (formato CUIT/CUIL)
 *
 * Si no coincide con nada conocido, devolvemos el valor crudo.
 *
 * Nota: esto se guarda en la tabla `cliente` en el campo `dni_cuit`.
 * De esta forma el mismo cliente puede matchearse en el futuro.
 */
function normalizarDniCuit(input?: string | null): string | null {
  if (input == null) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  const digits = raw.replace(/\D+/g, '');

  if (digits.length === 7) {
    return `${digits[0]}.${digits.slice(1, 4)}.${digits.slice(4)}`;
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(
      10
    )}`;
  }

  // Si el formato es raro, lo guardamos igual como vino.
  return raw;
}

/**
 * Timezone de Buenos Aires.
 * Esto nos sirve para firmar el ticket con la fecha "real" local del taller,
 * sin depender del huso horario del server.
 */
const TZ_BA = 'America/Argentina/Buenos_Aires';

/**
 * hoyBA_MMDDYYYY()
 * ------------------------------------------------------------------
 * Devuelve la fecha de HOY en la zona horaria de Buenos Aires,
 * con el formato M/D/YYYY (sin ceros a la izquierda en mes/día).
 *
 * Ejemplo: "10/29/2025"
 *
 * Se usa para el campo `marca_temporal` en `tickets_mian`.
 * Ese campo termina siendo una referencia rápida tipo "fecha de ingreso".
 */
function hoyBA_MMDDYYYY(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ_BA,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date());
}

/**
 * POST /api/crearTicket
 * ------------------------------------------------------------------
 * Crea un ticket "desde cero".
 *
 * Flujo completo:
 *
 * 1. Leer datos del <form> enviado (multipart/form-data), incluyendo:
 *    - Datos del cliente (nombre, DNI/CUIT, WhatsApp, correo).
 *    - Datos del equipo/impresora (modelo, boquilla, n° de serie).
 *    - Estado inicial, comentarios del cliente, técnico asignado.
 *    - Número de ticket elegido.
 *    - Imágenes (principal, ticket, extra).
 *
 * 2. Cliente:
 *    - Busca cliente por DNI/CUIT.
 *    - Si no hay DNI/CUIT, busca por el nombre exacto (case-insensitive).
 *    - Si existe: actualiza datos nuevos (merge suave).
 *    - Si no existe: crea uno nuevo.
 *
 * 3. Técnico:
 *    - Busca técnico por nombre+apellido (ilike).
 *    - Si no existe: crea uno "placeholder" activo con un correo sintético.
 *
 * 4. Impresora:
 *    - Intenta matchear primero por número de serie.
 *    - Si no, intenta buscar por modelo/maquina.
 *    - Si tampoco: crea una impresora nueva.
 *    - Actualiza boquilla si cambió.
 *
 * 5. Ticket:
 *    - Inserta fila en `tickets_mian` con cliente_id, tecnico_id, impresora_id,
 *      estado, comentarios, etc.
 *
 * 6. Imágenes:
 *    - Sube hasta 3 imágenes al bucket "imagenes" de Supabase Storage.
 *    - Actualiza el ticket con las URLs públicas resultantes.
 *
 * 7. Devuelve redirect 303 a /addTicket?ok=1 si todo salió bien.
 *
 * Errores:
 *    - Si algo sale mal en cliente / impresora / ticket / upload,
 *      respondemos 400 o 500 con JSON explicando.
 */
export async function POST({ request }: { request: Request }) {
  try {
    // Leemos todos los campos enctype="multipart/form-data"
    const form = await request.formData();

    /* =========================================================
       1. DATOS DEL CLIENTE
       ========================================================= */
    const clienteNombreCompleto = String(form.get('cliente') ?? '').trim();

    // DNI/CUIT se normaliza para que podamos matchear al mismo cliente la próxima vez.
    const dniCuitRaw = String(form.get('dniCuit') ?? '').trim();
    const dniCuit = normalizarDniCuit(dniCuitRaw) || '';

    const correo = String(form.get('correo') ?? '').trim();
    const whatsapp = String(form.get('whatsapp') ?? '').trim();

    /* =========================================================
       2. DATOS DE IMPRESORA / EQUIPO
       ========================================================= */

    // modeloElegido: viene de un <select> con modelos conocidos
    // modeloOtroRaw: campo libre "Otra impresora / modelo manual"
    const modeloElegido = String(form.get('modelo') ?? '').trim();
    const modeloOtroRaw = String(form.get('modeloOtro') ?? '').trim();

    // Regla: si el usuario tipeó algo en "modeloOtro", usamos eso.
    const modeloForm = (
      modeloOtroRaw && modeloOtroRaw.length > 0
        ? modeloOtroRaw
        : modeloElegido
    ).trim();

    const numeroSerie = String(form.get('numeroSerie') ?? '').trim();

    // Boquilla:
    // Por seguridad sólo aceptamos valores "oficiales" conocidos.
    const opcionesBoquilla = new Set([
      '0.2mm',
      '0.3mm',
      '0.4mm',
      '0.5mm',
      '0.6mm',
      '0.8mm',
      '1mm',
    ]);
    const boquillaRaw = String(form.get('boquilla') ?? '').trim();
    const boquilla = opcionesBoquilla.has(boquillaRaw)
      ? boquillaRaw
      : '';

    /* =========================================================
       3. OTROS CAMPOS DEL TICKET
       ========================================================= */
    const tecnicoNombre = String(form.get('tecnico') ?? '').trim(); // Técnico asignado textual
    const estado = String(form.get('estado') ?? '').trim();         // Estado inicial (ej. "Nuevo")
    const comentarios = String(form.get('comentarios') ?? '').trim(); // Detalle del cliente
    const ticketRaw = form.get('ticket');
    const ticketNumero = ticketRaw ? Number(ticketRaw) : null;

    // Archivos (imágenes opcionales)
    const archivoImagen = (form.get('imagenArchivo') as File | null) ?? null;
    const archivoImagenTicket =
      (form.get('imagenTicketArchivo') as File | null) ?? null;
    const archivoImagenExtra =
      (form.get('imagenExtraArchivo') as File | null) ?? null;

    /* =========================================================
       4. VALIDACIONES BÁSICAS DEL FORM
       ========================================================= */
    if (!clienteNombreCompleto) {
      return new Response('Falta el nombre del cliente', {
        status: 400,
      });
    }

    if (
      !ticketNumero ||
      Number.isNaN(ticketNumero) ||
      ticketNumero < 1
    ) {
      return new Response('Número de ticket inválido', {
        status: 400,
      });
    }

    /* =========================================================
       5. CLIENTE: buscar existente o crear
       =========================================================
       Estrategia:
       - Intentar encontrar cliente existente:
         1) por dni_cuit normalizado
         2) por coincidencia exacta (case-insensitive) del campo `cliente`
            (nombre completo)
       - Si existe: actualizamos SOLO los campos nuevos diferentes.
       - Si no existe: creamos uno nuevo y tomamos su id.
    */
    let clienteId: number;
    {
      let found: { id: number } | null = null;
      let foundRow: any = null;

      // a) Buscar por DNI/CUIT si se proporcionó.
      if (dniCuit) {
        const { data } = await supabase
          .from('cliente')
          .select(
            'id, cliente, nombre, apellido, dni_cuit, whatsapp, correo_electronico'
          )
          .eq('dni_cuit', dniCuit)
          .limit(1)
          .maybeSingle();
        if (data) {
          found = { id: data.id };
          foundRow = data;
        }
      }

      // b) Si no lo encontramos por DNI/CUIT, buscamos por nombre completo
      //    usando ilike para que no sea case-sensitive.
      if (!found) {
        const { data } = await supabase
          .from('cliente')
          .select(
            'id, cliente, nombre, apellido, dni_cuit, whatsapp, correo_electronico'
          )
          .ilike('cliente', clienteNombreCompleto)
          .limit(1)
          .maybeSingle();
        if (data) {
          found = { id: data.id };
          foundRow = data;
        }
      }

      if (found?.id) {
        // Cliente EXISTENTE → mergeamos nuevos datos si cambiaron.
        const updatePayload: Record<string, any> = {};

        // Nombre completo del cliente
        if (
          clienteNombreCompleto &&
          clienteNombreCompleto !== foundRow.cliente
        ) {
          updatePayload.cliente = clienteNombreCompleto;
          const { nombre, apellido } =
            partirNombreApellido(clienteNombreCompleto);

          if (nombre && nombre !== foundRow.nombre) {
            updatePayload.nombre = nombre;
          }
          if (
            apellido &&
            apellido !== foundRow.apellido
          ) {
            updatePayload.apellido = apellido;
          }
        }

        // DNI/CUIT
        if (dniCuit && dniCuit !== (foundRow.dni_cuit || '')) {
          updatePayload.dni_cuit = dniCuit;
        }

        // Whatsapp
        if (
          whatsapp &&
          whatsapp !== (foundRow.whatsapp || '')
        ) {
          updatePayload.whatsapp = whatsapp;
        }

        // Correo electrónico
        if (
          correo &&
          correo !== (foundRow.correo_electronico || '')
        ) {
          updatePayload.correo_electronico = correo;
        }

        // Solo hacemos UPDATE si realmente hay algo que cambiar
        if (Object.keys(updatePayload).length > 0) {
          await supabase
            .from('cliente')
            .update(updatePayload)
            .eq('id', found.id);
        }

        clienteId = found.id;
      } else {
        // Cliente NUEVO → insert
        const { nombre, apellido } =
          partirNombreApellido(clienteNombreCompleto);

        const { data, error } = await supabase
          .from('cliente')
          .insert({
            cliente: clienteNombreCompleto,
            nombre,
            apellido,
            dni_cuit: dniCuit || null,
            whatsapp: whatsapp || null,
            correo_electronico: correo || null,
          })
          .select('id')
          .single();

        if (error) {
          return new Response(
            JSON.stringify({
              error: 'No se pudo crear el cliente',
              supabase: error,
            }),
            {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
              },
            }
          );
        }

        clienteId = data!.id;
      }
    }

    /* =========================================================
       6. TÉCNICO: buscar por nombre o crear placeholder
       =========================================================
       Estrategia:
       - Tomamos el campo libre "tecnico" del formulario.
       - Partimos en nombre / apellido.
       - Buscamos en la tabla `tecnicos` con un ilike.
       - Si no lo encontramos, creamos uno "placeholder" con
         un email sintético y activo=true.
    */
    let tecnicoId: number | null = null;

    if (tecnicoNombre) {
      const { nombre: nTec, apellido: aTec } =
        partirNombreApellido(tecnicoNombre);

      let tecMatch: { id: number } | null = null;

      if (aTec && aTec !== '(sin apellido)') {
        // Buscar por nombre Y apellido
        const { data } = await supabase
          .from('tecnicos')
          .select('id')
          .ilike('nombre', `%${nTec}%`)
          .ilike('apellido', `%${aTec}%`)
          .limit(1)
          .maybeSingle();
        if (data) tecMatch = data;
      } else {
        // Buscar solo por nombre
        const { data } = await supabase
          .from('tecnicos')
          .select('id')
          .ilike('nombre', `%${nTec}%`)
          .limit(1)
          .maybeSingle();
        if (data) tecMatch = data;
      }

      if (tecMatch?.id) {
        tecnicoId = tecMatch.id;
      } else {
        // No existe ese técnico → creamos uno genérico/placeholder.
        // Le inventamos un email único para cumplir con cualquier unique constraint.
        const emailPlaceholder = `no-email+${Date.now()}@local`;

        const { data: tecNuevo } = await supabase
          .from('tecnicos')
          .insert({
            nombre: nTec,
            apellido: aTec === '(sin apellido)' ? '' : aTec,
            email: emailPlaceholder,
            activo: true,
          })
          .select('id')
          .single();

        if (tecNuevo?.id) {
          tecnicoId = tecNuevo.id;
        }
      }
    }

    /* =========================================================
       7. IMPRESORA / EQUIPO
       =========================================================
       Intentamos vincular la impresora a partir de:
       1) número de serie
       2) modelo/maquina
       Si no existe, la creamos.
       También sincronizamos el tamaño de boquilla.
    */
    // En tu modelo actual, `modelo` y `maquina` suelen almacenar lo mismo.
    const MODELO = modeloForm || 'Generico';
    const MAQUINA = modeloForm || 'Desconocida';

    let impresoraId: number | null = null;

    const hasSerie = !!numeroSerie;
    const hasModelo = !!modeloForm;

    // 1) Buscar impresora por número_de_serie
    if (hasSerie) {
      const { data: impFound } = await supabase
        .from('impresoras')
        .select('id, tamano_de_boquilla')
        .eq('numero_de_serie', numeroSerie)
        .maybeSingle();

      if (impFound?.id) {
        impresoraId = impFound.id;

        // Si vino boquilla distinta, actualizamos
        if (
          boquilla &&
          boquilla !== (impFound.tamano_de_boquilla || null)
        ) {
          await supabase
            .from('impresoras')
            .update({ tamano_de_boquilla: boquilla })
            .eq('id', impresoraId);
        }
      }
    }

    // 2) Buscar impresora por combinación modelo/maquina si aún no la tenemos
    if (!impresoraId && hasModelo) {
      const { data: byCombo } = await supabase
        .from('impresoras')
        .select('id, tamano_de_boquilla')
        .match({ modelo: MODELO, maquina: MAQUINA })
        .limit(1)
        .maybeSingle();

      if (byCombo?.id) {
        impresoraId = byCombo.id;

        // Sincronizar boquilla si cambió
        if (
          boquilla &&
          boquilla !== (byCombo.tamano_de_boquilla || null)
        ) {
          await supabase
            .from('impresoras')
            .update({ tamano_de_boquilla: boquilla })
            .eq('id', impresoraId);
        }
      }
    }

    // 3) Crear impresora nueva si todavía no existe
    if (!impresoraId) {
      // Si el usuario no puso número de serie real, inventamos uno temporal único
      const tempSerie =
        numeroSerie ||
        `TEMP-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;

      const { data: impNew, error: impErr } = await supabase
        .from('impresoras')
        .insert({
          modelo: MODELO,
          maquina: MAQUINA,
          numero_de_serie: tempSerie,
          tamano_de_boquilla: boquilla || null,
        })
        .select('id')
        .single();

      if (impErr) {
        return new Response(
          JSON.stringify({
            error: 'No se pudo crear la impresora',
            supabase: impErr,
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      impresoraId = impNew!.id;
    }

    /* =========================================================
       8. CREAR EL TICKET EN tickets_mian
       =========================================================
       Campos que guardamos:
       - cliente_id
       - tecnico_id (puede ser null)
       - impresora_id (puede ser null si algo salió mal, pero en
         este flujo siempre deberíamos tenerla)
       - marca_temporal → fecha actual (M/D/YYYY) en horario Buenos Aires
       - ticket → el número de ticket que puso el usuario
       - notas_del_cliente → comentarios del cliente al ingresar
       - estado → estado inicial que seleccionaron
    */
    const marcaTemporal = hoyBA_MMDDYYYY(); // ej: "10/29/2025"

    const insertRow: Record<string, any> = {
      cliente_id: clienteId,
      tecnico_id: tecnicoId ?? null,
      impresora_id: impresoraId ?? null,
      marca_temporal: marcaTemporal,
      ticket: ticketNumero,
      notas_del_cliente: comentarios || null,
      estado: estado || null,
    };

    const { data: tInsert, error: tErr } = await supabase
      .from('tickets_mian')
      .insert([insertRow])
      .select('id')
      .single();

    if (tErr) {
      // algo falló creando el ticket base → devolvemos error
      return new Response(
        JSON.stringify({
          error: 'No se pudo crear el ticket',
          supabase: tErr,
          payload: insertRow,
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // ID interno real del ticket recién creado
    const nuevoId = tInsert!.id as number;

    /* =========================================================
       9. SUBIR IMÁGENES (opcional) A SUPABASE STORAGE
       =========================================================
       Tenemos hasta 3 imágenes posibles:
         - imagen principal
         - imagen_ticket (ej. foto del comprobante / ticket físico)
         - imagen_extra (fotos adicionales)

       Flujo:
       - Cada archivo se sube al bucket "imagenes".
       - Antes de subir intentamos hacer un remove() del path,
         para limpiar una posible versión vieja.
       - Obtenemos la URL pública y luego la guardamos en el ticket.
    */

    /**
     * subirYObtenerUrl()
     * ------------------------------------------------------------
     * Sube `file` al bucket `imagenes` con el nombre dado (por ej:
     *   "public/123.webp", "public/123_ticket.webp", etc.)
     *
     * Reglas:
     * - Máximo 5MB.
     * - Content-Type forzado a "image/webp".
     * - Subida con upsert=true.
     * - Devuelve la URL pública que genera Supabase.
     *
     * Si no hay archivo o está vacío, devuelve null.
     */
    const subirYObtenerUrl = async (
      file: File | null,
      nombreArchivo: string
    ): Promise<string | null> => {
      if (!file || (file as any).size <= 0) return null;

      const MAX_BYTES = 5 * 1024 * 1024; // 5MB
      if ((file as any).size > MAX_BYTES) {
        throw new Error(
          'La imagen supera el tamaño máximo permitido (5MB).'
        );
      }

      const mime = normalizarMime(file) || 'image/webp';

      // Intento de limpieza previa (no es crítico si falla)
      try {
        await supabase.storage
          .from('imagenes')
          .remove([nombreArchivo]);
      } catch {
        /* no-op */
      }

      // Subida/actualización de la imagen
      const { error: uploadError } = await supabase.storage
        .from('imagenes')
        .upload(nombreArchivo, file, {
          cacheControl: '3600',
          upsert: true,
          contentType: mime,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Obtenemos URL pública
      const { data: publicUrl } = await supabase.storage
        .from('imagenes')
        .getPublicUrl(nombreArchivo);

      return publicUrl.publicUrl as string;
    };

    // Subimos cada una de las imágenes (si existen)
    let imagenUrl: string | null = null;
    let imagenTicketUrl: string | null = null;
    let imagenExtraUrl: string | null = null;

    // Nota: cada subida se protege con try/catch individual
    // para que un fallo de imagen no bloquee todo el alta.
    try {
      imagenUrl = await subirYObtenerUrl(
        archivoImagen,
        `public/${nuevoId}.webp`
      );
    } catch {
      /* ignoramos error de imagen principal */
    }

    try {
      imagenTicketUrl = await subirYObtenerUrl(
        archivoImagenTicket,
        `public/${nuevoId}_ticket.webp`
      );
    } catch {
      /* ignoramos error imagen_ticket */
    }

    try {
      imagenExtraUrl = await subirYObtenerUrl(
        archivoImagenExtra,
        `public/${nuevoId}_extra.webp`
      );
    } catch {
      /* ignoramos error imagen_extra */
    }

    // Si al menos una imagen se subió con éxito, actualizamos la fila del ticket
    if (imagenUrl || imagenTicketUrl || imagenExtraUrl) {
      const updateImages: Record<string, any> = {};
      if (imagenUrl) updateImages.imagen = imagenUrl;
      if (imagenTicketUrl)
        updateImages.imagen_ticket = imagenTicketUrl;
      if (imagenExtraUrl)
        updateImages.imagen_extra = imagenExtraUrl;

      await supabase
        .from('tickets_mian')
        .update(updateImages)
        .eq('id', nuevoId);
    }

    /* =========================================================
       10. REFUERZO DNI/CUIT EN CLIENTE
       =========================================================
       Por las dudas: si vino dniCuit lo volvemos a setear en el cliente
       (idealmente ya se guardó arriba, pero esto asegura consistencia).
    */
    if (dniCuit) {
      await supabase
        .from('cliente')
        .update({ dni_cuit: dniCuit })
        .eq('id', clienteId);
    }

    /* =========================================================
       11. TODO OK → REDIRECT
       =========================================================
       Redirigimos al formulario principal con ok=1
       para que el front pueda mostrar un toast tipo "Ticket creado".
    */
    return redirect303(`/addTicket?ok=1`);
  } catch (err: any) {
    // Error inesperado que se escapó de la lógica normal
    return new Response(
      JSON.stringify({
        error: 'Error inesperado al crear el ticket',
        exception: String(err?.message || err),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
