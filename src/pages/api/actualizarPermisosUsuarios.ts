import type { APIContext } from 'astro';
import { supabase } from '../../lib/supabase';

/**
 * Tipo auxiliar para representar un usuario parcial obtenido del form.
 * Usamos Record<string, any> porque los campos que vienen del formulario
 * pueden ser strings, booleanos ya procesados, flags de acción como "eliminar", etc.
 *
 * Ejemplos de campos que pueden aparecer:
 * - email: string
 * - dashboard / tickets / usuarios / estadisticas / admin: boolean
 * - eliminar: boolean
 */
type UsuarioParcial = Record<string, any>;

/**
 * Handler POST
 * ------------------------------------------------------------------
 * Este endpoint procesa el formulario de administración de permisos
 * (/usuarios), donde el admin puede:
 *
 *  - Actualizar permisos de usuarios existentes
 *  - Eliminar usuarios existentes
 *  - Crear (o actualizar vía upsert) un usuario nuevo
 *
 * El formulario manda dos tipos de bloques:
 *
 *   1. usuarios[i][campo]
 *      - i es un índice numérico (0,1,2,...)
 *      - campo puede ser:
 *          email, dashboard, tickets, usuarios,
 *          estadisticas, admin, eliminar, ...
 *
 *   2. nuevo[campo]
 *      - para cargar un usuario nuevo con los mismos campos de permisos
 *
 * Flujo:
 *   1. Parsear formData → construir `usuarios[]` y `nuevoUsuario`
 *   2. Para cada usuario en `usuarios[]`:
 *        a. si viene marcado "eliminar", se borra de la tabla
 *        b. sino, se hace update con los permisos nuevos
 *   3. Si `nuevoUsuario.email` existe → upsert en la tabla
 *   4. Redirigir a /usuarios
 */
