// public/scripts/form-galeria.js
// Miniaturas → imagen principal (con soporte teclado y cache-buster)

(function () {
  const main = document.getElementById('imagen-equipo');
  const thumbsWrap = document.getElementById('thumbs');
  if (!main || !thumbsWrap) return;

  const clean = (url) => (url || '').split('?')[0];

  function activarThumb(el) {
    thumbsWrap.querySelectorAll('.thumb.active').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
  }

  function cambiarImagen(src, el) {
    main.src = `${src}?t=${Date.now()}`; // evita cache viejo
    activarThumb(el);
  }

  // Click en miniaturas
  thumbsWrap.addEventListener('click', (e) => {
    const el = e.target.closest('.thumb');
    if (!el) return;
    const src = el.dataset.src || clean(el.getAttribute('src'));
    if (!src) return;
    cambiarImagen(src, el);
  });

  // Teclado (Enter/Espacio)
  thumbsWrap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('.thumb');
    if (!el) return;
    e.preventDefault();
    const src = el.dataset.src || clean(el.getAttribute('src'));
    if (!src) return;
    cambiarImagen(src, el);
  });

  // Marcar activa la miniatura que coincide con la principal al cargar
  const principalLimpia = clean(main.getAttribute('src')) || clean(main.currentSrc);
  const inicial = Array.from(thumbsWrap.querySelectorAll('.thumb'))
    .find(t => clean(t.dataset.src || t.getAttribute('src')) === principalLimpia);
  activarThumb(inicial);
})();
