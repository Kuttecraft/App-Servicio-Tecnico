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
    const dniCuit     = String(form.get('dniCuit') ?? '').trim();
    const correo      = String(form.get('correo') ?? '').trim();
    const whatsapp    = String(form.get('whatsapp') ?? '').trim();

    // ✅ Solo "maquina" (modelo ya no se pide en el form)
    const maquina     = String(form.get('maquina') ?? '').trim();
    const numeroSerie = String(form.get('numeroSerie') ?? '').trim();
    const boquilla    = String(form.get('boquilla') ?? '').trim();

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

    // ===== Cliente =====
    let clienteId: number;
    {
      let found: { id: number } | null = null;

      if (dniCuit) {
        const { data } = await supabase.from('cliente').select('id').eq('dni_cuit', dniCuit).limit(1).maybeSingle();
        if (data) found = data;
      }
      if (!found) {
        const { data } = await supabase.from('cliente').select('id').ilike('cliente', clienteNombreCompleto).limit(1).maybeSingle();
        if (data) found = data;
      }
      if (found?.id) {
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

    // ===== Técnico (opcional) =====
    // Busca por nombre+apellido; si no existe, lo crea y usa su id.
    let tecnicoId: number | null = null;
    if (tecnicoNombre) {
      const { nombre: nTec, apellido: aTec } = partirNombreApellido(tecnicoNombre);

      // Intento de match flexible
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
        // No existe → crear técnico rápido. email es NOT NULL → usamos placeholder.
        const emailPlaceholder = `no-email+${Date.now()}@local`;
        const { data: tecNuevo, error: tecErr } = await supabase
          .from('tecnicos')
          .insert({
            nombre: nTec,
            apellido: aTec === '(sin apellido)' ? '' : aTec,
            email: emailPlaceholder,
            activo: true,
          })
          .select('id')
          .single();
        if (!tecErr && tecNuevo?.id) {
          tecnicoId = tecNuevo.id;
        }
      }
    }

    // ===== Impresora =====
    // Tu schema mantiene 'modelo NOT NULL' y 'maquina NOT NULL'.
    // Como ya no pedís "modelo" en el form, usamos un valor por defecto.
    const MODELO_DEFAULT = 'Generico';
    const MAQUINA_DEFAULT = maquina || 'Desconocida';

    let impresoraId: number | null = null;
    const hasSerie = !!numeroSerie;
    const hasMaquina = !!maquina;

    // 1) Intentar por número de serie
    if (hasSerie) {
      const { data: impFound } = await supabase
        .from('impresoras')
        .select('id')
        .eq('numero_de_serie', numeroSerie)
        .maybeSingle();
      if (impFound?.id) impresoraId = impFound.id;
    }

    // 2) Si no, intentar por combinación máquina + MODELO_DEFAULT
    if (!impresoraId && hasMaquina) {
      const { data: byCombo } = await supabase
        .from('impresoras')
        .select('id')
        .match({ maquina: MAQUINA_DEFAULT, modelo: MODELO_DEFAULT })
        .limit(1)
        .maybeSingle();
      if (byCombo?.id) impresoraId = byCombo.id;
    }

    // 3) Si tampoco, crear impresora
    if (!impresoraId) {
      const tempSerie = numeroSerie || `TEMP-${Date.now()}-${Math.floor(Math.random()*900+100)}`;
      const { data: impNew, error: impErr } = await supabase
        .from('impresoras')
        .insert({
          modelo: MODELO_DEFAULT,
          maquina: MAQUINA_DEFAULT,
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

    // ===== Insertar Ticket =====
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

    // ===== Subir imágenes (opcional) =====
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

    // ✅ Redirigir SIN 'ticket=' para que la página use el nuevo sugerido
    return redirect303(`/addTicket?ok=1`);
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Error inesperado al crear el ticket', exception: String(err?.message || err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
