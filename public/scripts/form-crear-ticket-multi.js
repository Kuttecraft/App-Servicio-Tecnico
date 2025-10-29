// form-crear-ticket-multi.js
//
// OBJETIVO GENERAL
// ----------------
// Este script maneja el flujo de carga de hasta 3 imágenes cuando el usuario crea un ticket:
//   1. Imagen principal (obligatoria / primera).
//   2. Imagen de ticket (extra opcional, aparece después de subir la principal).
//   3. Imagen extra adicional (aparece después de subir la de ticket).
//
// Cada imagen se:
//  - Comprime/convierte a WebP antes de enviarla, usando la librería imageCompression (si está disponible en window).
//  - Se previsualiza en su tile correspondiente.
//  - Reemplaza el archivo real del <input type="file"> con la versión comprimida,
//    para que el form mande el archivo optimizado al backend sin que el usuario tenga que hacer nada.
//
// UX IMPORTANTE
// -------------
// - El usuario primero ve sólo el tile principal.
// - Al subir imagen principal, aparece el tile "+" para agregar ticket.
// - Al subir imagen ticket, aparece el tile "+" para agregar extra.
// - Cada tile cargado muestra la preview y queda "reclickable": si hacés click otra vez en ese tile
//   cuando ya tiene imagen, vuelve a abrir el file picker para reemplazar la imagen.
//
// DEPENDENCIAS / EXPECTATIVAS DEL HTML
// ------------------------------------
// Se asume que existen elementos con estos IDs:
//   #tile-principal,      #imagenArchivo,           #previewPrincipal
//   #tile-plus-ticket,    #tile-ticket,             #imagenTicketArchivo,    #previewTicket
//   #tile-plus-extra,     #tile-extra,              #imagenExtraArchivo,     #previewExtra
//
// Y que la UI usa utilidades tipo Bootstrap:
//   - .d-none para ocultar
//   - .has-image para marcar visualmente que ya hay una imagen cargada
//
// También se asume que en algún <script> global ya cargaste la librería imageCompression
// (ej. con un CDN) y que está disponible en window.imageCompression.
// Si no está, el script sigue funcionando pero sube el archivo original sin comprimir.
//
// NOTA SOBRE COMPATIBILIDAD
// -------------------------
// Este script usa DataTransfer para reemplazar el archivo en un <input type="file">.
// Esto está soportado en la mayoría de navegadores modernos.
//
// NOTA DE SEGURIDAD
// -----------------
// No se hace validación de tipo/tamaño más allá de intentar compress.
// Podrías agregar validación de mime-type/tamaño máximo en cada change si querés forzar límites.
//

