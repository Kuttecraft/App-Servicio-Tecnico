// src/pages/api/crearTicket.ts
import { supabase } from '../../lib/supabase';

/** Respuesta 303 (See Other) para redirigir a otra ruta. */
function redirect303(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}

/**
 * Separa un nombre completo en { nombre, apellido }.
 * - Normaliza espacios múltiples.
 * - Si solo hay una palabra, la toma como nombre y deja apellido “(sin apellido)”.
 */
function partirNombreApellido(completo: string): { nombre: string; apellido: string } {
  const limpio = (completo || '').trim().replace(/\s+/g, ' ');
  if (!limpio) return { nombre: 'Sin nombre', apellido: '(sin apellido)' };
  const partes = limpio.split(' ');
  if (partes.length === 1) return { nombre: partes[0], apellido: '(sin apellido)' };
  const nombre = partes.shift() as string;
  const apellido = partes.join(' ') || '(sin apellido)';
  return { nombre, apellido };
}

/** Devuelve un mime “estable” para imágenes subidas (forzamos webp). */
function normalizarMime(file: File | null): string | null { return file ? 'image/webp' : null; }

/**
 * Normaliza DNI/CUIT:
 * - 7 dígitos → X.XXX.XXX
 * - 8 dígitos → XX.XXX.XXX
 * - 11 dígitos → XX-XXXXXXXX-X
 * Si no matchea, devuelve el raw.
 */
