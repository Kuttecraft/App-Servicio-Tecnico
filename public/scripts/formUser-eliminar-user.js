// formUser-eliminar-user.js
//
// PROPÓSITO
// ---------
// Este script maneja el flujo seguro para eliminar usuarios desde un formulario
// de administración de permisos.
//
// Problema que resuelve:
// - No queremos que alguien simplemente marque "eliminar" en algunos usuarios,
//   haga clic en "Guardar cambios" por costumbre y, sin darse cuenta, los borre.
// - Queremos una confirmación explícita antes de permitir que se mande el form
//   cuando hay usuarios marcados para eliminar.
//
// ¿Cómo lo hace?
// 1. Si hay usuarios marcados para eliminar (checkbox .eliminar-checkbox checked),
//    el botón "Guardar cambios" se deshabilita automáticamente.
//
// 2. El admin tiene que hacer clic en "Eliminar seleccionados".
//    → Eso dispara un confirm(...).
//    → Si acepta, recién ahí se habilita "Guardar cambios".
//
// 3. Si intenta enviar el formulario sin haber pasado por la confirmación,
//    se bloquea el submit y se muestra un alert explicando qué hacer.
//
// Esto fuerza un doble paso para la eliminación, y evita deletes accidentales.
//
// SUPOSICIONES DEL HTML
// ---------------------
// - <form id="form-permisos"> ... </form>
// - Casillas de verificación con clase .eliminar-checkbox (una por cada usuario),
//   que indican "este usuario será eliminado si se confirma".
// - Un botón visible con id="btn-eliminar" que dice algo tipo "Eliminar seleccionados".
// - Un botón de submit dentro del form (por ejemplo "Guardar cambios").
//   Este se detecta con: form.querySelector('button[type="submit"]').
//   IMPORTANTE: ese botón es el que se habilita/deshabilita.
//
// FLUJO DEL USUARIO
// -----------------
// 1. Marca uno o más checkboxes .eliminar-checkbox.
// 2. Intenta guardar → el botón de guardar está deshabilitado hasta que confirme.
// 3. Clic en "Eliminar seleccionados" → confirm(...) de seguridad.
// 4. Si confirma → habilitamos guardar y seteamos una bandera interna `puedeEliminar = true`.
// 5. Al enviar el form, sólo dejamos mandar si puedeEliminar === true, o si no hay eliminaciones.
//
// Nota: `puedeEliminar` vive sólo en memoria JS. Si recargás la página, vuelve a false.
//       Eso es bueno, porque en cada vista nueva queremos reconfirmar.
//

