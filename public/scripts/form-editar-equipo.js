document.addEventListener('DOMContentLoaded', () => {
  const inputArchivo = document.getElementById('input-imagen-archivo');
  const imgActualPreview = document.getElementById('img-actual-o-preview');
  const inputBorrar = document.getElementById('input-borrar-imagen');
  const btnEliminar = document.getElementById('btn-eliminar-equipo');
  const form = document.getElementById('form-editar-equipo') || document.querySelector('form');
  const btnGuardar = document.querySelector('button[type="submit"].btn-success, button[type="submit"].btn-primary');

  if (!inputArchivo) return;

  // Cambiar imagen (preview y compresión)
  inputArchivo.addEventListener('change', async () => {
    const file = inputArchivo.files?.[0];
    if (!file) {
      if (imgActualPreview) imgActualPreview.src = "/logo.webp";
      inputBorrar.value = "false";
      return;
    }
    mostrarPreview(file);
    inputBorrar.value = "true";
    // Compresión y conversión a WebP
    try {
      const compressedWebP = await window.imageCompression(file, {
        maxSizeMB: 0.09,
        maxWidthOrHeight: 500,
        useWebWorker: true,
        fileType: 'image/webp'
      });
      const renamedFile = new File([compressedWebP], file.name.replace(/\.(jpg|jpeg|png|webp)$/i, '.webp'), {
        type: 'image/webp',
      });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(renamedFile);
      inputArchivo.files = dataTransfer.files;
    } catch (error) {
      console.error('Error al comprimir/convertir imagen:', error);
    }
  });

  function mostrarPreview(file) {
    if (!imgActualPreview) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      imgActualPreview.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Eliminar imagen
  if (btnEliminar && inputBorrar) {
    btnEliminar.addEventListener('click', () => {
      const respuesta = confirm("¿Seguro que querés eliminar la imagen? Esta acción no se puede deshacer.");
      if (!respuesta) return;
      if (imgActualPreview) imgActualPreview.src = "/logo.webp";
      inputArchivo.value = "";
      inputBorrar.value = "delete";
      alert("La imagen será eliminada cuando guardes los cambios.");
    });
  }

  // Validación antes de enviar el form
  form?.addEventListener('submit', (e) => {
    // No es necesario más validación de reemplazo
  });
});
