// Comprime la imagen al crear un ticket (convierte a WebP antes de enviar).
document.addEventListener('DOMContentLoaded', () => {
  const input = document.querySelector('input[name="imagenArchivo"]'); // input de archivo
  const preview = document.getElementById('previewImagen');            // imagen de preview
  if (!input || !preview) return;

  input.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      // Si se canceló, limpia la vista previa
      preview.classList.add('d-none');
      preview.removeAttribute('src');
      return;
    }

    // Solo aceptar imágenes
    if (!file.type.startsWith('image/')) {
      console.warn('Archivo no es imagen, se ignora.');
      input.value = '';
      preview.classList.add('d-none');
      preview.removeAttribute('src');
      return;
    }

    // Configuración para compresión y conversión a WebP
    const options = {
      maxSizeMB: 2,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      fileType: 'image/webp'
    };

    try {
      // Usa la librería imageCompression si está disponible, si no deja el archivo como está
      const compressor = window.imageCompression;
      const processed = compressor ? await compressor(file, options) : file;

      // Renombrar a .webp si no lo era ya
      const alreadyWebp = processed.type === 'image/webp' || /\.webp$/i.test(file.name);
      const finalName = alreadyWebp
        ? file.name
        : file.name.replace(/\.[^.\s]+$/i, '.webp');

      const renamedFile = new File([processed], finalName, { type: 'image/webp' });

      // Reemplazar el archivo en el input (el form enviará este WebP)
      const dt = new DataTransfer();
      dt.items.add(renamedFile);
      input.files = dt.files;

      // Mostrar preview de la imagen comprimida
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.classList.remove('d-none');
      };
      reader.readAsDataURL(renamedFile);

      console.log('Imagen lista para enviar:', input.files[0]);
    } catch (error) {
      console.error('Error al comprimir/convertir imagen:', error);
      // Si falla, muestra preview del archivo original
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.classList.remove('d-none');
      };
      reader.readAsDataURL(file);
    }
  });
});
