import { supabase } from '../../lib/supabase';

export async function POST(context: RequestContext) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id'); // ✅ Extraemos el ID desde la query string

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID no proporcionado' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { error } = await supabase
    .from('TestImpresoras')
    .delete()
    .eq('id', id); // ✅ UUID string

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ message: 'Ticket eliminado correctamente' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Tipado para Astro server output
interface RequestContext {
  request: Request;
  params: Record<string, string>;
  url: URL;
  site: URL | undefined;
}
