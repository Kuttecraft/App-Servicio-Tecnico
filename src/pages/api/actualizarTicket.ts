import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/** Normaliza a YYYY-MM-DD desde ISO, YYYY/MM/DD, MM/DD/YYYY o DD/MM/YYYY. */
function normDate(value?: string | null): string | null {
  if (!value) return null;
  const sRaw = value.trim();
  if (!sRaw || sRaw.toLowerCase() === 'null' || sRaw.toLowerCase() === 'undefined') return null;

  const s = sRaw.split('T')[0].split(' ')[0];

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;

  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (m) {
    const a = parseInt(m[1],10), b = parseInt(m[2],10), yyyy = m[3];
    let dd:number, mm:number;
    if (b > 12 && a <= 12) { mm = a; dd = b; }
    else if (a > 12 && b <= 12) { dd = a; mm = b; }
    else { mm = a; dd = b; }
    return `${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  }

  const d = new Date(sRaw);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  try {
    const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
    const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);

    // ---------- Obtener ID robustamente ----------
    const formData = await request.formData();
    let id: string | undefined;
    for (const k of ['ticketId', 'id', 'ticket', 'ticket_id']) {
      const v = formData.get(k);
      if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'undefined') {
        id = v.trim();
        break;
      }
    }
    if (!id && params?.id) id = String(params.id).trim();
    if (!id) {
      const u = new URL(request.url);
      const qid = u.searchParams.get('id');
      if (qid && qid.trim()) id = qid.trim();
    }
    if (!id) {
      const ref = request.headers.get('referer') || request.headers.get('Referrer') || '';
      const m = ref.match(/\/editar\/(\d+)/);
      if (m && m[1]) id = m[1];
    }
    if (!id) return jsonError('ID no proporcionado', 400);

    const idNum = Number(id);
    if (!Number.isFinite(idNum) || idNum <= 0) return jsonError(`ID inválido: ${id}`, 400);

    // ---------- Archivos y flags imagen ----------
    const imagenArchivo       = formData.get('imagenArchivo') as File | null;
    const borrarImagen        = (formData.get('borrarImagen') as string | null) || 'false';
    const imagenTicketArchivo = formData.get('imagenTicketArchivo') as File | null;
    const borrarImagenTicket  = (formData.get('borrarImagenTicket') as string | null) || 'false';
    const imagenExtraArchivo  = formData.get('imagenExtraArchivo') as File | null;
    const borrarImagenExtra   = (formData.get('borrarImagenExtra') as string | null) || 'false';

    // ---------- Campos de texto ----------
    const fields: Record<string, string> = {};
    formData.forEach((val, key) => { if (typeof val === 'string') fields[key] = val.trim(); });

    // ---------- Leer fila actual ----------
    const { data: tRow, error: tErr } = await supabase
      .from('tickets_mian')
      .select('cliente_id, impresora_id, marca_temporal, fecha_de_reparacion, estado, maquina_reparada')
      .eq('id', idNum)
      .single();
    if (tErr || !tRow) return jsonError(`No se pudo obtener el ticket (id=${String(id)})`, 500);

    // ========== Ticket principal ==========
    const fechaFormularioNorm = normDate(fields.fechaFormulario);
    const fechaListoNorm      = normDate(fields.timestampListo);

    const estadoForm = (fields.estado ?? '').trim();

    const datosTicketsMian: Record<string, any> = {
      estado: estadoForm || tRow.estado || null,
      marca_temporal: (fechaFormularioNorm ?? tRow.marca_temporal) || null,
      fecha_de_reparacion: (fechaListoNorm ?? tRow.fecha_de_reparacion) || null,
      notas_del_tecnico: fields.notaTecnico || null,
      // 👇 clave: en Editar el input se llama "maquina" (label Máquina),
      // y ese valor es el que representa al "modelo".
      maquina_reparada: fields.maquina || fields.modelo || tRow.maquina_reparada || null,
    };

    // ========== Cliente (merge: solo lo que venga no vacío) ==========
    if (tRow.cliente_id) {
      const updateCliente: Record<string, any> = {};
      if (typeof fields.dniCuit === 'string' && fields.dniCuit !== '') updateCliente.dni_cuit = fields.dniCuit;
      if (typeof fields.whatsapp === 'string' && fields.whatsapp !== '') updateCliente.whatsapp = fields.whatsapp;
      if (typeof fields.correo === 'string' && fields.correo !== '') updateCliente.correo_electronico = fields.correo;
      if (typeof fields.comentarios === 'string') updateCliente.comentarios = fields.comentarios; // puede ser vacío a propósito

      if (Object.keys(updateCliente).length > 0) {
        const { error } = await supabase.from('cliente').update(updateCliente).eq('id', tRow.cliente_id);
        if (error) return jsonError('Error al actualizar cliente: ' + error.message, 500);
      }
    }

    // ========== Impresora ==========
    const maquina      = fields.maquina || '';       // ← este es el “modelo” real desde UI
    const numeroSerie  = fields.numeroSerie || '';
    const boquilla     = fields.boquilla || '';

    if (maquina || numeroSerie || boquilla) {
      if (tRow.impresora_id) {
        const payloadImpresora: any = {};
        // Importante: el input "maquina" alimenta modelo y maquina
        if (maquina) {
          payloadImpresora.modelo  = maquina;
          payloadImpresora.maquina = maquina;
        }
        if (numeroSerie) payloadImpresora.numero_de_serie = numeroSerie;
        payloadImpresora.tamano_de_boquilla = boquilla || null;

        const { error } = await supabase
          .from('impresoras')
          .update(payloadImpresora)
          .eq('id', tRow.impresora_id);
        if (error) return jsonError('Error al actualizar impresora: ' + error.message, 500);
      } else {
        // crear y vincular
        let impresoraId: number | null = null;

        if (numeroSerie) {
          const { data: impFound } = await supabase
            .from('impresoras')
            .select('id')
            .eq('numero_de_serie', numeroSerie)
            .maybeSingle();
          if (impFound?.id) impresoraId = impFound.id;
        }

        if (!impresoraId && (maquina || numeroSerie || boquilla)) {
          const maquinaSafe = maquina || 'Desconocida';
          const serieSafe   = numeroSerie || `TEMP-${Date.now()}-${Math.floor(Math.random()*900+100)}`;
          const { data: byCombo } = await supabase
            .from('impresoras')
            .select('id')
            .match({ modelo: maquinaSafe, maquina: maquinaSafe })
            .limit(1)
            .maybeSingle();

          if (byCombo?.id) {
            impresoraId = byCombo.id;
          } else {
            const { data: impNew, error: impErr } = await supabase
              .from('impresoras')
              .insert({
                modelo: maquinaSafe,
                maquina: maquinaSafe,
                numero_de_serie: serieSafe,
                tamano_de_boquilla: boquilla || null,
              })
              .select('id')
              .single();
            if (impErr) return jsonError('No se pudo crear la impresora: ' + impErr.message, 500);
            impresoraId = impNew!.id;
          }
        }

        if (impresoraId) {
          const { error: linkErr } = await supabase
            .from('tickets_mian')
            .update({ impresora_id: impresoraId })
            .eq('id', idNum);
          if (linkErr) return jsonError('No se pudo vincular la impresora al ticket: ' + linkErr.message, 500);
        }
      }
    }

    // ========== Delivery ==========
    const deliveryUpd: any = {
      pagado: fields.cobrado === 'true' ? 'true' : 'false',
    };
    if (isAdmin) {
      if (typeof fields.costoDelivery === 'string') deliveryUpd.cotizar_delivery = fields.costoDelivery || null;
      if (typeof fields.infoDelivery === 'string')  deliveryUpd.informacion_adicional_delivery = fields.infoDelivery || null;
    }

    {
      const { data: updRows, error: updErr } = await supabase
        .from('delivery')
        .update(deliveryUpd)
        .eq('ticket_id', idNum)
        .select('id');

      if (updErr) return jsonError('Error al actualizar delivery: ' + updErr.message, 500);

      const affected = Array.isArray(updRows) ? updRows.length : (updRows ? 1 : 0);
      if (affected === 0) {
        const insPayload: any = { ticket_id: idNum, ...deliveryUpd };
        const { error: insErr } = await supabase.from('delivery').insert(insPayload);
        if (insErr) return jsonError('Error al crear delivery: ' + insErr.message, 500);
      }
    }

    // ========== Presupuesto ==========
    const fechaPresuNorm = normDate(fields.timestampPresupuesto); // si no viene, no se pisa
    const presUpdate: any = {
      monto: isNaN(parseFloat(fields.monto)) ? '0' : String(parseFloat(fields.monto)),
      link_presupuesto: fields.linkPresupuesto || null,
      cubre_garantia: (fields.cubre_garantia ?? fields.cubreGarantia) === 'true' ? 'true' : 'false',
    };
    if (fechaPresuNorm) presUpdate.fecha_presupuesto = fechaPresuNorm;

    {
      const { data: updRows, error: updErr } = await supabase
        .from('presupuestos')
        .update(presUpdate)
        .eq('ticket_id', idNum)
        .select('id');

      if (updErr) return jsonError('Error al actualizar presupuesto: ' + updErr.message, 500);

      const affected = Array.isArray(updRows) ? updRows.length : (updRows ? 1 : 0);
      if (affected === 0) {
        const presInsert: any = { ticket_id: idNum, ...presUpdate };
        const { error: insErr } = await supabase.from('presupuestos').insert(presInsert);
        if (insErr) return jsonError('Error al crear presupuesto: ' + insErr.message, 500);
      }
    }

    // ✅ Marcamos el estado como "P. Enviado" sólo si efectivamente se envió/actualizó presupuesto
    {
      const { error: estadoErr } = await supabase
        .from('tickets_mian')
        .update({ estado: 'P. Enviado' })
        .eq('id', idNum);
      if (estadoErr) return jsonError('No se pudo marcar el estado como P. Enviado: ' + estadoErr.message, 500);
    }

    // ========== Imágenes ==========
    const contentType = (f: File | null) => (f as any)?.type || 'image/webp';
    const subirImagen = async (archivo: File, nombreArchivo: string, campo: 'imagen'|'imagen_ticket'|'imagen_extra') => {
      const { error: uploadError } = await supabase.storage
        .from('imagenes')
        .upload(nombreArchivo, archivo, { cacheControl: '3600', upsert: true, contentType: contentType(archivo) });
      if (uploadError) throw new Error(`Error al subir ${campo}: ${uploadError.message}`);
      const { data } = supabase.storage.from('imagenes').getPublicUrl(nombreArchivo);
      (datosTicketsMian as any)[campo] = data.publicUrl;
    };
    const borrarImagenCampo = async (nombreArchivo: string, campo: 'imagen'|'imagen_ticket'|'imagen_extra') => {
      await supabase.storage.from('imagenes').remove([nombreArchivo]);
      (datosTicketsMian as any)[campo] = null;
    };
    const mustDelete = (v: string | null | undefined) => v === 'delete' || v === 'true';

    const nombreArchivo = `public/${idNum}.webp`;
    if (imagenArchivo && imagenArchivo.size > 0)      await subirImagen(imagenArchivo, nombreArchivo, 'imagen');
    else if (mustDelete(borrarImagen))                await borrarImagenCampo(nombreArchivo, 'imagen');

    const nombreArchivoTicket = `public/${idNum}_ticket.webp`;
    if (imagenTicketArchivo && imagenTicketArchivo.size > 0) await subirImagen(imagenTicketArchivo, nombreArchivoTicket, 'imagen_ticket');
    else if (mustDelete(borrarImagenTicket))                  await borrarImagenCampo(nombreArchivoTicket, 'imagen_ticket');

    const nombreArchivoExtra = `public/${idNum}_extra.webp`;
    if (imagenExtraArchivo && imagenExtraArchivo.size > 0) await subirImagen(imagenExtraArchivo, nombreArchivoExtra, 'imagen_extra');
    else if (mustDelete(borrarImagenExtra))                 await borrarImagenCampo(nombreArchivoExtra, 'imagen_extra');

    // Guardar los cambios acumulados del ticket (estado/fechas/notas/imagenes/maquina_reparada)
    {
      const { error } = await supabase.from('tickets_mian').update(datosTicketsMian).eq('id', idNum);
      if (error) return jsonError('Error al actualizar ticket: ' + error.message, 500);
    }

    return new Response(null, { status: 303, headers: { Location: `/detalle/${idNum}` } });
  } catch (err: any) {
    return jsonError('Error inesperado: ' + (err?.message || String(err)), 500);
  }
};
