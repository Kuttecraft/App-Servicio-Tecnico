import type { APIContext } from 'astro';
import { supabase } from '../../lib/supabase';

export async function POST({ request }: APIContext) {
  const form = await request.formData();

  const usuarios: Record<string, any>[] = [];
  let nuevoUsuario: Record<string, any> = {};

  for (const [key, value] of form as any) {
    const match = key.match(/^usuarios\[(\d+)\]\[([a-zA-Z_]+)\]$/);
    if (match) {
      const idx = parseInt(match[1]);
      const campo = match[2];

      if (!usuarios[idx]) usuarios[idx] = {};
      usuarios[idx][campo] = ['dashboard', 'tickets', 'usuarios', 'estadisticas', 'admin', 'eliminar'].includes(campo)
        ? value === "on" || value === "true" || String(value) === "true"
        : value;
      continue;
    }

    const nuevoMatch = key.match(/^nuevo\[([a-zA-Z_]+)\]$/);
    if (nuevoMatch) {
      const campo = nuevoMatch[1];
      nuevoUsuario[campo] = ['dashboard', 'tickets', 'usuarios', 'estadisticas', 'admin'].includes(campo)
        ? value === "on" || value === "true" || value === true
        : value;
    }
  }

  // Actualizar usuarios existentes
  for (const u of usuarios) {
    if (u.eliminar && u.email) {
      const { error } = await supabase
        .from('usuarios_perfil')
        .delete()
        .eq('email', u.email);
      if (error) {
        console.error(`Error eliminando usuario ${u.email}:`, error);
      }
      continue;
    }
    if (u.email) {
      const rol = u.admin ? 'admin' : 'tecnico';
      const { error } = await supabase
        .from('usuarios_perfil')
        .update({
          dashboard: !!u.dashboard,
          tickets: !!u.tickets,
          usuarios: !!u.usuarios,
          estadisticas: !!u.estadisticas,
          rol,
        })
        .eq('email', u.email);

      if (error) {
        console.error(`Error actualizando usuario ${u.email}:`, error);
      }
    }
  }

  // Agregar nuevo usuario
  if (nuevoUsuario.email) {
    const rol = nuevoUsuario.admin ? 'admin' : 'tecnico';
    const { error } = await supabase
      .from('usuarios_perfil')
      .upsert({
        email: nuevoUsuario.email,
        rol,
        dashboard: !!nuevoUsuario.dashboard,
        tickets: !!nuevoUsuario.tickets,
        usuarios: !!nuevoUsuario.usuarios,
        estadisticas: !!nuevoUsuario.estadisticas,
        activo: true,
      }, { onConflict: 'email' });
    if (error) {
      console.error(`Error agregando usuario ${nuevoUsuario.email}:`, error);
    }
  }

  const url = new URL('/usuarios', request.url);
  return Response.redirect(url.toString(), 302);
}
