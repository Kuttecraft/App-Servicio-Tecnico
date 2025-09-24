// Gestiona la alerta y flujo de eliminación de usuarios en la gestión de permisos.
document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById('form-permisos');                   // formulario de permisos
  const btnEliminar = document.getElementById('btn-eliminar');             // botón "Eliminar seleccionados"
  const btnGuardar = form.querySelector('button[type="submit"]');          // botón "Guardar cambios"

  let puedeEliminar = false; // flag para confirmar que se pasó por el flujo de eliminar

  // Si hay checkboxes "eliminar" marcados pero no está autorizado → desactiva botón guardar
  function revisarEliminarMarcados() {
    const eliminarMarcados = form.querySelectorAll('.eliminar-checkbox:checked');
    if (eliminarMarcados.length > 0 && !puedeEliminar) {
      btnGuardar.disabled = true;
    } else {
      btnGuardar.disabled = false;
    }
  }

  // Detecta cambios en checkboxes de eliminar
  form.addEventListener('change', function(e) {
    if (e.target.classList.contains('eliminar-checkbox')) {
      // Siempre resetea la autorización al cambiar selección
      puedeEliminar = false;
      revisarEliminarMarcados();
    }
  });

  // Botón "Eliminar seleccionados": pide confirmación
  btnEliminar.addEventListener('click', function() {
    const eliminarMarcados = form.querySelectorAll('.eliminar-checkbox:checked');
    if (eliminarMarcados.length === 0) {
      alert('Seleccioná al menos un usuario para eliminar.');
      return;
    }
    if (confirm('¿Estás seguro que querés eliminar los usuarios seleccionados? Esta acción no se puede deshacer. Para confirmar, hacé clic en "Guardar cambios".')) {
      puedeEliminar = true;       // autoriza la eliminación
      btnGuardar.disabled = false;
      btnGuardar.focus();
    }
  });

  // Validación al enviar formulario
  form.addEventListener('submit', function(e) {
    const eliminarMarcados = form.querySelectorAll('.eliminar-checkbox:checked');
    if (eliminarMarcados.length > 0 && !puedeEliminar) {
      // Si hay usuarios para eliminar pero no confirmaron, bloquea submit
      e.preventDefault();
      alert('Si querés eliminar usuarios, primero presioná "Eliminar seleccionados" y confirmá la alerta.');
      return false;
    }
    // Si todo ok, resetea flag (por consistencia en reload)
    puedeEliminar = false;
  });

  // Al iniciar: revisa si había checkboxes marcados de antes
  revisarEliminarMarcados();
});
