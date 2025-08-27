import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

function normDate(value?: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmY = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmY) {
    const dd = dmY[1].padStart(2, '0');
    const mm = dmY[2].padStart(2, '0');
    const yyyy = dmY[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

export const POST: APIRoute = async ({ request, params, locals }) => {
  try {
    const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
    const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);

    const formData = await request.formData();
    let id: string | undefined;

    for (const k of ['ticketId','id','ticket','ticket_id']) {
      const v = formData.get(k);
      if (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'undefined') { id = v.trim(); break; }
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

    // Archivos/flags de imagen
    const imagenArchivo = formData.get('imagenArchivo') as File | null;
    const borrarImagen = (formData.get('borrarImagen') as string | null) || 'false';
    const imagenTicketArchivo = formData.get('imagenTicketArchivo') as File | null;
    const borrarImagenTicket = (formData.get('borrarImagenTicket') as string | null) || 'false';
    const imagenExtraArchivo = formData.get('imagenExtraArchivo') as File | null;
    const borrarImagenExtra = (formData.get('borrarImagenExtra') as string | null) || 'false';

    const fields: Record<string, string> = {};
    formData.forEach((val, key) => { if (typeof val === 'string') fields[key] = val.trim(); });

    const { data: tRow, error: tErr } = await supabase
      .from('tickets_mian')
      .select('cliente_id, impresora_id, marca_temporal, fecha_de_reparacion')
      .eq('id', idNum)
      .single();
    if (tErr || !tRow) return jsonError(`No se pudo obtener el ticket (id=${String(id)})`, 500);

    // ====== Ticket ======
    const fechaFormularioNorm = normDate(fields.fechaFormulario);
    const fechaListoNorm      = normDate(fields.timestampListo);

    const datosTicketsMian: Record<string, any> = {
      estado: fields.estado || null,
      marca_temporal: (fechaFormularioNorm ?? tRow.marca_temporal) || null,
      fecha_de_reparacion: (fechaListoNorm ?? tRow.fecha_de_reparacion) || null,
      notas_del_tecnico: fields.notaTecnico || null,
      maquina_reparada: fields.modelo || null,
    };

    // ====== Cliente ======
    const datosCliente: Record<string, any> = {
      dni_cuit: fields.dniCuit || null,
      whatsapp: fields.whatsapp || null,
      correo_electronico: fields.correo || null,
      comentarios: fields.comentarios ?? null,
    };

    // ====== IMPRESORA ======
    const modelo = fields.modelo || '';
    const maquina = fields.maquina || '';
    const numeroSerie = fields.numeroSerie || '';
    const boquilla = fields.boquilla || '';

    if (modelo || maquina || numeroSerie || boquilla) {
      if (tRow.impresora_id) {
        const payloadImpresora: any = {};
        if (modelo) payloadImpresora.modelo = modelo;
        if (maquina) payloadImpresora.maquina = maquina;
        if (numeroSerie) payloadImpresora.numero_de_serie = numeroSerie;
        payloadImpresora.tamano_de_boquilla = boquilla || null;

        const { error } = await supabase
          .from('impresoras')
          .update(payloadImpresora)
          .eq('id', tRow.impresora_id);
        if (error) return jsonError('Error al actualizar impresora: ' + error.message, 500);
      } else {
        let impresoraId: number | null = null;

        if (numeroSerie) {
          const { data: impFound } = await supabase
            .from('impresoras')
            .select('id')
            .eq('numero_de_serie', numeroSerie)
            .maybeSingle();
          if (impFound?.id) impresoraId = impFound.id;
        }

        if (!impresoraId && (modelo || maquina)) {
          const maquinaSafe = maquina || 'Desconocida';
          const serieSafe = numeroSerie || `TEMP-${Date.now()}-${Math.floor(Math.random()*900+100)}`;

          const { data: byModel } = await supabase
            .from('impresoras')
            .select('id')
            .match({ modelo: modelo || '(sin modelo)', maquina: maquinaSafe })
            .limit(1)
            .maybeSingle();

          if (byModel?.id) {
            impresoraId = byModel.id;
          } else {
            const { data: impNew, error: impErr } = await supabase
              .from('impresoras')
              .insert({
                modelo: modelo || '(sin modelo)',
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

    // ====== Delivery ======
    const datosDeliveryBase = {
      ticket_id: idNum,
      pagado: fields.cobrado === 'true' ? 'true' : 'false',
      cotizar_delivery: fields.costoDelivery || null,
      informacion_adicional_delivery: fields.infoDelivery || null,
    };

    const fechaPresuNorm = normDate(fields.timestampPresupuesto);
    const datosPresupuestoBase = {
      ticket_id: idNum,
      monto: isNaN(parseFloat(fields.monto)) ? '0' : String(parseFloat(fields.monto)),
      link_presupuesto: fields.linkPresupuesto || null,
      cubre_garantia: fields.cubre_garantia === 'true' ? 'true' : 'false', // por si viene con otro name
      cubre_garantia_alt: fields.cubreGarantia === 'true' ? 'true' : 'false', // compat
      fecha_presupuesto: fechaPresuNorm, // puede ser null si no editan
    };

    const contentType = (f: File | null) => (f as any)?.type || 'image/webp';
    const subirImagen = async (archivo: File, nombreArchivo: string, campo: 'imagen'|'imagen_ticket'|'imagen_extra') => {
      const { error: uploadError } = await supabase.storage.from('imagenes').upload(nombreArchivo, archivo, { cacheControl: '3600', upsert: true, contentType: contentType(archivo) });
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
    if (imagenArchivo && imagenArchivo.size > 0) await subirImagen(imagenArchivo, nombreArchivo, 'imagen');
    else if (mustDelete(borrarImagen)) await borrarImagenCampo(nombreArchivo, 'imagen');

    const nombreArchivoTicket = `public/${idNum}_ticket.webp`;
    if (imagenTicketArchivo && imagenTicketArchivo.size > 0) await subirImagen(imagenTicketArchivo, nombreArchivoTicket, 'imagen_ticket');
    else if (mustDelete(borrarImagenTicket)) await borrarImagenCampo(nombreArchivoTicket, 'imagen_ticket');

    const nombreArchivoExtra = `public/${idNum}_extra.webp`;
    if (imagenExtraArchivo && imagenExtraArchivo.size > 0) await subirImagen(imagenExtraArchivo, nombreArchivoExtra, 'imagen_extra');
    else if (mustDelete(borrarImagenExtra)) await borrarImagenCampo(nombreArchivoExtra, 'imagen_extra');

    // === Updates
    {
      const { error } = await supabase.from('tickets_mian').update(datosTicketsMian).eq('id', idNum);
      if (error) return jsonError('Error al actualizar ticket: ' + error.message, 500);
    }
    if (tRow.cliente_id) {
      const { error } = await supabase.from('cliente').update(datosCliente).eq('id', tRow.cliente_id);
      if (error) return jsonError('Error al actualizar cliente: ' + error.message, 500);
    }

    // ===== presupuestos: UPDATE -> INSERT (no pisar fecha si viene vacía) =====
    {
      const presUpdate: any = {
        monto: datosPresupuestoBase.monto,
        link_presupuesto: datosPresupuestoBase.link_presupuesto,
        // compat: usar el name correcto si vino
        cubre_garantia: (fields.cubre_garantia ?? fields.cubreGarantia) === 'true' ? 'true' : 'false',
      };

      // solo enviar fecha si el form la trajo con valor
      if (datosPresupuestoBase.fecha_presupuesto) {
        presUpdate.fecha_presupuesto = datosPresupuestoBase.fecha_presupuesto;
      }

      const { data: updRows, error: updErr } = await supabase
        .from('presupuestos')
        .update(presUpdate)
        .eq('ticket_id', idNum)
        .select('id');

      if (updErr) return jsonError('Error al actualizar presupuesto: ' + updErr.message, 500);

      const affected = Array.isArray(updRows) ? updRows.length : (updRows ? 1 : 0);
      if (affected === 0) {
        const presInsert: any = {
          ticket_id: idNum,
          monto: datosPresupuestoBase.monto,
          link_presupuesto: datosPresupuestoBase.link_presupuesto,
          cubre_garantia: (fields.cubre_garantia ?? fields.cubreGarantia) === 'true' ? 'true' : 'false',
        };
        if (datosPresupuestoBase.fecha_presupuesto) {
          presInsert.fecha_presupuesto = datosPresupuestoBase.fecha_presupuesto;
        }
        const { error: insErr } = await supabase.from('presupuestos').insert(presInsert);
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
