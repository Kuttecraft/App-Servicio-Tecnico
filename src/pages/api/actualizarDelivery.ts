import { supabase } from '../../lib/supabase';

interface RequestContext {
  request: Request;
  params: Record<string, string>;
  url: URL;
  site: URL | undefined;
}

export async function POST(context: RequestContext) {
  const req = context.request;
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return new Response(JSON.stringify({ error: 'Falta el parámetro id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const formData = await req.formData();

  // Extraer campos y limpiarlos
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value.trim();
    }
  });

  // Parsear los campos antes de guardar
  const datosActualizados: any = {
    costoDelivery: isNaN(parseFloat(fields.costoDelivery)) ? 0 : parseFloat(fields.costoDelivery), // número
    infoDelivery: fields.infoDelivery || null, // string o null
    timestampListo: fields.timestampListo || null // string (fecha) o null
  };

  // Opcional: si costoDelivery puede ser null (si no se manda), lo ponés como null:
  // costoDelivery: fields.costoDelivery ? parseFloat(fields.costoDelivery) : null,

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
