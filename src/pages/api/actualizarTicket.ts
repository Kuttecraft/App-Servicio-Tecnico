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
  const imagenArchivo = formData.get("imagenArchivo") as File | null;
  const borrarImagen = formData.get("borrarImagen");

  // Parse fields
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value.trim();
    }
  });

  // Conversión de tipos y validaciones específicas
  const datosActualizados: any = {
    estado: fields.estado,
    modelo: fields.modelo,
    fechaFormulario: fields.fechaFormulario || null,
    tecnico: fields.tecnico,
    notaTecnico: fields.notaTecnico,
    notaAdmin: fields.notaAdmin,
    comentarios: fields.comentarios,
    notaInterna: fields.notaInterna,
    cubreGarantia: fields.cubreGarantia === 'true',
    cobrado: fields.cobrado === 'true',
    monto: isNaN(parseFloat(fields.monto)) ? 0 : parseFloat(fields.monto),
    linkPresupuesto: fields.linkPresupuesto,
    costoDelivery: fields.costoDelivery,
    infoDelivery: fields.infoDelivery,
    dniCuit: fields.dniCuit,
    whatsapp: fields.whatsapp,
    correo: fields.correo,
    timestampPresupuesto: fields.timestampPresupuesto || null,
    timestampListo: fields.timestampListo || null
  };

  const nombreArchivo = `public/${id}.webp`;

  // ---- Lógica de imagen ----
  // CASO 1: Subió imagen nueva (siempre reemplaza)
  if (imagenArchivo && imagenArchivo.size > 0) {
    // Borra anterior (por las dudas, puede no existir)
    await supabase.storage.from('imagenes').remove([nombreArchivo]);

    // Sube nueva imagen
    const { error: uploadError } = await supabase.storage
      .from('imagenes')
      .upload(nombreArchivo, imagenArchivo, {
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Error al subir imagen: ${uploadError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Guarda URL pública
    const { data: publicUrl } = supabase.storage
      .from('imagenes')
      .getPublicUrl(nombreArchivo);

    datosActualizados.imagen = publicUrl.publicUrl;

  // CASO 2: Eligió borrar imagen (sin subir nada)
  } else if (borrarImagen === "delete") {
    await supabase.storage.from('imagenes').remove([nombreArchivo]);
    datosActualizados.imagen = null;

  // CASO 3: No tocó nada de la imagen (ni sube ni borra)
  } // No se modifica el campo "imagen"

  // ---- Actualizar base de datos ----
  const { error } = await supabase
    .from('TestImpresoras')
    .update(datosActualizados)
    .eq('id', id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
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