document.addEventListener("DOMContentLoaded", function() {
  // Referencias básicas de la vista:
  const form = document.getElementById('form-permisos');                   // formulario principal que agrupa permisos y acciones
  const btnEliminar = document.getElementById('btn-eliminar');             // botón "Eliminar seleccionados"
  const btnGuardar = form.querySelector('button[type="submit"]');          // botón "Guardar cambios" (submit real del form)

  // Flag interno:
  //  - false → todavía NO se confirmó la eliminación.
  //  - true  → el admin ya confirmó via confirm() que quiere borrar los seleccionados.
  //
  // Esta variable es clave para que el flujo de confirmación sea obligatorio.
  let puedeEliminar = false;

  // revisarEliminarMarcados():
  // --------------------------
  // Revisa si hay usuarios marcados para eliminar (checkboxes con clase .eliminar-checkbox que estén checked).
  //
  // Comportamiento:
  // - Si hay al menos uno marcado y NO se hizo confirmación todavía (puedeEliminar === false),
  //   entonces deshabilitamos el botón "Guardar cambios".
  //
  // - En casos donde no hay nada marcado para eliminar, o sí hay marcados pero ya confirmamos,
  //   el botón Guardar se habilita.
  //
  // ¿Por qué esto importa?
  // Porque fuerza al usuario a pasar por el botón "Eliminar seleccionados" y aceptar el confirm()
  // ANTES de que pueda guardar cambios que impliquen borrado.
  function revisarEliminarMarcados() {
    const eliminarMarcados = form.querySelectorAll('.eliminar-checkbox:checked');

    if (eliminarMarcados.length > 0 && !puedeEliminar) {
      // Hay intención de borrar, pero todavía no confirmaron → bloquear guardar
      btnGuardar.disabled = true;
    } else {
      // No hay eliminación pendiente O ya confirmaron → permitimos guardar
      btnGuardar.disabled = false;
    }
  }

  // Listener de cambios en el formulario
  // ------------------------------------
  // Cada vez que se clickea/toggles un checkbox de eliminar, queremos:
  //   - Resetear la autorización (`puedeEliminar = false`) porque cambió la selección.
  //   - Recalcular si el botón "Guardar cambios" debe estar habilitado o no.
  //
  // Ejemplo:
  //   - Confirmaste para borrar 2 usuarios → puedeEliminar = true.
  //   - Luego marcás un tercero sin volver a confirmar → volvemos a bloquear el guardado,
  //     porque ahora la confirmación anterior ya no cubre la nueva selección.
  //
  form.addEventListener('change', function(e) {
    if (e.target.classList.contains('eliminar-checkbox')) {
      // Cada vez que el admin modifica qué usuarios quiere eliminar,
      // le pedimos que confirme de nuevo.
      puedeEliminar = false;
      revisarEliminarMarcados();
    }
  });

  // Botón "Eliminar seleccionados"
  // ------------------------------
  // Al hacer clic en este botón:
  //
  // 1. Chequeamos si hay al menos un checkbox de eliminación marcado.
  //    - Si no hay ninguno, avisamos con alert y no hacemos nada más.
  //
  // 2. Si sí hay:
  //    - Mostramos confirm(...) con advertencia.
  //    - Si el admin acepta:
  //        * seteamos puedeEliminar = true (queda "autorizada" la acción destructiva).
  //        * habilitamos el botón Guardar (btnGuardar.disabled = false).
  //        * le damos .focus() al botón Guardar para guiarlo al siguiente paso lógico.
  //
  btnEliminar.addEventListener('click', function() {
    const eliminarMarcados = form.querySelectorAll('.eliminar-checkbox:checked');

    if (eliminarMarcados.length === 0) {
      // Caso: apretaron "Eliminar seleccionados" pero no seleccionaron nada.
      alert('Seleccioná al menos un usuario para eliminar.');
      return;
    }

    // Confirmación destructiva:
    // Dejamos clarísimo que la acción no se puede deshacer y que
    // tienen que terminar el proceso apretando "Guardar cambios".
    if (confirm(
      '¿Estás seguro que querés eliminar los usuarios seleccionados? Esta acción no se puede deshacer. Para confirmar, hacé clic en "Guardar cambios".'
    )) {
      puedeEliminar = true;        // Marcamos que la eliminación está autorizada
      btnGuardar.disabled = false; // Permitimos guardar
      btnGuardar.focus();          // UX: llevamos el foco al botón de submit para acelerar el flujo
    }
  });

  // Validación final al hacer submit del formulario
  // -----------------------------------------------
  // Este es el último guardia:
  //
  // - Si NO hay usuarios marcados para eliminar → dejamos enviar normalmente.
  // - Si HAY usuarios marcados para eliminar PERO todavía no se hizo confirmación
  //   (o sea puedeEliminar === false) → bloqueamos el submit y avisamos.
  //
  // Esto cubre el caso en el que alguien trate de hacer submit manual
  // (ej: con Enter sobre otro campo) sin tocar "Eliminar seleccionados".
  //
  form.addEventListener('submit', function(e) {
    const eliminarMarcados = form.querySelectorAll('.eliminar-checkbox:checked');

    if (eliminarMarcados.length > 0 && !puedeEliminar) {
      // Hay eliminaciones marcadas pero no confirmadas → no dejamos enviar.
      e.preventDefault();
      alert('Si querés eliminar usuarios, primero presioná "Eliminar seleccionados" y confirmá la alerta.');
      return false;
    }

    // Si llegamos acá:
    // - No hay eliminación, o
    // - Sí hay eliminación y ya fue confirmada.
    //
    // Reseteamos la bandera a false por prolijidad, para evitar estados raros
    // si por alguna razón el form no recarga (SPA, etc.).
    puedeEliminar = false;
  });

  // Estado inicial al cargar la página
  // ----------------------------------
  // Imaginemos que la vista viene del servidor con algunas casillas ya marcadas
  // (por ejemplo, usuarios ya marcados para eliminar en un submit previo que volvió con error).
  //
  // Llamamos a revisarEliminarMarcados() apenas carga para asegurarnos de que
  // el botón "Guardar cambios" arranque en el estado correcto.
  revisarEliminarMarcados();
});
