// En edición: reemplaza, elimina o previsualiza imágenes (principal, ticket, extra).
function setupImageHandler(fileInputId, imgPreviewId, hiddenDeleteId, deleteButtonId) {
  const inputFile = document.getElementById(fileInputId);   // <input type="file">
  const img = document.getElementById(imgPreviewId);        // <img> preview actual
  const borrarInput = document.getElementById(hiddenDeleteId); // hidden que marca si borrar
  const btnEliminar = document.getElementById(deleteButtonId); // botón eliminar

  if (!img || !inputFile || !borrarInput || !btnEliminar) return;

  const originalSrc = img.getAttribute('src'); // guarda la imagen original

  // Valor coherente por defecto
  if (borrarInput.value !== 'delete') borrarInput.value = 'false';

  // Cuando se elige un archivo → preview (con compresión si está la librería imageCompression)
  inputFile.addEventListener('change', async (e) => {
    const file = e?.target?.files?.[0] || null;
    if (!file) {
      // Si se cancela, vuelve a la original
      img.src = originalSrc || img.src;
      return;
    }
    try {
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true };
      const compressed = window.imageCompression
        ? await window.imageCompression(file, options)
        : file;
      img.src = URL.createObjectURL(compressed);
    } catch {
      img.src = URL.createObjectURL(file);
    }
    borrarInput.value = 'false'; // hay archivo → no borrar
  });

  // Botón eliminar: marca delete y muestra imagen por defecto
  btnEliminar.addEventListener('click', () => {
    borrarInput.value = 'delete';
    img.src = '/logo.webp';  // imagen placeholder
    inputFile.value = '';
  });
}

// Configura handlers para cada tipo de imagen
// Principal
setupImageHandler('input-imagen-archivo', 'img-actual-o-preview', 'input-borrar-imagen', 'btn-eliminar-equipo');
// Ticket
setupImageHandler('input-imagen-ticket', 'img-ticket-preview', 'input-borrar-imagen-ticket', 'btn-eliminar-imagen-ticket');
// Extra
setupImageHandler('input-imagen-extra', 'img-extra-preview', 'input-borrar-imagen-extra', 'btn-eliminar-imagen-extra');
