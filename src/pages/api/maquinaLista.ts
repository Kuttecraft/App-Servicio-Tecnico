import { supabase } from '../../lib/supabase';

export async function POST(context: { request: Request }) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'Falta parámetro id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nowIso = new Date().toISOString();

  const { error } = await supabase
    .from('tickets_mian')
    .update({
      estado: 'Lista',
      fecha_de_reparacion: nowIso, // coincide con "Fecha listo"
    })
    .eq('id', id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // redirigir al detalle del equipo
  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${id}` },
  });
}
