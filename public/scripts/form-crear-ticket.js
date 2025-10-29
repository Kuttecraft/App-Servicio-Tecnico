// form-crear-ticket.js
//
// PROPÓSITO GENERAL
// -----------------
// Este script se encarga de interceptar la carga de imagen cuando el usuario
// está creando un ticket (formulario de alta).
//
// ¿Qué hace exactamente?
// 1. Toma el archivo subido por el usuario desde <input type="file" name="imagenArchivo">.
// 2. Intenta comprimirlo/redimensionarlo y convertirlo a formato WebP usando
//    la librería externa imageCompression (si está disponible en window.imageCompression).
// 3. Reemplaza el archivo original dentro del <input> por la versión WebP comprimida,
//    para que el form termine enviando esa imagen optimizada al backend,
//    sin que el usuario se entere ni tenga que hacer nada extra.
// 4. Muestra una vista previa (<img id="previewImagen">) de lo que efectivamente se va a subir.
// 5. Maneja casos de cancelación o archivos inválidos (no imagen).
//
// Este archivo es la versión "single image" (una sola imagen).
// En tu otro archivo form-crear-ticket-multi.js hacés algo parecido pero para 3 imágenes.
//
// DEPENDENCIAS / EXPECTATIVAS DEL DOM
// -----------------------------------
// - Debe existir un input file con name="imagenArchivo".
// - Debe existir un <img id="previewImagen"> que se usa para mostrar preview.
// - La clase .d-none se usa para ocultar la preview cuando no hay imagen válida.
// - Si la librería window.imageCompression NO está cargada, seguimos igual pero
//   sin comprimir ni convertir, usando el archivo original.
//
// NOTA SOBRE SEGURIDAD/PERFORMANCE
// --------------------------------
// - Usar WebP baja el peso del archivo y acelera el upload / reduce ancho de banda.
// - Se limita la resolución (maxWidthOrHeight) y el peso aproximado (maxSizeMB).
// - Se hace todo en el frontend antes de submit.
// - El try/catch garantiza que si la compresión explota, no rompemos la UX:
//   mostramos preview del archivo original y seguimos adelante.
//

document.addEventListener('DOMContentLoaded', () => {
  // Buscamos los elementos necesarios del formulario:
  // - input: el <input type="file" ...> que el usuario usa para elegir la imagen.
  // - preview: el <img> donde mostramos una vista previa de la imagen que se va a mandar.
  const input = document.querySelector('input[name="imagenArchivo"]'); // input de archivo principal
  const preview = document.getElementById('previewImagen');            // <img> para previsualización

  // Si falta alguno de los elementos (por ejemplo este JS se incluyó en una página
  // que no tiene el form), abortamos silenciosamente para no spamear errores en consola.
  if (!input || !preview) return;

  // Listener del cambio de archivo:
  // Esto se dispara cada vez que el usuario selecciona una imagen nueva desde el file picker.
  input.addEventListener('change', async (event) => {
    // Tomamos el primer archivo seleccionado (en este caso asumimos 1 archivo, no múltiples)
    const file = event.target.files && event.target.files[0];

    if (!file) {
      // Caso: el usuario abrió el file picker pero canceló sin elegir nada.
      // Limpiamos la preview:
      preview.classList.add('d-none');      // escondemos la imagen de preview
      preview.removeAttribute('src');       // borramos el src para que no quede imagen anterior
      return;
    }

    // Validación rápida: sólo aceptamos imágenes.
    // Si el usuario sube un PDF, ZIP, etc., lo rechazamos.
    if (!file.type.startsWith('image/')) {
      console.warn('Archivo no es imagen, se ignora.');
      input.value = '';                     // reseteamos el input para no mandar archivo inválido
      preview.classList.add('d-none');
      preview.removeAttribute('src');
      return;
    }

    // Opciones de compresión / resize:
    // - maxSizeMB: peso objetivo aproximado.
    // - maxWidthOrHeight: si la imagen es gigante, se escala para no exceder ese límite
    //   ni en ancho ni en alto (manteniendo proporción).
    // - useWebWorker: mejora performance en navegadores que soportan web workers.
    // - fileType: forzamos la conversión de salida a image/webp.
    const options = {
      maxSizeMB: 2,
      maxWidthOrHeight: 500,
      useWebWorker: true,
      fileType: 'image/webp'
    };

    try {
      // Tratamos de usar la librería externa imageCompression si está disponible.
      // Esta librería debería estar cargada globalmente como window.imageCompression
      // (por ejemplo por un <script src=".../browser-image-compression.js"></script>).
      //
      // Si no está, simplemente usamos el archivo original sin comprimir.
      const compressor = window.imageCompression;
      const processed = compressor ? await compressor(file, options) : file;

      // Renombrar el archivo para que termine con .webp si no lo era todavía.
      //
      // alreadyWebp:
      //  true si:
      //   - el mime type resultante ya es 'image/webp'
      //   - o el nombre original del archivo ya tenía extensión .webp
      //
      const alreadyWebp =
        processed.type === 'image/webp' ||
        /\.webp$/i.test(file.name);

      // finalName:
      //  - si ya era WebP, dejamos el nombre tal cual
      //  - si no, reemplazamos la extensión original por .webp
      //
      //  file.name.replace(/\.[^.\s]+$/i, '.webp'):
      //   - busca la última extensión tipo ".jpg" ".png" ".jpeg"
      //   - y la reemplaza por ".webp"
      const finalName = alreadyWebp
        ? file.name
        : file.name.replace(/\.[^.\s]+$/i, '.webp');

      // Creamos un nuevo File con el blob procesado, usando el nombre final
      // y forzando MIME type 'image/webp'. Este va a ser el archivo real que se envíe.
      const renamedFile = new File([processed], finalName, { type: 'image/webp' });

      // IMPORTANTE:
      // Reemplazamos el archivo dentro del input[type="file"] para que,
      // cuando se haga submit del formulario, el backend reciba "renamedFile"
      // y NO el archivo original sin comprimir.
      //
      // Para hacer esto usamos DataTransfer, que nos permite fabricar un FileList.
      const dt = new DataTransfer();
      dt.items.add(renamedFile);
      input.files = dt.files;

      // A partir de acá, input.files[0] es la versión optimizada (renamedFile),
      // no el archivo original grande.

      // Mostramos una vista previa usando FileReader:
      // - Convertimos el archivo final (el WebP comprimido) en un Data URL base64.
      // - Lo colocamos como src del <img id="previewImagen">.
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;      // e.target.result = data:image/webp;base64,...
        preview.classList.remove('d-none'); // aseguramos que la preview se vea
      };
      reader.readAsDataURL(renamedFile);

      console.log('Imagen lista para enviar:', input.files[0]);
      // Nota: este console.log ayuda en debug para chequear tamaño final, type, etc.

    } catch (error) {
      // Si algo dentro del try falla (por ejemplo, la librería explotó,
      // el navegador no soporta algo, etc.), no bloqueamos al usuario.
      // En vez de eso:
      // - usamos el archivo original SIN comprimir,
      // - mostramos preview con ese archivo.
      console.error('Error al comprimir/convertir imagen:', error);

      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.classList.remove('d-none');
      };
      reader.readAsDataURL(file);
      // Ojo: en este flujo alternativo NO reemplazamos input.files,
      // así que el backend recibiría el original.
    }
  });
});
