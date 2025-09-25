import type { APIContext } from 'astro';
import { supabase } from '../../lib/supabase';

export async function POST({ request }: APIContext) {
  const form = await request.formData();

  // Array de usuarios ya existentes (por índice en el form)
  const usuarios: Record<string, any>[] = [];
  // Objeto temporal para un usuario nuevo (sin id)
  let nuevoUsuario: Record<string, any> = {};

  // Recorrer cada campo enviado en el formulario
  for (const [key, value] of form as any) {
    // Coincide con campos del tipo usuarios[0][campo]
    const match = key.match(/^usuarios\[(\d+)\]\[([a-zA-Z_]+)\]$/);
    if (match) {
      const idx = parseInt(match[1]);
      const campo = match[2];

      if (!usuarios[idx]) usuarios[idx] = {};
      // Los campos de permisos y "eliminar" se transforman a boolean
      usuarios[idx][campo] = ['dashboard', 'tickets', 'usuarios', 'estadisticas', 'admin', 'eliminar'].includes(campo)
        ? value === "on" || value === "true" || String(value) === "true"
        : value;
      continue;
    }

    // Coincide con campos del tipo nuevo[campo]
    const nuevoMatch = key.match(/^nuevo\[([a-zA-Z_]+)\]$/);
    if (nuevoMatch) {
      const campo = nuevoMatch[1];
      // Para el nuevo usuario, también convertimos permisos a boolean
      nuevoUsuario[campo] = ['dashboard', 'tickets', 'usuarios', 'estadisticas', 'admin'].includes(campo)
        ? value === "on" || value === "true" || value === true
        : value;
    }
  }

  // ============================
  // 🔄 Actualizar usuarios existentes
  // ============================
  for (const u of usuarios) {
    if (u.eliminar && u.email) {
      // Si tiene flag "eliminar", borramos por email
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
      // Rol depende del flag admin
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

  // ============================
  // ➕ Agregar nuevo usuario
  // ============================
  if (nuevoUsuario.email) {
    const rol = nuevoUsuario.admin ? 'admin' : 'tecnico';
    const nuevoObjeto = {
      email: nuevoUsuario.email,
      rol,
      dashboard: !!nuevoUsuario.dashboard,
      tickets: !!nuevoUsuario.tickets,
      usuarios: !!nuevoUsuario.usuarios,
      estadisticas: !!nuevoUsuario.estadisticas,
      activo: true,
    };

    // upsert garantiza que si el email ya existe, se actualiza
    const { error } = await supabase
      .from('usuarios_perfil')
      .upsert(nuevoObjeto, { onConflict: 'email' });

    if (error) {
      console.error(`Error agregando usuario ${nuevoUsuario.email}:`, error);
    }
  }

  // Redirigir a la página de usuarios
  const url = new URL('/usuarios', request.url);
  return Response.redirect(url.toString(), 302);
}
