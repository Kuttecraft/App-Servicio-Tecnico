document.addEventListener('DOMContentLoaded', () => {
  // Helpers DOM
  const $ = (sel) => document.querySelector(sel);
  const show = (el) => el && el.classList.remove('d-none');
  const hide = (el) => el && el.classList.add('d-none');

  // Tiles y elementos
  const tilePrincipal   = $('#tile-principal');
  const inputPrincipal  = $('#imagenArchivo');
  const previewPrincipal= $('#previewPrincipal');

  const tilePlusTicket  = $('#tile-plus-ticket');
  const tileTicket      = $('#tile-ticket');
  const inputTicket     = $('#imagenTicketArchivo');
  const previewTicket   = $('#previewTicket');

  const tilePlusExtra   = $('#tile-plus-extra');
  const tileExtra       = $('#tile-extra');
  const inputExtra      = $('#imagenExtraArchivo');
  const previewExtra    = $('#previewExtra');

  // Mostrar "+" de ticket cuando hay principal
  const habilitarPlusTicket = () => {
    if (tilePlusTicket) {
      tilePlusTicket.style.display = 'flex';
    }
  };
  // Mostrar "+" de extra cuando hay ticket
  const habilitarPlusExtra = () => {
    if (tilePlusExtra) {
      tilePlusExtra.classList.remove('d-none');
      tilePlusExtra.style.display = 'flex';
    }
  };

  // Click en "+" abre el file dialog y muestra el tile correspondiente
  tilePlusTicket?.addEventListener('click', () => {
    hide(tilePlusTicket);
    tileTicket?.classList.remove('d-none');
    inputTicket?.click();
  });

  tilePlusExtra?.addEventListener('click', () => {
    hide(tilePlusExtra);
    tileExtra?.classList.remove('d-none');
    inputExtra?.click();
  });

  // ---- Utils de imagen ----
  async function processFileToWebp(file) {
    if (!file || !file.type || !file.type.startsWith('image/')) return null;
    try {
      const options = {
        maxSizeMB: 5,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: 'image/webp'
      };
      const compressor = window.imageCompression;
      const processed = compressor ? await compressor(file, options) : file;
      const alreadyWebp = processed.type === 'image/webp' || /\.webp$/i.test(file.name);
      const finalName = alreadyWebp ? file.name : file.name.replace(/\.[^.\s]+$/i, '.webp');
      return new File([processed], finalName, { type: 'image/webp' });
    } catch (e) {
      console.warn('Fallo compresión, uso original:', e);
      return file;
    }
  }

  function replaceInputFile(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  }

  function previewInto(imgEl, file, tileEl) {
    const reader = new FileReader();
    reader.onload = (e) => {
      imgEl.src = e.target.result;
      show(imgEl);
      if (tileEl) tileEl.classList.add('has-image'); // ✅ oculta el botón "Subir imagen"
    };
    reader.readAsDataURL(file);
  }

  // Permitir clickear el tile (cuando ya tiene imagen) para reabrir el selector
  function enableClickToReopen(tileEl, inputEl) {
    if (!tileEl || !inputEl) return;
    tileEl.addEventListener('click', (ev) => {
      // Evita conflicto cuando el click fue sobre el label/botón inicial
      if (ev.target.closest('label')) return;
      if (tileEl.classList.contains('has-image')) {
        inputEl.click();
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

    replaceInputFile(inputPrincipal, webp);
    previewInto(previewPrincipal, webp, tilePrincipal);
    habilitarPlusTicket();
  });

  // ---- TICKET ----
  enableClickToReopen(tileTicket, inputTicket);
  inputTicket?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const webp = await processFileToWebp(file);
    if (!webp) return;

    replaceInputFile(inputTicket, webp);
    tileTicket?.classList.remove('d-none');
    previewInto(previewTicket, webp, tileTicket);
    habilitarPlusExtra();
  });

  // ---- EXTRA ----
  enableClickToReopen(tileExtra, inputExtra);
  inputExtra?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const webp = await processFileToWebp(file);
    if (!webp) return;

    replaceInputFile(inputExtra, webp);
    tileExtra?.classList.remove('d-none');
    previewInto(previewExtra, webp, tileExtra);
  });
});
