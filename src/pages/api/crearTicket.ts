import { supabase } from '../../lib/supabase';

export async function POST(context: RequestContext) {
  const req = context.request;

  // Procesar el body del form
  const formData = await req.formData();
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value;
    }
  });

  const nuevoTicket = {
    ...fields,
    cubreGarantia: fields.cubreGarantia === 'true',
    cobrado: fields.cobrado === 'true',
    monto: isNaN(parseFloat(fields.monto)) ? 0 : parseFloat(fields.monto),
    fechaFormulario: new Date().toISOString(),
  };

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

  // Redirigir manualmente
  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${data.id}` },
  });
}

// Tipado para output: 'server'
interface RequestContext {
  request: Request;
  params: Record<string, string>;
  url: URL;
  site: URL | undefined;
}
