import { supabase } from '../lib/supabase';

export type Autor = { id: number; nombre?: string; apellido?: string; activo?: boolean };

/** Resuelve el técnico actual desde `locals`:
 * 1) locals.tecnico_id
 * 2) email en locals (user/perfil/usuario)
 * 3) si no existe, lo crea (activo=true)
 */
export async function resolverAutor(locals: any): Promise<Autor | null> {
  // 1) por id directo
  const tecnicoId = Number(locals?.tecnico_id);
  if (Number.isFinite(tecnicoId) && tecnicoId > 0) {
    const { data } = await supabase
      .from('tecnicos')
      .select('id, nombre, apellido, activo')
      .eq('id', tecnicoId)
      .maybeSingle();
    if (data?.id) return data as Autor;
  }

  // 2) por email en locals
  const userEmail: string | null =
    locals?.user?.email || locals?.perfil?.email || locals?.usuario?.email || null;
  if (!userEmail) return null;

  {
    const { data } = await supabase
      .from('tecnicos')
      .select('id, nombre, apellido, activo')
      .ilike('email', userEmail)
      .maybeSingle();
    if (data?.id) return data as Autor;
  }

  // 3) crear técnico si no existe
  const { nombre, apellido } = deriveNameFromEmail(userEmail);
  const { data: created } = await supabase
    .from('tecnicos')
    .insert({ nombre, apellido, email: userEmail, activo: true })
    .select('id, nombre, apellido, activo')
    .single();

  return (created as Autor) ?? null;
}

export function nombreAutor(autor?: Pick<Autor, 'nombre'|'apellido'> | null): string {
  return `${autor?.nombre ?? ''} ${autor?.apellido ?? ''}`.trim() || 'Técnico';
}

function deriveNameFromEmail(email: string): { nombre: string; apellido: string } {
  const local = email.split('@')[0] || 'Usuario';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) return { nombre: capitalize(parts[0]), apellido: capitalize(parts[1]) };
  return { nombre: capitalize(local), apellido: '' };
}
function capitalize(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