document.addEventListener('DOMContentLoaded', () => { 
  // =====================================================================
  // HELPERS DOM
  // =====================================================================

  // Atajo para querySelector. Importante: devuelve SOLO el primer match.
  const $ = (sel) => document.querySelector(sel);

  // Helpers para mostrar/ocultar elementos mediante la clase Bootstrap .d-none
  const show = (el) => el && el.classList.remove('d-none'); // saca .d-none
  const hide = (el) => el && el.classList.add('d-none');    // agrega .d-none


  // =====================================================================
  // REFERENCIAS A LOS ELEMENTOS DEL DOM
  // =====================================================================

  // ---- PRINCIPAL ----
  const tilePrincipal    = $('#tile-principal');      // Tile visual donde va la imagen principal (puede tener preview + botón)
  const inputPrincipal   = $('#imagenArchivo');       // <input type="file"> de la imagen principal
  const previewPrincipal = $('#previewPrincipal');    // <img> donde mostramos la preview de la principal

  // ---- TICKET ----
  const tilePlusTicket = $('#tile-plus-ticket');      // Tile tipo "+" que aparece para habilitar subir imagen de ticket
  const tileTicket     = $('#tile-ticket');           // Tile real del ticket (donde irá la previewTicket luego)
  const inputTicket    = $('#imagenTicketArchivo');   // <input type="file"> de imagen ticket
  const previewTicket  = $('#previewTicket');         // <img> preview de la imagen ticket

  // ---- EXTRA ----
  const tilePlusExtra = $('#tile-plus-extra');        // Tile "+" que aparece para habilitar imagen extra
  const tileExtra     = $('#tile-extra');             // Tile real de la imagen extra
  const inputExtra    = $('#imagenExtraArchivo');     // <input type="file"> de imagen extra
  const previewExtra  = $('#previewExtra');           // <img> preview de la imagen extra


  // =====================================================================
  // LÓGICA DE DESBLOQUEO PROGRESIVO DE TILES ("WIZARD" VISUAL)
  // =====================================================================

  // habilitarPlusTicket():
  // Se llama cuando ya tenemos imagen principal. Muestra el tile "+" para que el usuario
  // pueda cargar la imagen de ticket.
  const habilitarPlusTicket = () => {
    if (tilePlusTicket) {
      // Usamos display flex porque probablemente el "+" está maquetado como un cuadrito centrado.
      tilePlusTicket.style.display = 'flex';
    }
  };

  // habilitarPlusExtra():
  // Se llama cuando ya tenemos imagen de ticket. Muestra el "+" para la imagen extra.
  const habilitarPlusExtra = () => {
    if (tilePlusExtra) {
      tilePlusExtra.classList.remove('d-none'); // por si estaba oculto con d-none
      tilePlusExtra.style.display = 'flex';     // nos aseguramos que se vea
    }
  };


  // =====================================================================
  // INTERACCIÓN CON LOS TILES "+" (ticket y extra)
  // =====================================================================
  //
  // El patrón es:
  // - Usuario hace click en el tile "+".
  // - Ocultamos el "+" y mostramos el tile real (tileTicket / tileExtra).
  // - Forzamos el click en el <input type="file"> correspondiente para abrir el file picker inmediatamente.
  //

  // Click en el "+" para habilitar el tile TICKET:
  tilePlusTicket?.addEventListener('click', () => {
    hide(tilePlusTicket);                       // ocultamos el "+" porque ya vamos a tener un tile real
    tileTicket?.classList.remove('d-none');     // mostramos el tile real del ticket
    inputTicket?.click();                       // abrimos el dialog de archivos automáticamente
  });

  // Click en el "+" para habilitar el tile EXTRA:
  tilePlusExtra?.addEventListener('click', () => {
    hide(tilePlusExtra);                        // ocultamos el "+" extra
    tileExtra?.classList.remove('d-none');      // mostramos el tile real extra
    inputExtra?.click();                        // abrimos selector de archivo
  });


  // =====================================================================
  // UTILIDADES DE IMAGEN
  // =====================================================================

  // processFileToWebp(file):
  //
  // - Intenta comprimir/redimensionar el archivo de imagen usando la librería imageCompression
  //   (deben haberla expuesto en window.imageCompression desde un script CDN).
  //
  // - Convierte el resultado a formato WebP con un tamaño máximo aproximado (maxSizeMB)
  //   y tamaño máximo de lado (maxWidthOrHeight).
  //
  // - Devuelve un nuevo File en formato webp listo para subir.
  //
  // - Si algo falla (no hay librería, error al comprimir, etc.), devolvemos el original
  //   para no bloquear al usuario.
  //
  // - Si el archivo ya es WebP, preservamos el nombre original (o le ponemos .webp si hace falta).
  //
  async function processFileToWebp(file) {
    // Edge case: sin archivo o no es imagen
    if (!file || !file.type || !file.type.startsWith('image/')) return null;

    try {
      const options = {
        maxSizeMB: 2,                    // objetivo aproximado de peso final (en MB)
        maxWidthOrHeight: 1600,          // recorta la resolución máxima (ancho/alto máx)
        useWebWorker: true,              // si la lib lo soporta, corre en worker para no congelar la UI
        fileType: 'image/webp'           // forzamos salida WebP
      };

      const compressor = window.imageCompression; // librería externa opcional
      const processed = compressor ? await compressor(file, options) : file;

      // Chequeamos si el resultado ya es WebP o si el nombre original ya tenía .webp
      const alreadyWebp = processed.type === 'image/webp' || /\.webp$/i.test(file.name);

      // Generamos nombre final del archivo (cambiamos extensión a .webp si hace falta)
      const finalName = alreadyWebp
        ? file.name
        : file.name.replace(/\.[^.\s]+$/i, '.webp');

      // Creamos un nuevo File con el blob procesado. Esto es importante:
      // el input[type=file] guarda un FileList, y nosotros queremos reemplazar
      // ese FileList con este nuevo archivo optimizado.
      return new File([processed], finalName, { type: 'image/webp' });

    } catch (e) {
      // Si la compresión falla por cualquier motivo, preferimos NO romper el flujo.
      console.warn('Fallo compresión, uso original:', e);
      return file; // fallback: devolvemos el archivo original sin comprimir
    }
  }

  // replaceInputFile(input, file):
  //
  // Reemplaza programáticamente el archivo seleccionado en un <input type="file">
  // por uno nuevo (por ej. la versión comprimida WebP).
  //
  // Hacemos esto usando DataTransfer(), que nos deja crear un FileList artificial.
  //
  function replaceInputFile(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files; // sobrescribimos la FileList del input
  }

  // previewInto(imgEl, file, tileEl):
  //
  // - Genera un Data URL a partir del File usando FileReader
  //   y lo setea como src en una etiqueta <img> para previsualización.
  //
  // - Muestra esa <img> (por si estaba oculta).
  //
  // - Marca el tile con la clase .has-image para que
  //   la UI pueda cambiar (por ejemplo ocultar el texto "Subí una foto" y mostrar la foto).
  //
  function previewInto(imgEl, file, tileEl) {
    const reader = new FileReader();

    reader.onload = (e) => {
      imgEl.src = e.target.result;      // e.target.result = base64/dataURL de la imagen
      show(imgEl);                      // aseguramos que el <img> no esté oculto
      if (tileEl) tileEl.classList.add('has-image'); // visualmente marca que ya hay imagen
    };

    reader.readAsDataURL(file);
  }

  // enableClickToReopen(tileEl, inputEl):
  //
  // Este helper hace que, una vez que un tile ya tiene imagen (tileEl.classList.has-image),
  // puedas clickear de nuevo el tile para volver a abrir el selector de archivo y reemplazar la imagen.
  //
  // Por qué hace falta:
  //  - A veces el input[type=file] está oculto visualmente y sólo hay un <label for="...">.
  //  - Queremos que el usuario pueda tocar directamente la preview para volver a cambiar la foto
  //    sin tener que encontrar el label.
  //
  // Detalle:
  //  - Si el click fue sobre un <label> existente adentro del tile, NO hacemos nada,
  //    porque el label probablemente ya dispara input.click() por sí solo.
  //
  function enableClickToReopen(tileEl, inputEl) {
    if (!tileEl || !inputEl) return;

    tileEl.addEventListener('click', (ev) => {
      // Si el usuario clickeó específicamente en un <label>, dejamos que el label maneje el flujo normal
      if (ev.target.closest('label')) return;

      // Si el tile ya tiene imagen previa, permitimos reabrir el file picker
      if (tileEl.classList.contains('has-image')) {
        inputEl.click();
      }
    });
  }


  // =====================================================================
  // MANEJO DEL TILE PRINCIPAL
  // =====================================================================
  //
  // Flujo:
  // 1. Usuario elige archivo en inputPrincipal.
  // 2. Lo procesamos a WebP.
  // 3. Reemplazamos el File en el input por la versión WebP.
  // 4. Mostramos preview en previewPrincipal.
  // 5. Habilitamos el tile "+" para subir imagen de ticket.
  //
  enableClickToReopen(tilePrincipal, inputPrincipal);

  inputPrincipal?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return; // usuario canceló el diálogo

    const webp = await processFileToWebp(file);
    if (!webp) return; // no era imagen válida

    replaceInputFile(inputPrincipal, webp);              // reemplaza archivo original por WebP optimizado
    previewInto(previewPrincipal, webp, tilePrincipal);  // muestra la preview en el tile principal
    habilitarPlusTicket();                               // habilita el "+" para la imagen TICKET
  });


  // =====================================================================
  // MANEJO DEL TILE TICKET
  // =====================================================================
  //
  // Flujo similar al principal, pero además:
  // - Nos aseguramos de mostrar el tileTicket (por si venía oculto).
  // - Luego de subir ticket, habilitamos el "+" del extra.
  //
  enableClickToReopen(tileTicket, inputTicket);

  inputTicket?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const webp = await processFileToWebp(file);
    if (!webp) return;

    replaceInputFile(inputTicket, webp);
    tileTicket?.classList.remove('d-none');              // nos aseguramos de que el tile ticket esté visible
    previewInto(previewTicket, webp, tileTicket);
    habilitarPlusExtra();                                // habilita ahora el "+" del EXTRA
  });


  // =====================================================================
  // MANEJO DEL TILE EXTRA
  // =====================================================================
  //
  // Último paso de la cadena:
  // - Similar a los anteriores.
  // - No habilita nada más después, porque este es el último slot.
  //
  enableClickToReopen(tileExtra, inputExtra);

  inputExtra?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const webp = await processFileToWebp(file);
    if (!webp) return;

    replaceInputFile(inputExtra, webp);
    tileExtra?.classList.remove('d-none');               // mostramos el tile extra por si estaba oculto
    previewInto(previewExtra, webp, tileExtra);
  });

  // Fin DOMContentLoaded
});
