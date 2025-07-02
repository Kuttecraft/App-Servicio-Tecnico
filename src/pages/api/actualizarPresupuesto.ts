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

  // --- Mapeo y parseo, como en el primer ejemplo ---
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value.trim();
    }
  });

  // Conversión y validaciones según tu modelo
  const datosActualizados: any = {
    monto: isNaN(parseFloat(fields.monto)) ? 0 : parseFloat(fields.monto),
    linkPresupuesto: fields.linkPresupuesto || null,
    timestampPresupuesto: fields.timestampPresupuesto || null,
    cobrado: fields.cobrado === 'true',
    notaTecnico: fields.notaTecnico || null,
    notaInterna: fields.notaInterna || null,
    // Si agregás más campos, los parseás igual aquí
  };

  // Actualiza la base de datos
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
