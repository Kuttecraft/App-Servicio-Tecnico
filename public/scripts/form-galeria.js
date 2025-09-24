// Galería pública: miniaturas → imagen principal, con activo y cache-buster.
(function () {
  const main = document.getElementById('imagen-equipo'); // imagen principal
  const thumbsWrap = document.getElementById('thumbs');  // contenedor de miniaturas
  if (!main || !thumbsWrap) return;

  // Quita querystring de una URL (para comparar rutas limpias)
  const clean = (url) => (url || '').split('?')[0];

  // Marca una miniatura como activa (y desmarca el resto)
  function activarThumb(el) {
    thumbsWrap.querySelectorAll('.thumb.active').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
  }

  // Cambia la imagen principal y actualiza el activo; agrega cache-buster para forzar refresco
  function cambiarImagen(src, el) {
    main.src = `${src}?t=${Date.now()}`; // evita cache viejo
    activarThumb(el);
  }

  // Click en miniaturas → cambia imagen principal
  thumbsWrap.addEventListener('click', (e) => {
    const el = e.target.closest('.thumb');
    if (!el) return;
    const src = el.dataset.src || clean(el.getAttribute('src'));
    if (!src) return;
    cambiarImagen(src, el);
  });

  // Accesible con teclado: Enter o Espacio también cambia
  thumbsWrap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('.thumb');
    if (!el) return;
    e.preventDefault();
    const src = el.dataset.src || clean(el.getAttribute('src'));
    if (!src) return;
    cambiarImagen(src, el);
  });

  // Al cargar: marca activa la miniatura que coincide con la imagen principal
  const principalLimpia = clean(main.getAttribute('src')) || clean(main.currentSrc);
  const inicial = Array.from(thumbsWrap.querySelectorAll('.thumb'))
    .find(t => clean(t.dataset.src || t.getAttribute('src')) === principalLimpia);
  activarThumb(inicial);
})();
