import { supabase } from '../../lib/supabase';

export async function POST(context: RequestContext) {
  const req = context.request;
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID no proporcionado' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const formData = await req.formData();

  // Archivos e indicadores de borrado
  const imagenArchivo = formData.get("imagenArchivo") as File | null;
  const borrarImagen = formData.get("borrarImagen");

  const imagenTicketArchivo = formData.get("imagenTicketArchivo") as File | null;
  const borrarImagenTicket = formData.get("borrarImagenTicket");

  const imagenExtraArchivo = formData.get("imagenExtraArchivo") as File | null;
  const borrarImagenExtra = formData.get("borrarImagenExtra");

  // Parse fields
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value.trim();
    }
  });

  // Conversión de tipos y validaciones específicas
  const datosTicketsMian: any = {
    estado: fields.estado,
    marca_temporal: fields.fechaFormulario || null,
    fecha_de_reparacion: fields.timestampListo || null,
    notas_del_tecnico: fields.notaTecnico,
    // ❌ nota_admin no existe en la tabla `tickets_mian`, por eso se comenta
    // nota_admin: fields.notaAdmin || null,
  };

  const datosCliente: any = {
    dni_cuit: fields.dniCuit || null,
    whatsapp: fields.whatsapp || null,
    correo_electronico: fields.correo || null,
    comentario: fields.comentario || null
  };

  const datosDelivery: any = {
    pagado: fields.cobrado === 'true' ? 'true' : 'false',
    cotizar_delivery: fields.costoDelivery || null,
    informacion_adicional_delivery: fields.infoDelivery || null
  };

  const datosPresupuesto: any = {
    monto: isNaN(parseFloat(fields.monto)) ? '0' : String(parseFloat(fields.monto)),
    link_presupuesto: fields.linkPresupuesto || null,
    cubre_garantia: fields.cubreGarantia === 'true' ? 'true' : 'false',
    fecha_presupuesto: fields.timestampPresupuesto || null
  };

  // ---- Lógica de imágenes ----
  const subirImagen = async (archivo: File, nombreArchivo: string, campo: string) => {
    await supabase.storage.from('imagenes').remove([nombreArchivo]); // Borra anterior (si existe)
    const { error: uploadError } = await supabase.storage
      .from('imagenes')
      .upload(nombreArchivo, archivo, {
        cacheControl: '3600',
        upsert: true,
      });
    if (uploadError) {
      throw new Error(`Error al subir ${campo}: ${uploadError.message}`);
    }
    const { data: publicUrl } = supabase.storage.from('imagenes').getPublicUrl(nombreArchivo);
    datosTicketsMian[campo] = publicUrl.publicUrl;
  };

  const borrarImagenCampo = async (nombreArchivo: string, campo: string) => {
    await supabase.storage.from('imagenes').remove([nombreArchivo]);
    datosTicketsMian[campo] = null;
  };

  // imagen
  const nombreArchivo = `public/${id}.webp`;
  if (imagenArchivo && imagenArchivo.size > 0) {
    await subirImagen(imagenArchivo, nombreArchivo, 'imagen');
  } else if (borrarImagen === "delete") {
    await borrarImagenCampo(nombreArchivo, 'imagen');
  }

  // imagen_ticket
  const nombreArchivoTicket = `public/${id}_ticket.webp`;
  if (imagenTicketArchivo && imagenTicketArchivo.size > 0) {
    await subirImagen(imagenTicketArchivo, nombreArchivoTicket, 'imagen_ticket');
  } else if (borrarImagenTicket === "delete") {
    await borrarImagenCampo(nombreArchivoTicket, 'imagen_ticket');
  }

  // imagen_extra
  const nombreArchivoExtra = `public/${id}_extra.webp`;
  if (imagenExtraArchivo && imagenExtraArchivo.size > 0) {
    await subirImagen(imagenExtraArchivo, nombreArchivoExtra, 'imagen_extra');
  } else if (borrarImagenExtra === "delete") {
    await borrarImagenCampo(nombreArchivoExtra, 'imagen_extra');
  }

  // ---- Obtener IDs relacionados ----
  const { data: ticketData, error: ticketError } = await supabase
    .from('tickets_mian')
    .select('cliente_id, delivery(id), presupuestos(id)')
    .eq('id', id)
    .single();

  if (ticketError || !ticketData) {
    return new Response(JSON.stringify({ error: 'No se pudo obtener el ticket y sus relaciones' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const clienteId = ticketData.cliente_id;
  const deliveryData = ticketData.delivery as any;
  const presupuestosData = ticketData.presupuestos as any;
  const deliveryId = Array.isArray(deliveryData) ? deliveryData?.[0]?.id : deliveryData?.id;
  const presupuestoId = Array.isArray(presupuestosData) ? presupuestosData?.[0]?.id : presupuestosData?.id;

  // ---- Actualizar tickets_mian ----
  const { error: ticketUpdateError } = await supabase
    .from('tickets_mian')
    .update(datosTicketsMian)
    .eq('id', id);

  if (ticketUpdateError) {
    return new Response(JSON.stringify({ error: 'Error al actualizar ticket: ' + ticketUpdateError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- Actualizar cliente ----
  if (clienteId) {
    const { error: clienteError } = await supabase
      .from('cliente')
      .update(datosCliente)
      .eq('id', clienteId);

    if (clienteError) {
      return new Response(JSON.stringify({ error: 'Error al actualizar cliente: ' + clienteError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ---- Actualizar delivery ----
  if (deliveryId) {
    const { error: deliveryError } = await supabase
      .from('delivery')
      .update(datosDelivery)
      .eq('id', deliveryId);

    if (deliveryError) {
      return new Response(JSON.stringify({ error: 'Error al actualizar delivery: ' + deliveryError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // ---- Actualizar presupuesto ----
  if (presupuestoId) {
    const { error: presupuestoError } = await supabase
      .from('presupuestos')
      .update(datosPresupuesto)
      .eq('id', presupuestoId);

    if (presupuestoError) {
      return new Response(JSON.stringify({ error: 'Error al actualizar presupuesto: ' + presupuestoError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  // Redirige al detalle del equipo
  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${id}` },
  });
}

// Tipado para Astro server output
interface RequestContext {
  request: Request;
  params: Record<string, string>;
  url: URL;
  site: URL | undefined;
}
