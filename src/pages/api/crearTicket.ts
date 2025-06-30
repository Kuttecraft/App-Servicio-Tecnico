import { supabase } from '../../lib/supabase';

interface RequestContext {
  request: Request;
  params: Record<string, string>;
  url: URL;
  site: URL | undefined;
}

export async function POST(context: RequestContext) {
  const req = context.request;
  const formData = await req.formData();
  const imagenArchivo = formData.get("imagenArchivo") as File | null;

  const allowedFields = [
    "cliente", "dniCuit", "correo", "whatsapp", "modelo",
    "tecnico", "estado", "ticket", "comentarios", "cobrado"
  ];
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string' && allowedFields.includes(key)) {
      fields[key] = value;
    }
  });

  // Ticket: aseguramos que sea número, si no es válido sugerimos 1
  let ticketNumber = parseInt(fields.ticket);
  if (isNaN(ticketNumber) || ticketNumber < 1) ticketNumber = 1;

  const nuevoTicket: any = {
    ...fields,
    ticket: ticketNumber,
    cobrado: "No", // Siempre "No" al crear, por lógica de negocio
    fechaFormulario: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('TestImpresoras')
    .insert([nuevoTicket])
    .select()
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: error?.message || 'Error al insertar ticket' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = data.id;

  if (imagenArchivo && imagenArchivo.size > 0) {
    const nombreArchivo = `public/${id}.webp`;

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

    const { data: publicUrl } = supabase.storage
      .from('imagenes')
      .getPublicUrl(nombreArchivo);

    await supabase
      .from('TestImpresoras')
      .update({ imagen: publicUrl.publicUrl })
      .eq('id', id);
  }

  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${id}` },
  });
}
