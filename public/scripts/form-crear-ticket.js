document.addEventListener('DOMContentLoaded', () => {
  const input = document.querySelector('input[name="imagenArchivo"]');
  if (!input) return;

  input.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const options = {
      maxSizeMB: 0.09,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      fileType: 'image/webp'
    };

    try {
      const compressedWebP = await window.imageCompression(file, options);
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(
        new File([compressedWebP], file.name.replace(/\.(jpg|jpeg|png)$/i, '.webp'), {
          type: 'image/webp',
        })
      );
      input.files = dataTransfer.files;
      console.log('Imagen convertida a WebP:', input.files[0]);
    } catch (error) {
      console.error('Error al comprimir/convertir imagen:', error);
    }
  });
});
