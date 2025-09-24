// Maneja carga múltiple de imágenes al crear ticket (principal, ticket, extra) con compresión WebP.
document.addEventListener('DOMContentLoaded', () => { 
  // Helpers DOM
  const $ = (sel) => document.querySelector(sel);                // atajo para querySelector
  const show = (el) => el && el.classList.remove('d-none');      // muestra un nodo (quita d-none)
  const hide = (el) => el && el.classList.add('d-none');         // oculta un nodo (agrega d-none)

  // ---- Tiles y elementos de PRINCIPAL ----
  const tilePrincipal    = $('#tile-principal');                  // contenedor visual del tile principal
  const inputPrincipal   = $('#imagenArchivo');                   // <input type="file"> principal
  const previewPrincipal = $('#previewPrincipal');                // <img> preview principal

  // ---- Tiles y elementos de TICKET ----
  const tilePlusTicket = $('#tile-plus-ticket');                  // tile "+" para habilitar imagen de ticket
  const tileTicket     = $('#tile-ticket');                       // contenedor del tile ticket
  const inputTicket    = $('#imagenTicketArchivo');               // <input type="file"> ticket
  const previewTicket  = $('#previewTicket');                     // <img> preview ticket

  // ---- Tiles y elementos de EXTRA ----
  const tilePlusExtra = $('#tile-plus-extra');                    // tile "+" para habilitar imagen extra
  const tileExtra     = $('#tile-extra');                         // contenedor del tile extra
  const inputExtra    = $('#imagenExtraArchivo');                 // <input type="file"> extra
  const previewExtra  = $('#previewExtra');                       // <img> preview extra

  // Mostrar "+" de ticket cuando hay principal
  const habilitarPlusTicket = () => {
    if (tilePlusTicket) {
      tilePlusTicket.style.display = 'flex';                      // hace visible el tile "+"
    }
  };

  // Mostrar "+" de extra cuando hay ticket
  const habilitarPlusExtra = () => {
    if (tilePlusExtra) {
      tilePlusExtra.classList.remove('d-none');                   // asegura que no esté oculto
      tilePlusExtra.style.display = 'flex';                       // y lo muestra
    }
  };

  // Click en "+" abre el file dialog para TICKET y muestra su tile
  tilePlusTicket?.addEventListener('click', () => {
    hide(tilePlusTicket);                                         // oculta el "+"
    tileTicket?.classList.remove('d-none');                       // muestra el tile de ticket
    inputTicket?.click();                                         // abre selector de archivo
  });

  // Click en "+" abre el file dialog para EXTRA y muestra su tile
  tilePlusExtra?.addEventListener('click', () => {
    hide(tilePlusExtra);                                          // oculta el "+"
    tileExtra?.classList.remove('d-none');                        // muestra el tile extra
    inputExtra?.click();                                          // abre selector de archivo
  });

  // ---- Utils de imagen ----
  async function processFileToWebp(file) {
    // Devuelve un File en formato WebP (si hay compresión) o el original si falla/ya es webp/no es imagen
    if (!file || !file.type || !file.type.startsWith('image/')) return null;
    try {
      const options = {
        maxSizeMB: 2,                                             // tamaño objetivo aprox
        maxWidthOrHeight: 1600,                                   // limita dimensión
        useWebWorker: true,                                       // mejor perf si la lib lo soporta
        fileType: 'image/webp'                                    // fuerza WebP
      };
      const compressor = window.imageCompression;                 // lib opcional (CDN)
      const processed = compressor ? await compressor(file, options) : file;
      const alreadyWebp = processed.type === 'image/webp' || /\.webp$/i.test(file.name);
      const finalName = alreadyWebp ? file.name : file.name.replace(/\.[^.\s]+$/i, '.webp');
      return new File([processed], finalName, { type: 'image/webp' });
    } catch (e) {
      console.warn('Fallo compresión, uso original:', e);         // si falla, seguimos con el original
      return file;
    }
  }

  function replaceInputFile(input, file) {
    // Reemplaza el archivo del input por el nuevo (WebP)
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  }

  function previewInto(imgEl, file, tileEl) {
    // Previsualiza la imagen y marca el tile como "con imagen"
    const reader = new FileReader();
    reader.onload = (e) => {
      imgEl.src = e.target.result;                                // data URL para preview
      show(imgEl);                                                // asegura que se vea
      if (tileEl) tileEl.classList.add('has-image');              // oculta botón "Subir imagen"
    };
    reader.readAsDataURL(file);
  }

  // Permitir clickear el tile con imagen para reabrir el selector (evita conflicto con label)
  function enableClickToReopen(tileEl, inputEl) {
    if (!tileEl || !inputEl) return;
    tileEl.addEventListener('click', (ev) => {
      if (ev.target.closest('label')) return;                     // si el click fue en el label, ignorar
      if (tileEl.classList.contains('has-image')) {
        inputEl.click();                                          // reabrir selector para reemplazar
      }
    });
  }

  // ---- PRINCIPAL ----
  enableClickToReopen(tilePrincipal, inputPrincipal);
  inputPrincipal?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const webp = await processFileToWebp(file);
    if (!webp) return;

    replaceInputFile(inputPrincipal, webp);                       // mete WebP al input
    previewInto(previewPrincipal, webp, tilePrincipal);           // preview y marca tile
    habilitarPlusTicket();                                        // habilita "+" de ticket
  });

  // ---- TICKET ----
  enableClickToReopen(tileTicket, inputTicket);
  inputTicket?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const webp = await processFileToWebp(file);
    if (!webp) return;

    replaceInputFile(inputTicket, webp);
    tileTicket?.classList.remove('d-none');                       // asegura visibilidad del tile
    previewInto(previewTicket, webp, tileTicket);
    habilitarPlusExtra();                                         // habilita "+" de extra
  });

  // ---- EXTRA ----
  enableClickToReopen(tileExtra, inputExtra);
  inputExtra?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const webp = await processFileToWebp(file);
    if (!webp) return;

    replaceInputFile(inputExtra, webp);
    tileExtra?.classList.remove('d-none');                        // asegura visibilidad del tile
    previewInto(previewExtra, webp, tileExtra);
  });
});
