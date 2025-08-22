function setupImageHandler(fileInputId, imgPreviewId, hiddenDeleteId, deleteButtonId) {
  const inputFile = document.getElementById(fileInputId);
  const img = document.getElementById(imgPreviewId);
  const borrarInput = document.getElementById(hiddenDeleteId);
  const btnEliminar = document.getElementById(deleteButtonId);

  if (!img || !inputFile || !borrarInput || !btnEliminar) return;

  const originalSrc = img.getAttribute('src');

  // Valor coherente por defecto
  if (borrarInput.value !== 'delete') borrarInput.value = 'false';

  // Elegir archivo -> preview (con compresión si la lib está)
  inputFile.addEventListener('change', async (e) => {
    const file = e?.target?.files?.[0] || null;
    if (!file) {
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
    borrarInput.value = 'false'; // hay archivo => no borrar
  });

  // Botón eliminar
  btnEliminar.addEventListener('click', () => {
    borrarInput.value = 'delete';
    img.src = '/logo.webp';
    inputFile.value = '';
  });
}

// Principal
setupImageHandler('input-imagen-archivo', 'img-actual-o-preview', 'input-borrar-imagen', 'btn-eliminar-equipo');
// Ticket
setupImageHandler('input-imagen-ticket', 'img-ticket-preview', 'input-borrar-imagen-ticket', 'btn-eliminar-imagen-ticket');
// Extra
setupImageHandler('input-imagen-extra', 'img-extra-preview', 'input-borrar-imagen-extra', 'btn-eliminar-imagen-extra');
