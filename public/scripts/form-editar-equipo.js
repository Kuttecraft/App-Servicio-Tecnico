document.addEventListener('DOMContentLoaded', () => {
  const btnReemplazar = document.getElementById('btn-reemplazar-imagen');
  const btnEliminar = document.getElementById('btn-eliminar-equipo');
  const inputBorrar = document.getElementById('input-borrar-imagen');
  const inputArchivo = document.getElementById('input-imagen-archivo') || document.getElementById('imagenArchivo');
  const imgActualPreview = document.getElementById('img-actual-o-preview');
  const btnGuardar = document.querySelector('button[type="submit"].btn-success, button[type="submit"].btn-primary');
  const form = document.getElementById('form-editar-equipo') || document.querySelector('form');
  const imagenActualContainer = document.getElementById('imagen-actual-container');

  // Botón para reemplazar imagen
  if (btnReemplazar && inputBorrar && inputArchivo) {
    btnReemplazar.addEventListener('click', () => {
      const respuesta = confirm("¿Seguro que querés reemplazar la imagen? Tendrás que elegir una nueva antes de guardar.");
      if (!respuesta) return;
      // Limpia input y preview
      inputArchivo.value = "";
      if (imgActualPreview) imgActualPreview.src = "#"; // Oculta temporalmente hasta elegir una nueva
      inputArchivo.classList.remove('d-none');
      inputArchivo.style.display = '';
      inputBorrar.value = "true";
      validarGuardar();
    });
  }

  // Botón para eliminar imagen
  if (btnEliminar && inputBorrar && inputArchivo) {
    btnEliminar.addEventListener('click', () => {
      const respuesta = confirm("¿Seguro que querés eliminar la imagen? Esta acción no se puede deshacer.");
      if (!respuesta) return;
      // Limpia input y oculta imagen
      inputArchivo.value = "";
      if (imgActualPreview) {
        imgActualPreview.src = "#";
        imgActualPreview.style.display = 'none';
      }
      inputArchivo.classList.add('d-none');
      inputArchivo.style.display = 'none';
      inputBorrar.value = "delete";
      validarGuardar();
      alert("La imagen será eliminada cuando guardes los cambios.");
    });
  }

  // Compresión + Vista Previa sobre la imagen principal
  inputArchivo?.addEventListener('change', async (event) => {
    const file = inputArchivo.files?.[0];
    if (!file) {
      if (imgActualPreview) imgActualPreview.src = "#";
      return;
    }

    // Vista previa (antes de comprimir)
    mostrarPreview(file);

    // Compresión y conversión a WebP
    const options = {
      maxSizeMB: 0.09,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      fileType: 'image/webp'
    };
    try {
      const compressedWebP = await window.imageCompression(file, options);
      const renamedFile = new File([compressedWebP], file.name.replace(/\.(jpg|jpeg|png|webp)$/i, '.webp'), {
        type: 'image/webp',
      });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(renamedFile);
      inputArchivo.files = dataTransfer.files;
    } catch (error) {
      console.error('Error al comprimir/convertir imagen:', error);
    }
    validarGuardar();
  });

  function mostrarPreview(file) {
    if (!imgActualPreview) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      imgActualPreview.src = e.target.result;
      imgActualPreview.style.display = '';
    };
    reader.readAsDataURL(file);
  }

  function validarGuardar() {
    const reemplazando = !inputArchivo.classList.contains('d-none') && inputBorrar && inputBorrar.value === "true";
    const eliminando = inputBorrar && inputBorrar.value === "delete";
    const archivoSubido = inputArchivo.files && inputArchivo.files.length > 0;
    if (btnGuardar) {
      btnGuardar.disabled = (reemplazando && !archivoSubido);
    }
  }

  inputArchivo?.addEventListener('change', validarGuardar);
  if (btnReemplazar) btnReemplazar.addEventListener('click', validarGuardar);
  if (btnEliminar) btnEliminar.addEventListener('click', validarGuardar);
  validarGuardar();

  // Validación antes de enviar el form
  form?.addEventListener('submit', (e) => {
    const reemplazando = !inputArchivo.classList.contains('d-none') && inputBorrar && inputBorrar.value === "true";
    const archivoSubido = inputArchivo.files && inputArchivo.files.length > 0;
    if (reemplazando && !archivoSubido) {
      e.preventDefault();
      alert('Tenés que elegir una nueva imagen antes de guardar los cambios.');
    }
    // Si elimina, permite guardar
  });
});
