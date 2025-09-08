import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const body = await request.json().catch(() => null) as { ticketId?: number|string; mensaje?: string };

    const ticketIdNum = Number(body?.ticketId);
    const mensaje = (body?.mensaje || '').trim();

    if (!Number.isFinite(ticketIdNum) || ticketIdNum <= 0) {
      return jsonError('ticketId inválido', 400);
    }
    if (!mensaje) {
      return jsonError('El mensaje no puede estar vacío', 400);
    }
    if (mensaje.length > 2000) {
      return jsonError('Mensaje demasiado largo (máx 2000)', 400);
    }

    // ============================
    // Resolver autor_id (técnico)
    // ============================
    const autor = await resolverAutor(locals);
    if (!autor) {
      return jsonError('No se pudo determinar el técnico actual', 401);
    }
    if (autor.activo === false) {
      return jsonError('El técnico no está activo', 403);
    }

    // Validar ticket
    const { data: tk } = await supabase
      .from('tickets_mian')
      .select('id')
      .eq('id', ticketIdNum)
      .maybeSingle();
    if (!tk?.id) return jsonError('Ticket inexistente', 404);

    // Insertar comentario (append-only)
    const { data: inserted, error: insErr } = await supabase
      .from('ticket_comentarios')
      .insert({
        ticket_id: ticketIdNum,
        autor_id: autor.id,
        mensaje
      })
      .select('id, creado_en')
      .single();

    if (insErr || !inserted) {
      return jsonError('No se pudo agregar el comentario: ' + (insErr?.message || ''), 500);
    }

    const autorNombre = `${autor.nombre ?? ''} ${autor.apellido ?? ''}`.trim() || 'Técnico';
    const creadoHumano = new Date(inserted.creado_en).toLocaleString('es-AR', { hour12: false });

    return new Response(JSON.stringify({
      ok: true,
      id: inserted.id,
      creado_en: inserted.creado_en,
      creado_en_humano: creadoHumano,
      autor: autorNombre,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return jsonError('Error inesperado: ' + (err?.message || String(err)), 500);
  }
};

function jsonError(message: string, status = 500) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Resolve técnico en este orden:
 * 1) locals.tecnico_id
 * 2) email en locals (case-insensitive)
 * 3) si no existe, crea técnico activo con ese email
 */
async function resolverAutor(locals: any): Promise<{id:number; nombre?:string; apellido?:string; activo?:boolean} | null> {
  // 1) por id
  const tecnicoId = Number(locals?.tecnico_id);
  if (Number.isFinite(tecnicoId) && tecnicoId > 0) {
    const { data } = await supabase
      .from('tecnicos')
      .select('id, nombre, apellido, activo')
      .eq('id', tecnicoId)
      .maybeSingle();
    if (data?.id) return data as any;
  }

  // 2) por email
  const userEmail: string | null =
    locals?.user?.email || locals?.perfil?.email || locals?.usuario?.email || null;
  if (!userEmail) return null;

  // buscar (ILIKE)
  {
    const { data } = await supabase
      .from('tecnicos')
      .select('id, nombre, apellido, activo')
      .ilike('email', userEmail)
      .maybeSingle();
    if (data?.id) return data as any;
  }

  // 3) crear si no existe
  const { nombre, apellido } = deriveNameFromEmail(userEmail);
  const { data: created, error: createErr } = await supabase
    .from('tecnicos')
    .insert({
      nombre,
      apellido,
      email: userEmail,
      activo: true
    })
    .select('id, nombre, apellido, activo')
    .single();

  if (createErr || !created) return null;
  return created as any;
}

function deriveNameFromEmail(email: string): { nombre: string; apellido: string } {
  const local = email.split('@')[0] || 'Usuario';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return { nombre: capitalize(parts[0]), apellido: capitalize(parts[1]) };
  return { nombre: capitalize(local), apellido: '' };
}
function capitalize(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
