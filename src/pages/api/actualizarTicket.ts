import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, params, locals }) => {
  try {
    // ✅ admin desde el middleware
    const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
    const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);

    // ================== ID ROBUSTO ==================
    const formData = await request.formData();
    let id: string | undefined;

    // 1) Body
    const bodyKeys = ['ticketId', 'id', 'ticket', 'ticket_id'];
    for (const k of bodyKeys) {
      const v = formData.get(k);
      if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'undefined') {
        id = v.trim();
        break;
      }
    }

    // 2) Params (/api/actualizarTicket/[id])
    if (!id && params?.id && String(params.id).trim()) {
      id = String(params.id).trim();
    }

    // 3) Query (?id=123)
    if (!id) {
      const u = new URL(request.url);
      const qid = u.searchParams.get('id');
      if (qid && qid.trim()) id = qid.trim();
    }

    // 4) Referer (/editar/123)
    if (!id) {
      const ref = request.headers.get('referer') || request.headers.get('Referrer') || '';
      const m = ref.match(/\/editar\/(\d+)/);
      if (m && m[1]) id = m[1];
    }

    if (!id) return jsonError('ID no proporcionado', 400);

    const idNum = Number(id);
    if (!Number.isFinite(idNum) || idNum <= 0) {
      return jsonError(`ID inválido: ${id}`, 400);
    }
    // =================================================

    // ---- Archivos y flags
    const imagenArchivo = formData.get('imagenArchivo') as File | null;
    const borrarImagen = (formData.get('borrarImagen') as string | null) || 'false';

    const imagenTicketArchivo = formData.get('imagenTicketArchivo') as File | null;
    const borrarImagenTicket = (formData.get('borrarImagenTicket') as string | null) || 'false';

    const imagenExtraArchivo = formData.get('imagenExtraArchivo') as File | null;
    const borrarImagenExtra = (formData.get('borrarImagenExtra') as string | null) || 'false';

    // ---- Strings
    const fields: Record<string, string> = {};
    formData.forEach((val, key) => { if (typeof val === 'string') fields[key] = val.trim(); });

    // ---- Datos principales del ticket
    const datosTicketsMian: Record<string, any> = {
      estado: fields.estado || null,
      marca_temporal: fields.fechaFormulario || null,
      fecha_de_reparacion: fields.timestampListo || null,
      notas_del_tecnico: fields.notaTecnico || null,
    };

    // ---- Relacionados
    const datosCliente: Record<string, any> = {
      dni_cuit: fields.dniCuit || null,
      whatsapp: fields.whatsapp || null,
      correo_electronico: fields.correo || null,
      comentarios: fields.comentarios ?? null,
    };

    // ✅ Delivery: construir lo editable por rol
    const datosDeliveryBase = {
      ticket_id: idNum,
      pagado: fields.cobrado === 'true' ? 'true' : 'false',
      // Estos dos solo serán usados si isAdmin
      cotizar_delivery: fields.costoDelivery || null,
      informacion_adicional_delivery: fields.infoDelivery || null,
    };

    const datosPresupuestoBase = {
      ticket_id: idNum,
      monto: isNaN(parseFloat(fields.monto)) ? '0' : String(parseFloat(fields.monto)),
      link_presupuesto: fields.linkPresupuesto || null,
      cubre_garantia: fields.cubreGarantia === 'true' ? 'true' : 'false',
      fecha_presupuesto: fields.timestampPresupuesto || null,
    };

    // ---- Helpers imágenes
    const contentType = (f: File | null) => (f as any)?.type || 'image/webp';

    const subirImagen = async (archivo: File, nombreArchivo: string, campo: 'imagen'|'imagen_ticket'|'imagen_extra') => {
      const { error: uploadError } = await supabase.storage
        .from('imagenes')
        .upload(nombreArchivo, archivo, {
          cacheControl: '3600',
          upsert: true,
          contentType: contentType(archivo),
        });
      if (uploadError) throw new Error(`Error al subir ${campo}: ${uploadError.message}`);

      const { data } = supabase.storage.from('imagenes').getPublicUrl(nombreArchivo);
      (datosTicketsMian as any)[campo] = data.publicUrl;
    };

    const borrarImagenCampo = async (nombreArchivo: string, campo: 'imagen'|'imagen_ticket'|'imagen_extra') => {
      await supabase.storage.from('imagenes').remove([nombreArchivo]);
      (datosTicketsMian as any)[campo] = null;
    };

    const mustDelete = (v: string | null | undefined) => v === 'delete' || v === 'true';

    // ---- Imagen principal
    const nombreArchivo = `public/${idNum}.webp`;
    if (imagenArchivo && imagenArchivo.size > 0) {
      await subirImagen(imagenArchivo, nombreArchivo, 'imagen');
    } else if (mustDelete(borrarImagen)) {
      await borrarImagenCampo(nombreArchivo, 'imagen');
    }

    // ---- Imagen ticket
    const nombreArchivoTicket = `public/${idNum}_ticket.webp`;
    if (imagenTicketArchivo && imagenTicketArchivo.size > 0) {
      await subirImagen(imagenTicketArchivo, nombreArchivoTicket, 'imagen_ticket');
    } else if (mustDelete(borrarImagenTicket)) {
      await borrarImagenCampo(nombreArchivoTicket, 'imagen_ticket');
    }

    // ---- Imagen extra
    const nombreArchivoExtra = `public/${idNum}_extra.webp`;
    if (imagenExtraArchivo && imagenExtraArchivo.size > 0) {
      await subirImagen(imagenExtraArchivo, nombreArchivoExtra, 'imagen_extra');
    } else if (mustDelete(borrarImagenExtra)) {
      await borrarImagenCampo(nombreArchivoExtra, 'imagen_extra');
    }

    // === Obtener cliente_id del ticket
    const { data: tRow, error: tErr } = await supabase
      .from('tickets_mian')
      .select('cliente_id')
      .eq('id', idNum)
      .single();

    if (tErr || !tRow) return jsonError(`No se pudo obtener el ticket (id=${String(id)})`, 500);

    // ---- Updates
    {
      const { error } = await supabase.from('tickets_mian').update(datosTicketsMian).eq('id', idNum);
      if (error) return jsonError('Error al actualizar ticket: ' + error.message, 500);
    }

    if (tRow.cliente_id) {
      const { error } = await supabase.from('cliente').update(datosCliente).eq('id', tRow.cliente_id);
      if (error) return jsonError('Error al actualizar cliente: ' + error.message, 500);
    }

    // ===== delivery: UPDATE -> si no afectó filas -> INSERT
    {
      // Solo admin puede tocar cotizar_delivery e informacion_adicional_delivery
      const updPayload: any = { pagado: datosDeliveryBase.pagado };
      if (isAdmin) {
        updPayload.cotizar_delivery = datosDeliveryBase.cotizar_delivery;
        updPayload.informacion_adicional_delivery = datosDeliveryBase.informacion_adicional_delivery;
      }

      const { data: updRows, error: updErr } = await supabase
        .from('delivery')
        .update(updPayload)
        .eq('ticket_id', idNum)
        .select('id');

      if (updErr) return jsonError('Error al actualizar delivery: ' + updErr.message, 500);

      const affected = Array.isArray(updRows) ? updRows.length : (updRows ? 1 : 0);
      if (affected === 0) {
        const insPayload: any = { ticket_id: idNum, pagado: datosDeliveryBase.pagado };
        if (isAdmin) {
          insPayload.cotizar_delivery = datosDeliveryBase.cotizar_delivery;
          insPayload.informacion_adicional_delivery = datosDeliveryBase.informacion_adicional_delivery;
        }
        const { error: insErr } = await supabase.from('delivery').insert(insPayload);
        if (insErr) return jsonError('Error al crear delivery: ' + insErr.message, 500);
      }
    }

    // ===== presupuestos: UPDATE -> si no afectó filas -> INSERT
    {
      const { data: updRows, error: updErr } = await supabase
        .from('presupuestos')
        .update({
          monto: datosPresupuestoBase.monto,
          link_presupuesto: datosPresupuestoBase.link_presupuesto,
          cubre_garantia: datosPresupuestoBase.cubre_garantia,
          fecha_presupuesto: datosPresupuestoBase.fecha_presupuesto,
        })
        .eq('ticket_id', idNum)
        .select('id');

      if (updErr) return jsonError('Error al actualizar presupuesto: ' + updErr.message, 500);

      const affected = Array.isArray(updRows) ? updRows.length : (updRows ? 1 : 0);
      if (affected === 0) {
        const { error: insErr } = await supabase.from('presupuestos').insert(datosPresupuestoBase);
        if (insErr) return jsonError('Error al crear presupuesto: ' + insErr.message, 500);
      }
    }

    return new Response(null, { status: 303, headers: { Location: `/detalle/${idNum}` } });
  } catch (err: any) {
    return jsonError('Error inesperado: ' + (err?.message || String(err)), 500);
  }
};

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
