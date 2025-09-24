// Controla edición de equipo: reemplazo, eliminación y preview de imágenes en ticket.
document.addEventListener('DOMContentLoaded', () => {
  const inputArchivo = document.getElementById('input-imagen-archivo');          // <input type="file"> principal
  const imgActualPreview = document.getElementById('img-actual-o-preview');      // <img> preview actual
  const inputBorrar = document.getElementById('input-borrar-imagen');            // <input type="hidden"> (false|true|delete)
  const btnEliminar = document.getElementById('btn-eliminar-equipo');            // botón "Eliminar imagen"
  const form = document.getElementById('form-editar-equipo') || document.querySelector('form'); // form de edición
  const btnGuardar = document.querySelector('button[type="submit"].btn-success, button[type="submit"].btn-primary'); // botón guardar (si lo necesitás)

  if (!inputArchivo) return;

  // Cambiar imagen: muestra preview y marca que hay reemplazo
  inputArchivo.addEventListener('change', async () => {
    const file = inputArchivo.files?.[0];
    if (!file) {
      // Si se canceló la selección, vuelve al placeholder y limpia flag
      if (imgActualPreview) imgActualPreview.src = "/logo.webp";
      inputBorrar.value = "false";
      return;
    }
    // Preview inmediata
    mostrarPreview(file);
    // Marca que hay imagen nueva (servidor decide cómo manejarlo)
    inputBorrar.value = "true";

    // Compresión/Conversión a WebP (si existe window.imageCompression)
    try {
      const compressedWebP = await window.imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 500,
        useWebWorker: true,
        fileType: 'image/webp'
      });
      // Renombra a .webp para que el servidor reciba ese formato
      const renamedFile = new File([compressedWebP], file.name.replace(/\.(jpg|jpeg|png|webp)$/i, '.webp'), {
        type: 'image/webp',
      });
      // Sustituye el archivo del input por el nuevo WebP
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(renamedFile);
      inputArchivo.files = dataTransfer.files;
    } catch (error) {
      console.error('Error al comprimir/convertir imagen:', error);
      // Si falla, se envía el archivo original tal cual
    }
  });

  // Lee un File y lo pone en el <img> de preview
  function mostrarPreview(file) {
    if (!imgActualPreview) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      imgActualPreview.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Eliminar imagen: marca "delete" y muestra placeholder
  if (btnEliminar && inputBorrar) {
    btnEliminar.addEventListener('click', () => {
      const respuesta = confirm("¿Seguro que querés eliminar la imagen? Esta acción no se puede deshacer.");
      if (!respuesta) return;
      if (imgActualPreview) imgActualPreview.src = "/logo.webp";
      inputArchivo.value = "";
      inputBorrar.value = "delete"; // el backend borra cuando guarden
      alert("La imagen será eliminada cuando guardes los cambios.");
    });
  }

  // Hook de validación previo al submit (placeholder por si querés agregar checks)
  form?.addEventListener('submit', (e) => {
    // No es necesario más validación de reemplazo
  });
});
