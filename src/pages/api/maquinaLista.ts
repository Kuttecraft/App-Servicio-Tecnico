import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

// === helpers copiados de agregarComentario.ts ===
// (Si querés, movelos a un archivo compartido: src/lib/resolverAutor.ts)
function deriveNameFromEmail(email: string): { nombre: string; apellido: string } {
  const local = email.split('@')[0] || 'Usuario';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return { nombre: capitalize(parts[0]), apellido: capitalize(parts[1]) };
  return { nombre: capitalize(local), apellido: '' };
}
function capitalize(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

async function resolverAutor(locals: any): Promise<{id:number; nombre?:string; apellido?:string; activo?:boolean} | null> {
  const tecnicoId = Number(locals?.tecnico_id);
  if (Number.isFinite(tecnicoId) && tecnicoId > 0) {
    const { data } = await supabase
      .from('tecnicos')
      .select('id, nombre, apellido, activo')
      .eq('id', tecnicoId)
      .maybeSingle();
    if (data?.id) return data as any;
  }

  const userEmail: string | null =
    locals?.user?.email || locals?.perfil?.email || locals?.usuario?.email || null;
  if (!userEmail) return null;

  {
    const { data } = await supabase
      .from('tecnicos')
      .select('id, nombre, apellido, activo')
      .ilike('email', userEmail)
      .maybeSingle();
    if (data?.id) return data as any;
  }

  const { nombre, apellido } = deriveNameFromEmail(userEmail);
  const { data: created } = await supabase
    .from('tecnicos')
    .insert({ nombre, apellido, email: userEmail, activo: true })
    .select('id, nombre, apellido, activo')
    .single();

  return created as any || null;
}

// === endpoint ===
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: 'Falta parámetro id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1) Marcar ticket como "Lista"
    const nowIso = new Date().toISOString();
    const { error: updErr } = await supabase
      .from('tickets_mian')
      .update({ estado: 'Lista', fecha_de_reparacion: nowIso })
      .eq('id', id);

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2) Insertar comentario automático con el autor actual
    try {
      const autor = await resolverAutor(locals);
      if (autor && autor.activo !== false) {
        const autorNombre = `${autor.nombre ?? ''} ${autor.apellido ?? ''}`.trim() || 'Técnico';
        const mensaje = `${autorNombre} marcó Máquina Lista`; // <- si querés evitar repetir nombre en UI: usar "Marcó Máquina Lista"

        // validar existencia del ticket por las dudas (opcional)
        const { data: tk } = await supabase
          .from('tickets_mian')
          .select('id')
          .eq('id', Number(id))
          .maybeSingle();
        if (tk?.id) {
          await supabase.from('ticket_comentarios').insert({
            ticket_id: Number(id),
            autor_id: autor.id,
            mensaje,
          });
        }
      }
    } catch (_) {
      // No interrumpir el flujo si falla el comentario
    }

    // 3) Redirigir al detalle
    return new Response(null, { status: 303, headers: { Location: `/detalle/${id}` } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
