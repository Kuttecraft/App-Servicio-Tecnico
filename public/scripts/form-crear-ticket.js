document.addEventListener('DOMContentLoaded', () => {
  const input = document.querySelector('input[name="imagenArchivo"]');
  const preview = document.getElementById('previewImagen'); // Este es el <img> de vista previa
  if (!input || !preview) return;

  input.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const options = {
      maxSizeMB: 0.1,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      fileType: 'image/webp'
    };

    try {
      const compressedWebP = await window.imageCompression(file, options);
      const renamedFile = new File([compressedWebP], file.name.replace(/\.(jpg|jpeg|png)$/i, '.webp'), {
        type: 'image/webp',
      });

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(renamedFile);
      input.files = dataTransfer.files;
      console.log('Imagen convertida a WebP:', input.files[0]);

      // Vista previa
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.classList.remove('d-none');
      };
      reader.readAsDataURL(renamedFile);

    } catch (error) {
      console.error('Error al comprimir/convertir imagen:', error);
    }
  });
});
