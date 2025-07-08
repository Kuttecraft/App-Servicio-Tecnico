document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById('form-permisos');
  const btnEliminar = document.getElementById('btn-eliminar');

  if (btnEliminar && form) {
    btnEliminar.addEventListener('click', function() {
      const eliminarMarcados = form.querySelectorAll('.eliminar-checkbox:checked');
      if (eliminarMarcados.length === 0) {
        alert('Seleccioná al menos un usuario para eliminar.');
        return;
      }
      if (confirm('¿Estás seguro que querés eliminar los usuarios seleccionados? Esta acción no se puede deshacer.')) {
        form.submit();
      }
    });
  }
});
