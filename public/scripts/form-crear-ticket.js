document.addEventListener('DOMContentLoaded', () => {
  const input = document.querySelector('input[name="imagenArchivo"]');
  const preview = document.getElementById('previewImagen');
  if (!input || !preview) return;

  input.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      // Limpia preview si se canceló
      preview.classList.add('d-none');
      preview.removeAttribute('src');
      return;
    }

    // Aceptar solo imágenes
    if (!file.type.startsWith('image/')) {
      console.warn('Archivo no es imagen, se ignora.');
      input.value = '';
      preview.classList.add('d-none');
      preview.removeAttribute('src');
      return;
    }

    // Opciones de compresión/conversión
    const options = {
      maxSizeMB: 5,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      fileType: 'image/webp'
    };

    try {
      // Fallback si la librería no está disponible
      const compressor = window.imageCompression;
      const processed = compressor ? await compressor(file, options) : file;

      // Renombrar a .webp solo si no lo es ya
      const alreadyWebp = processed.type === 'image/webp' || /\.webp$/i.test(file.name);
      const finalName = alreadyWebp
        ? file.name
        : file.name.replace(/\.[^.\s]+$/i, '.webp'); // reemplaza última extensión

      const renamedFile = new File([processed], finalName, { type: 'image/webp' });

      // Reemplazar archivo en el input (para que el form envíe el WebP)
      const dt = new DataTransfer();
      dt.items.add(renamedFile);
      input.files = dt.files;

      // Preview
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.classList.remove('d-none');
      };
      reader.readAsDataURL(renamedFile);

      console.log('Imagen lista para enviar:', input.files[0]);
    } catch (error) {
      console.error('Error al comprimir/convertir imagen:', error);
      // Fallback: mostrar preview del archivo original
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.classList.remove('d-none');
      };
      reader.readAsDataURL(file);
    }
  });
});
