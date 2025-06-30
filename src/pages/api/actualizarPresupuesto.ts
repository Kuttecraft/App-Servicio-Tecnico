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

  const allowedFields = [
    "monto",
    "linkPresupuesto",
    "timestampPresupuesto",
    "cobrado",
    "notaTecnico",
    "notaInterna"
  ];

  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string' && allowedFields.includes(key)) {
      fields[key] = value;
    }
  });

  // Validación extra: monto como número
  if ("monto" in fields) {
    fields.monto = isNaN(Number(fields.monto)) ? "0" : String(Number(fields.monto));
  }

  const { error } = await supabase
    .from('TestImpresoras')
    .update(fields)
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
