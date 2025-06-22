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
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value.trim();
    }
  });

  // Conversión de tipos y validaciones específicas
  const datosActualizados = {
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