export async function POST({ request }: APIContext) {
  // Leemos lo que posteó el formulario
  const form = await request.formData();

  // `usuarios` será un array donde cada índice i representa
  // a un usuario existente que estaba en el form como usuarios[i][...]
  const usuarios: UsuarioParcial[] = [];

  // `nuevoUsuario` representará la sección "nuevo[...]" del form
  // (alta de un nuevo usuario / técnico)
  let nuevoUsuario: UsuarioParcial = {};

  // =========================================================
  // Parseo de formData
  // =========================================================
  //
  // formData es iterable como pares [key, value].
  // Cada `value` es un FormDataEntryValue (string | File),
  // pero en este caso esperamos strings de inputs text/checkbox.
  //
  // Recorremos todos los campos del formulario y clasificamos:
  //   - usuarios[i][campo] → va a usuarios[idx][campo]
  //   - nuevo[campo]       → va a nuevoUsuario[campo]
  //
  for (const [key, value] of form as unknown as Iterable<[string, FormDataEntryValue]>) {
    // Caso A: usuarios[<idx>][<campo>]
    // Ej: "usuarios[0][email]" = "tecnico@ejemplo.com"
    //     "usuarios[0][admin]" = "on"
    //     "usuarios[1][eliminar]" = "on"
    const match = key.match(/^usuarios\[(\d+)\]\[([a-zA-Z_]+)\]$/);

    if (match) {
      const idx = parseInt(match[1], 10);   // índice numérico
      const campo = match[2];               // nombre del campo ("email", "admin", ...)

      // Nos aseguramos de tener un objeto en esa posición
      if (!usuarios[idx]) usuarios[idx] = {};

      // Campos que tratamos como booleanos al parsear
      // (tildes de checkboxes en el formulario)
      const camposBooleanosExistente = [
        'dashboard',
        'tickets',
        'usuarios',
        'estadisticas',
        'admin',
        'eliminar',
      ];

      if (camposBooleanosExistente.includes(campo)) {
        // Convertimos el valor del checkbox a boolean real
        // - "on"   → true (checkbox marcado)
        // - "true" → true (por compat)
        // - todo lo demás → false
        const valStr = String(value);
        usuarios[idx][campo] =
          valStr === 'on' || valStr === 'true';
      } else {
        // Para otros campos (ej: email), guardamos el valor tal cual (string)
        usuarios[idx][campo] = value;
      }

      continue;
    }

    // Caso B: nuevo[<campo>]
    // Ej: "nuevo[email]"       = "nuevo@ejemplo.com"
    //     "nuevo[dashboard]"   = "on"
    //     "nuevo[estadisticas]"= "on"
    //
    // Esto representa un usuario que el admin quiere crear (o actualizar por upsert).
    const nuevoMatch = key.match(/^nuevo\[([a-zA-Z_]+)\]$/);

    if (nuevoMatch) {
      const campo = nuevoMatch[1];

      // Campos que deben transformarse en boolean (checkboxes)
      const camposBooleanosNuevo = [
        'dashboard',
        'tickets',
        'usuarios',
        'estadisticas',
        'admin',
      ];

      if (camposBooleanosNuevo.includes(campo)) {
        const valStr = String(value);
        nuevoUsuario[campo] =
          valStr === 'on' || valStr === 'true';
      } else {
        // Campos "normales" tipo email, etc.
        nuevoUsuario[campo] = value;
      }
    }
  }

  // =========================================================
  // 🔄 Actualizar usuarios existentes
  // =========================================================
  //
  // Para cada usuario ya existente:
  //   - Si trae `eliminar: true` y tiene email → lo borramos de la tabla usuarios_perfil
  //   - Sino → lo actualizamos con los nuevos permisos.
  //
  // Notas:
  // - El rol se decide en base a la flag "admin":
  //     admin === true  → rol 'admin'
  //     admin === false → rol 'tecnico'
  //
  for (const u of usuarios) {
    if (u.eliminar && u.email) {
      // El admin marcó "eliminar" este usuario:
      // hacemos DELETE en la tabla usuarios_perfil basándonos en su email.
      const { error } = await supabase
        .from('usuarios_perfil')
        .delete()
        .eq('email', u.email);

      if (error) {
        console.error(`Error eliminando usuario ${u.email}:`, error);
      }

      // Ya no seguimos con update para este usuario si se lo está eliminando.
      continue;
    }

    if (u.email) {
      // Armamos el rol a partir de admin
      const rol = u.admin ? 'admin' : 'tecnico';

      // Hacemos UPDATE del registro existente en usuarios_perfil.
      // Importante: usamos !! para asegurarnos de que sean booleans.
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

  // =========================================================
  // ➕ Agregar (o upsert) nuevo usuario
  // =========================================================
  //
  // Si en la sección "nuevo" del form vino un email,
  // creamos o actualizamos ese usuario en `usuarios_perfil`.
  //
  // Usamos upsert con `onConflict: 'email'`:
  //   - Si el email no existe → INSERT
  //   - Si ya existe         → UPDATE
  //
  if (nuevoUsuario.email) {
    const rol = nuevoUsuario.admin ? 'admin' : 'tecnico';

    const nuevoObjeto = {
      email: nuevoUsuario.email,
      rol,
      dashboard: !!nuevoUsuario.dashboard,
      tickets: !!nuevoUsuario.tickets,
      usuarios: !!nuevoUsuario.usuarios,
      estadisticas: !!nuevoUsuario.estadisticas,
      activo: true, // al crear uno nuevo, lo dejamos activo
    };

    const { error } = await supabase
      .from('usuarios_perfil')
      .upsert(nuevoObjeto, { onConflict: 'email' });

    if (error) {
      console.error(`Error agregando usuario ${nuevoUsuario.email}:`, error);
    }
  }

  // =========================================================
  // 🔁 Redirección final
  // =========================================================
  //
  // Después de procesar todo, devolvemos un redirect 302 hacia /usuarios.
  // Esto mantiene el flujo clásico de "guardar cambios → volver a la lista".
  //
  const url = new URL('/usuarios', request.url);
  return Response.redirect(url.toString(), 302);
}
