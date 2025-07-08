// formUser-eliminar-user.js

document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById('form-permisos');
  const btnEliminar = document.getElementById('btn-eliminar');
  const btnGuardar = form.querySelector('button[type="submit"]');

  let puedeEliminar = false; // Variable de control

  // Por defecto, deshabilitar el botón "Guardar cambios" si hay alguna casilla "eliminar" marcada
  function revisarEliminarMarcados() {
    const eliminarMarcados = form.querySelectorAll('.eliminar-checkbox:checked');
    if (eliminarMarcados.length > 0 && !puedeEliminar) {
      btnGuardar.disabled = true;
    } else {
      btnGuardar.disabled = false;
    }
  }

  // Detecta cuando marcan/desmarcan eliminar (para controlar el botón guardar)
  form.addEventListener('change', function(e) {
    // Si cambió alguna casilla "eliminar", revisar estado
    if (e.target.classList.contains('eliminar-checkbox')) {
      puedeEliminar = false; // Se resetea la autorización al cambiar la selección
      revisarEliminarMarcados();
    }
  });

  // Botón "Eliminar seleccionados"
  btnEliminar.addEventListener('click', function() {
    const eliminarMarcados = form.querySelectorAll('.eliminar-checkbox:checked');
    if (eliminarMarcados.length === 0) {
      alert('Seleccioná al menos un usuario para eliminar.');
      return;
    }
    if (confirm('¿Estás seguro que querés eliminar los usuarios seleccionados? Esta acción no se puede deshacer. Para confirmar, hacé clic en "Guardar cambios".')) {
      puedeEliminar = true;
      btnGuardar.disabled = false;
      btnGuardar.focus();
    }
  });

  // Al intentar guardar cambios
  form.addEventListener('submit', function(e) {
    const eliminarMarcados = form.querySelectorAll('.eliminar-checkbox:checked');
    // Si hay eliminados pero no pasó por el botón eliminar
    if (eliminarMarcados.length > 0 && !puedeEliminar) {
      e.preventDefault();
      alert('Si querés eliminar usuarios, primero presioná "Eliminar seleccionados" y confirmá la alerta.');
      return false;
    }
    // Si no hay problema, deja continuar
    // Luego del submit, resetea el flag (en caso de reload)
    puedeEliminar = false;
  });

  // Al iniciar, revisar por si quedan marcados de antes
  revisarEliminarMarcados();
});
