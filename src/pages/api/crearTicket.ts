import { supabase } from '../../lib/supabase';

function redirect303(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}

function partirNombreApellido(completo: string): { nombre: string; apellido: string } {
  const limpio = (completo || '').trim().replace(/\s+/g, ' ');
  if (!limpio) return { nombre: 'Sin nombre', apellido: '(sin apellido)' };
  const partes = limpio.split(' ');
  if (partes.length === 1) return { nombre: partes[0], apellido: '(sin apellido)' };
  const nombre = partes.shift() as string;
  const apellido = partes.join(' ') || '(sin apellido)';
  return { nombre, apellido };
}

function normalizarMime(file: File | null): string | null { return file ? 'image/webp' : null; }

/** Normaliza DNI/CUIT */
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

const TZ_BA = 'America/Argentina/Buenos_Aires';
function hoyBA_MMDDYYYY(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ_BA,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date());
}

export async function POST({ request }: { request: Request }) {
  try {
    const form = await request.formData();

    const clienteNombreCompleto = String(form.get('cliente') ?? '').trim();
    const dniCuitRaw  = String(form.get('dniCuit') ?? '').trim();
    const dniCuit     = normalizarDniCuit(dniCuitRaw) || '';
    const correo      = String(form.get('correo') ?? '').trim();
    const whatsapp    = String(form.get('whatsapp') ?? '').trim();

    // -------- Impresora (selector + "Otra (especificar)") --------
    const modeloElegido = String(form.get('modelo') ?? '').trim();      // valor del select
    const modeloOtroRaw = String(form.get('modeloOtro') ?? '').trim();  // texto libre
    // ⚠️ Preferimos SIEMPRE el texto libre si viene con contenido:
    const modeloForm    = (modeloOtroRaw && modeloOtroRaw.length > 0 ? modeloOtroRaw : modeloElegido).trim();

    const numeroSerie = String(form.get('numeroSerie') ?? '').trim();

    // Boquilla conocida (o vacío)
    const opcionesBoquilla = new Set(["0.2mm","0.3mm","0.4mm","0.5mm","0.6mm","0.8mm","1mm"]);
    const boquillaRaw = String(form.get('boquilla') ?? '').trim();
    const boquilla    = opcionesBoquilla.has(boquillaRaw) ? boquillaRaw : '';

    const tecnicoNombre = String(form.get('tecnico') ?? '').trim();
    const estado        = String(form.get('estado') ?? '').trim();
    const comentarios   = String(form.get('comentarios') ?? '').trim();
    const ticketRaw     = form.get('ticket');
    const ticketNumero  = ticketRaw ? Number(ticketRaw) : null;

    const archivoImagen       = (form.get('imagenArchivo') as File | null) ?? null;
    const archivoImagenTicket = (form.get('imagenTicketArchivo') as File | null) ?? null;
    const archivoImagenExtra  = (form.get('imagenExtraArchivo') as File | null) ?? null;

    if (!clienteNombreCompleto) return new Response('Falta el nombre del cliente', { status: 400 });
    if (!ticketNumero || Number.isNaN(ticketNumero) || ticketNumero < 1) {
      return new Response('Número de ticket inválido', { status: 400 });
    }

    /* ========== CLIENTE ========== */
    let clienteId: number;
    {
      let found: { id: number } | null = null;
      let foundRow: any = null;

      if (dniCuit) {
        const { data } = await supabase
          .from('cliente')
          .select('id, cliente, nombre, apellido, dni_cuit, whatsapp, correo_electronico')
          .eq('dni_cuit', dniCuit)
          .limit(1)
          .maybeSingle();
        if (data) { found = { id: data.id }; foundRow = data; }
      }

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

    /* ========== TÉCNICO ========== */
    let tecnicoId: number | null = null;
    if (tecnicoNombre) {
      const { nombre: nTec, apellido: aTec } = partirNombreApellido(tecnicoNombre);

      let tecMatch: { id: number } | null = null;
      if (aTec && aTec !== '(sin apellido)') {
        const { data } = await supabase
          .from('tecnicos')
          .select('id')
          .ilike('nombre', `%${nTec}%`)
          .ilike('apellido', `%${aTec}%`)
          .limit(1)
          .maybeSingle();
        if (data) tecMatch = data;
      } else {
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

    /* ========== IMPRESORA ========== */
    const MODELO  = modeloForm || 'Generico';
    const MAQUINA = modeloForm || 'Desconocida';

    let impresoraId: number | null = null;
    const hasSerie = !!numeroSerie;
    const hasModelo = !!modeloForm;

    // 1) Por número de serie
    if (hasSerie) {
      const { data: impFound } = await supabase
        .from('impresoras')
        .select('id, tamano_de_boquilla')
        .eq('numero_de_serie', numeroSerie)
        .maybeSingle();
      if (impFound?.id) {
        impresoraId = impFound.id;
        if (boquilla && boquilla !== (impFound.tamano_de_boquilla || null)) {
          await supabase.from('impresoras')
            .update({ tamano_de_boquilla: boquilla })
            .eq('id', impresoraId);
        }
      }
    }

    // 2) Por combinación modelo+maquina
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

    // 3) Crear impresora si no existe
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

    /* ========== TICKET ========== */
    const marcaTemporal = hoyBA_MMDDYYYY();
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

    /* ========== IMÁGENES opcionales ========== */
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

    let imagenUrl: string | null = null;
    let imagenTicketUrl: string | null = null;
    let imagenExtraUrl: string | null = null;

    try { imagenUrl = await subirYObtenerUrl(archivoImagen, `public/${nuevoId}.webp`); } catch {}
    try { imagenTicketUrl = await subirYObtenerUrl(archivoImagenTicket, `public/${nuevoId}_ticket.webp`); } catch {}
    try { imagenExtraUrl = await subirYObtenerUrl(archivoImagenExtra, `public/${nuevoId}_extra.webp`); } catch {}

    if (imagenUrl || imagenTicketUrl || imagenExtraUrl) {
      const updateImages: Record<string, any> = {};
      if (imagenUrl) updateImages.imagen = imagenUrl;
      if (imagenTicketUrl) updateImages.imagen_ticket = imagenTicketUrl;
      if (imagenExtraUrl) updateImages.imagen_extra = imagenExtraUrl;
      await supabase.from('tickets_mian').update(updateImages).eq('id', nuevoId);
    }

    if (dniCuit) {
      await supabase.from('cliente').update({ dni_cuit: dniCuit }).eq('id', clienteId);
    }

    return redirect303(`/addTicket?ok=1`);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Error inesperado al crear el ticket', exception: String(err?.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
