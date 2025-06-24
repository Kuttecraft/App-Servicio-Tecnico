import { supabase } from '../../lib/supabase';

export async function POST(context: RequestContext) {
  const req = context.request;

  // Procesar el body del formulario
  const formData = await req.formData();
  const imagenArchivo = formData.get("imagenArchivo") as File | null;

  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value;
    }
  });

  const nuevoTicket: any = {
    ...fields,
    cubreGarantia: fields.cubreGarantia === 'true',
    cobrado: fields.cobrado === 'true',
    monto: isNaN(parseFloat(fields.monto)) ? 0 : parseFloat(fields.monto),
    fechaFormulario: new Date().toISOString(),
  };

  // 🖼 Subida de imagen si existe
  if (imagenArchivo && imagenArchivo.size > 0) {
    const nombreArchivo = `public/${Date.now()}_${imagenArchivo.name}`;
    const { error: uploadError } = await supabase.storage
      .from('imagenes') // Asegurate que este bucket exista en Supabase
      .upload(nombreArchivo, imagenArchivo, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Error al subir imagen: ${uploadError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: publicUrl } = supabase.storage
      .from('imagenes')
      .getPublicUrl(nombreArchivo);

    nuevoTicket.imagen = publicUrl.publicUrl;
  }

  // ✅ Insertar ticket en la base
  const { data, error } = await supabase
    .from('TestImpresoras')
    .insert([nuevoTicket])
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Redirigir al detalle del ticket
  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${data.id}` },
  });
}

// Tipado para Astro server
interface RequestContext {
  request: Request;
  params: Record<string, string>;
  url: URL;
  site: URL | undefined;
}
