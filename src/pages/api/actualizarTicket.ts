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
  const borrarImagen = formData.get("borrarImagen") === "true";

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

  // CASO 1: Imagen nueva subida (PRIMERO borrar, LUEGO subir la nueva)
  if (imagenArchivo && imagenArchivo.size > 0) {
    // BORRAR la anterior
    await supabase.storage.from('imagenes').remove([nombreArchivo]);

    // Subir nueva imagen
    const { error: uploadError } = await supabase.storage
      .from('imagenes')
      .upload(nombreArchivo, imagenArchivo, {
        cacheControl: '3600',
        upsert: true, // sigue estando, por si el borrado falla por "no existe"
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Error al subir imagen: ${uploadError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Obtener URL pública
    const { data: publicUrl } = supabase.storage
      .from('imagenes')
      .getPublicUrl(nombreArchivo);

    datosActualizados.imagen = publicUrl.publicUrl;

  } else if (borrarImagen) {
    // CASO 2: Se pidió borrar y NO hay imagen nueva
    await supabase.storage.from('imagenes').remove([nombreArchivo]);
    datosActualizados.imagen = null;
  }
  // CASO 3: Ni subió ni borró -> no se modifica el campo imagen

  // Actualizar base
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
