import { supabase } from '../../lib/supabase';
import { Buffer } from 'node:buffer';

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

    const modelo      = String(form.get('modelo') ?? '').trim();
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
        if (error) return new Response(JSON.stringify({ error: 'No se pudo crear el cliente', supabase: error }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        clienteId = data!.id;
      }
    }

    // ===== Técnico (opcional) =====
    let tecnicoId: number | null = null;
    if (tecnicoNombre) {
      const { data } = await supabase.from('tecnicos').select('id').ilike('nombre', tecnicoNombre).limit(1).maybeSingle();
      if (data?.id) tecnicoId = data.id;
    }

    // ===== Impresora (fail-safe) =====
    let impresoraId: number | null = null;
    const hasModelo = !!modelo;
    const hasMaquina = !!maquina;
    const hasSerie = !!numeroSerie;

    if (hasSerie) {
      const { data: impFound } = await supabase
        .from('impresoras')
        .select('id')
        .eq('numero_de_serie', numeroSerie)
        .maybeSingle();
      if (impFound?.id) impresoraId = impFound.id;
    }

    if (!impresoraId && hasModelo) {
      if (hasSerie && hasMaquina) {
        const { data: impNew, error: impErr } = await supabase
          .from('impresoras')
          .insert({
            modelo,
            maquina,
            numero_de_serie: numeroSerie,
            tamano_de_boquilla: boquilla || null,
          })
          .select('id')
          .single();
        if (impErr) {
          return new Response(JSON.stringify({ error: 'No se pudo crear la impresora', supabase: impErr }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        impresoraId = impNew!.id;
      } else {
        const tempSerie = `TEMP-${Date.now()}-${Math.floor(Math.random()*900+100)}`;
        const maquinaSafe = hasMaquina ? maquina : 'Desconocida';

        const { data: byModel } = await supabase
          .from('impresoras')
          .select('id')
          .match({ modelo, maquina: maquinaSafe })
          .limit(1)
          .maybeSingle();

        if (byModel?.id) {
          impresoraId = byModel.id;
        } else {
          const { data: impNew2, error: impErr2 } = await supabase
            .from('impresoras')
            .insert({
              modelo,
              maquina: maquinaSafe,
              numero_de_serie: tempSerie,
              tamano_de_boquilla: boquilla || null,
            })
            .select('id')
            .single();
          if (impErr2) {
            return new Response(JSON.stringify({ error: 'No se pudo crear la impresora (fallback)', supabase: impErr2 }), { status: 500, headers: { 'Content-Type': 'application/json' } });
          }
          impresoraId = impNew2!.id;
        }
      }
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
