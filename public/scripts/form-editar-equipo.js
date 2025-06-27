document.addEventListener('DOMContentLoaded', () => {
  const btnReemplazar = document.getElementById('btn-reemplazar-imagen');
  const inputBorrar = document.getElementById('input-borrar-imagen');
  const inputArchivo = document.getElementById('input-imagen-archivo');
  const btnGuardar = document.querySelector('button[type="submit"].btn-success');
  const form = document.getElementById('form-editar-equipo') || document.querySelector('form');

  // Botón para reemplazar imagen
  if (btnReemplazar && inputBorrar && inputArchivo) {
    btnReemplazar.addEventListener('click', (e) => {
      const respuesta = confirm("¿Seguro que querés reemplazar la imagen? Tendrás que elegir una nueva antes de guardar.");
      if (!respuesta) return;
      // Ocultar imagen si existe el contenedor
      const imagenActualContainer = document.getElementById('imagen-actual-container');
      if (imagenActualContainer) {
        imagenActualContainer.style.display = 'none';
      }
      inputArchivo.classList.remove('d-none');
      inputArchivo.style.display = '';
      inputBorrar.value = "true";
      validarGuardar();
    });
  }

  // Compresión y conversión de la imagen subida a WebP usando browser-image-compression
  inputArchivo?.addEventListener('change', async (event) => {
    const file = inputArchivo.files?.[0];
    if (!file) return;
    const options = {
      maxSizeMB: 0.09,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      fileType: 'image/webp'
    };
    try {
      // usa window.imageCompression (global del CDN)
      const compressedWebP = await window.imageCompression(file, options);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(
        new File([compressedWebP], file.name.replace(/\.(jpg|jpeg|png)$/i, '.webp'), {
          type: 'image/webp',
        })
      );
      inputArchivo.files = dataTransfer.files;
    } catch (error) {
      console.error('Error al comprimir/convertir imagen:', error);
    }
    validarGuardar();
  });

  function validarGuardar() {
    const reemplazando = !inputArchivo.classList.contains('d-none') && inputBorrar.value === "true";
    const archivoSubido = inputArchivo.files && inputArchivo.files.length > 0;
    btnGuardar.disabled = reemplazando && !archivoSubido;
  }

  inputArchivo?.addEventListener('change', validarGuardar);
  if (btnReemplazar) btnReemplazar.addEventListener('click', validarGuardar);
  validarGuardar();

  form?.addEventListener('submit', (e) => {
    const reemplazando = !inputArchivo.classList.contains('d-none') && inputBorrar.value === "true";
    const archivoSubido = inputArchivo.files && inputArchivo.files.length > 0;
    if (reemplazando && !archivoSubido) {
      e.preventDefault();
      alert('Tenés que elegir una nueva imagen antes de guardar los cambios.');
    }
  });
});
