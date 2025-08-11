// Requiere que en la página se cargue antes browser-image-compression (CDN) con defer.
// IDs esperados en el DOM por cada bloque:

function setupImageHandler(fileInputId, imgPreviewId, hiddenDeleteId, deleteButtonId) {
  const inputFile = document.getElementById(fileInputId);
  const img = document.getElementById(imgPreviewId);
  const borrarInput = document.getElementById(hiddenDeleteId);
  const btnEliminar = document.getElementById(deleteButtonId);
  const originalSrc = img ? img.getAttribute('src') : null;

  if (!img || !inputFile || !borrarInput || !btnEliminar) return;

  // Cambio de archivo -> preview (con compresión si está disponible)
  inputFile.addEventListener('change', async (e) => {
    const file = e.target && e.target.files ? e.target.files[0] : null;
    if (!file) {
      img.src = originalSrc || img.src;
      return;
    }
    try {
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true };
      // Si la librería no está, cae al catch
      const compressed = window.imageCompression
        ? await window.imageCompression(file, options)
        : file;
      img.src = URL.createObjectURL(compressed);
    } catch {
      img.src = URL.createObjectURL(file);
    }
    borrarInput.value = "false";
  });

  // Eliminar imagen -> setear flag hidden y limpiar input
  btnEliminar.addEventListener('click', () => {
    borrarInput.value = "true";
    img.src = '/logo.webp';
    inputFile.value = "";
  });
}

// Principal
setupImageHandler('input-imagen-archivo', 'img-actual-o-preview', 'input-borrar-imagen', 'btn-eliminar-equipo');

// Ticket
setupImageHandler('input-imagen-ticket', 'img-ticket-preview', 'input-borrar-imagen-ticket', 'btn-eliminar-imagen-ticket');

// Extra
setupImageHandler('input-imagen-extra', 'img-extra-preview', 'input-borrar-imagen-extra', 'btn-eliminar-imagen-extra');