function normalizarDniCuit(input?: string | null): string | null {
  if (input == null) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, '');
  if (digits.length === 7) return `${digits[0]}.${digits.slice(1,4)}.${digits.slice(4)}`;
  if (digits.length === 8) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5)}`;
  if (digits.length === 11) return `${digits.slice(0,2)}-${digits.slice(2,10)}-${digits.slice(10)}`;
  return raw;
}

/** Timezone de CABA para “marca temporal” del ticket. */
const TZ_BA = 'America/Argentina/Buenos_Aires';

/**
 * Devuelve la fecha de “hoy” en CABA formateada como M/D/YYYY (sin ceros a la izquierda).
 * Se usa para `marca_temporal`.
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
 * Handler POST para crear un ticket completo:
 * - Upsert de cliente (por DNI/CUIT o por coincidencia del nombre).
 * - Resolución/creación del técnico (si se especificó).
 * - Upsert/búsqueda/creación de impresora (por serie o modelo+máquina).
 * - Inserción del ticket y subida opcional de imágenes (principal/ticket/extra).
 * - Redirige con 303 a /addTicket?ok=1 en caso de éxito.
 */
export async function POST({ request }: { request: Request }) {
  try {
    // Leemos todos los campos del formulario (multipart/form-data)
    const form = await request.formData();

    // -------- Datos del cliente --------
    const clienteNombreCompleto = String(form.get('cliente') ?? '').trim();
    const dniCuitRaw  = String(form.get('dniCuit') ?? '').trim();
    const dniCuit     = normalizarDniCuit(dniCuitRaw) || '';
    const correo      = String(form.get('correo') ?? '').trim();
    const whatsapp    = String(form.get('whatsapp') ?? '').trim();

    // -------- Impresora (selector + “Otra (especificar)”) --------
    const modeloElegido = String(form.get('modelo') ?? '').trim();      // valor del select
    const modeloOtroRaw = String(form.get('modeloOtro') ?? '').trim();  // texto libre
    // ⚠️ Preferimos SIEMPRE el texto libre si viene con contenido.
    const modeloForm    = (modeloOtroRaw && modeloOtroRaw.length > 0 ? modeloOtroRaw : modeloElegido).trim();

    const numeroSerie = String(form.get('numeroSerie') ?? '').trim();

    // Boquilla (solo aceptamos valores de una lista blanca)
    const opcionesBoquilla = new Set(["0.2mm","0.3mm","0.4mm","0.5mm","0.6mm","0.8mm","1mm"]);
    const boquillaRaw = String(form.get('boquilla') ?? '').trim();
    const boquilla    = opcionesBoquilla.has(boquillaRaw) ? boquillaRaw : '';

    // -------- Otros campos --------
    const tecnicoNombre = String(form.get('tecnico') ?? '').trim();
    const estado        = String(form.get('estado') ?? '').trim();
    const comentarios   = String(form.get('comentarios') ?? '').trim();
    const ticketRaw     = form.get('ticket');
    const ticketNumero  = ticketRaw ? Number(ticketRaw) : null;

    // Archivos opcionales
    const archivoImagen       = (form.get('imagenArchivo') as File | null) ?? null;
    const archivoImagenTicket = (form.get('imagenTicketArchivo') as File | null) ?? null;
    const archivoImagenExtra  = (form.get('imagenExtraArchivo') as File | null) ?? null;

    // -------- Validaciones mínimas --------
    if (!clienteNombreCompleto) return new Response('Falta el nombre del cliente', { status: 400 });
    if (!ticketNumero || Number.isNaN(ticketNumero) || ticketNumero < 1) {
      return new Response('Número de ticket inválido', { status: 400 });
    }

    /* ========== CLIENTE (upsert por dni_cuit o nombre) ========== */
    let clienteId: number;
    {
      let found: { id: number } | null = null;
      let foundRow: any = null;

      // 1) Buscamos por DNI/CUIT (si vino)
      if (dniCuit) {
        const { data } = await supabase
          .from('cliente')
          .select('id, cliente, nombre, apellido, dni_cuit, whatsapp, correo_electronico')
          .eq('dni_cuit', dniCuit)
          .limit(1)
          .maybeSingle();
        if (data) { found = { id: data.id }; foundRow = data; }
      }

      // 2) Si no, buscamos por coincidencia exacta (case-insensitive) de “cliente” (nombre completo)
      if (!found) {
        const { data } = await supabase
          .from('cliente')
          .select('id, cliente, nombre, apellido, dni_cuit, whatsapp, correo_electronico')
          .ilike('cliente', clienteNombreCompleto)
          .limit(1)
          .maybeSingle();
        if (data) { found = { id: data.id }; foundRow = data; }
      }

      if (found?.id) {
        // Actualizamos solo los campos que hayan cambiado (merge no destructivo)
        const updatePayload: Record<string, any> = {};

        if (clienteNombreCompleto && clienteNombreCompleto !== foundRow.cliente) {
          updatePayload.cliente = clienteNombreCompleto;
          const { nombre, apellido } = partirNombreApellido(clienteNombreCompleto);
          if (nombre && nombre !== foundRow.nombre)   updatePayload.nombre = nombre;
          if (apellido && apellido !== foundRow.apellido) updatePayload.apellido = apellido;
        }

        if (dniCuit && dniCuit !== (foundRow.dni_cuit || '')) updatePayload.dni_cuit = dniCuit;
        if (whatsapp && whatsapp !== (foundRow.whatsapp || '')) updatePayload.whatsapp = whatsapp;
        if (correo && correo !== (foundRow.correo_electronico || '')) updatePayload.correo_electronico = correo;

        if (Object.keys(updatePayload).length > 0) {
          await supabase.from('cliente').update(updatePayload).eq('id', found.id);
        }
        clienteId = found.id;
      } else {
        // Creamos el cliente nuevo
        const { nombre, apellido } = partirNombreApellido(clienteNombreCompleto);
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
          return new Response(JSON.stringify({ error: 'No se pudo crear el cliente', supabase: error }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
          });
        }
        clienteId = data!.id;
      }
    }

    /* ========== TÉCNICO (resolver por nombre; crear placeholder si no existe) ========== */
    let tecnicoId: number | null = null;
    if (tecnicoNombre) {
      const { nombre: nTec, apellido: aTec } = partirNombreApellido(tecnicoNombre);

      let tecMatch: { id: number } | null = null;
      if (aTec && aTec !== '(sin apellido)') {
        // Buscamos por nombre y apellido (ilike con comodines)
        const { data } = await supabase
          .from('tecnicos')
          .select('id')
          .ilike('nombre', `%${nTec}%`)
          .ilike('apellido', `%${aTec}%`)
          .limit(1)
          .maybeSingle();
        if (data) tecMatch = data;
      } else {
        // Si no hay apellido, buscamos solo por nombre
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
        // Creamos técnico “placeholder” con email sintético y activo=true
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
        if (tecNuevo?.id) tecnicoId = tecNuevo.id;
      }
    }

    /* ========== IMPRESORA (buscar por serie o por modelo+máquina; si no, crear) ========== */
    // NOTA: en tu modelo, 'modelo' y 'maquina' suelen duplicarse con el mismo valor.
    const MODELO  = modeloForm || 'Generico';
    const MAQUINA = modeloForm || 'Desconocida';

    let impresoraId: number | null = null;
    const hasSerie = !!numeroSerie;
    const hasModelo = !!modeloForm;

    // 1) Intento por número de serie
    if (hasSerie) {
      const { data: impFound } = await supabase
        .from('impresoras')
        .select('id, tamano_de_boquilla')
        .eq('numero_de_serie', numeroSerie)
        .maybeSingle();
      if (impFound?.id) {
        impresoraId = impFound.id;
        // Si vino boquilla y cambió, la actualizamos
        if (boquilla && boquilla !== (impFound.tamano_de_boquilla || null)) {
          await supabase.from('impresoras')
            .update({ tamano_de_boquilla: boquilla })
            .eq('id', impresoraId);
        }
      }
    }

    // 2) Intento por combinación (modelo + maquina)
    if (!impresoraId && hasModelo) {
      const { data: byCombo } = await supabase
        .from('impresoras')
        .select('id, tamano_de_boquilla')
        .match({ modelo: MODELO, maquina: MAQUINA })
        .limit(1)
        .maybeSingle();
      if (byCombo?.id) {
        impresoraId = byCombo.id;
        if (boquilla && boquilla !== (byCombo.tamano_de_boquilla || null)) {
          await supabase.from('impresoras')
            .update({ tamano_de_boquilla: boquilla })
            .eq('id', impresoraId);
        }
      }
    }

    // 3) Si no existe, creamos una nueva impresora
    if (!impresoraId) {
      const tempSerie = numeroSerie || `TEMP-${Date.now()}-${Math.floor(Math.random()*900+100)}`;
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
        return new Response(JSON.stringify({ error: 'No se pudo crear la impresora', supabase: impErr }), {
          status: 500, headers: { 'Content-Type': 'application/json' }
        });
      }
      impresoraId = impNew!.id;
    }

    /* ========== TICKET (insert principal) ========== */
    const marcaTemporal = hoyBA_MMDDYYYY(); // guardamos como M/D/YYYY
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
      return new Response(JSON.stringify({ error: 'No se pudo crear el ticket', supabase: tErr, payload: insertRow }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const nuevoId = tInsert!.id as number;

    /* ========== IMÁGENES opcionales (subir a Storage y vincular URLs) ========== */
    /**
     * Sube una imagen al bucket 'imagenes' (ruta `nombreArchivo`) y devuelve URL pública.
     * - Valida tamaño máx 5MB.
     * - Fuerza contentType webp (o derivado de normalizarMime).
     * - Hace remove previo “por las dudas” para evitar duplicados obsoletos.
     */
    const subirYObtenerUrl = async (file: File | null, nombreArchivo: string) => {
      if (!file || (file as any).size <= 0) return null;
      const MAX_BYTES = 5 * 1024 * 1024;
      if ((file as any).size > MAX_BYTES) throw new Error('La imagen supera el tamaño máximo permitido (5MB).');
      const mime = normalizarMime(file) || 'image/webp';

      try { await supabase.storage.from('imagenes').remove([nombreArchivo]); } catch {}
      const { error: uploadError } = await supabase.storage.from('imagenes').upload(nombreArchivo, file, {
        cacheControl: '3600', upsert: true, contentType: mime,
      });
      if (uploadError) throw new Error(uploadError.message);

      const { data: publicUrl } = await supabase.storage.from('imagenes').getPublicUrl(nombreArchivo);
      return publicUrl.publicUrl as string;
    };

    // Subimos 3 variantes opcionales y colectamos sus URLs si están disponibles
    let imagenUrl: string | null = null;
    let imagenTicketUrl: string | null = null;
    let imagenExtraUrl: string | null = null;

    try { imagenUrl = await subirYObtenerUrl(archivoImagen, `public/${nuevoId}.webp`); } catch {}
    try { imagenTicketUrl = await subirYObtenerUrl(archivoImagenTicket, `public/${nuevoId}_ticket.webp`); } catch {}
    try { imagenExtraUrl = await subirYObtenerUrl(archivoImagenExtra, `public/${nuevoId}_extra.webp`); } catch {}

    // Si hay al menos una URL, actualizamos la fila del ticket con los campos correspondientes
    if (imagenUrl || imagenTicketUrl || imagenExtraUrl) {
      const updateImages: Record<string, any> = {};
      if (imagenUrl) updateImages.imagen = imagenUrl;
      if (imagenTicketUrl) updateImages.imagen_ticket = imagenTicketUrl;
      if (imagenExtraUrl) updateImages.imagen_extra = imagenExtraUrl;
      await supabase.from('tickets_mian').update(updateImages).eq('id', nuevoId);
    }

    // Redundancia: si vino DNI/CUIT, nos aseguramos de persistirlo en el cliente
    if (dniCuit) {
      await supabase.from('cliente').update({ dni_cuit: dniCuit }).eq('id', clienteId);
    }

    // Éxito → redirigimos al formulario con bandera ok=1
    return redirect303(`/addTicket?ok=1`);
  } catch (err: any) {
    // Fallback genérico: devolvemos JSON con mensaje y exception
    return new Response(
      JSON.stringify({ error: 'Error inesperado al crear el ticket', exception: String(err?.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
