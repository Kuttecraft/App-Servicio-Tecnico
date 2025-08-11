document.addEventListener('DOMContentLoaded', () => {
  const main = document.getElementById('imagen-equipo');
  const thumbsWrap = document.getElementById('thumbs');
  if (!main || !thumbsWrap) return;

  function setActiveThumb(target) {
    thumbsWrap.querySelectorAll('.thumb.active').forEach(t => t.classList.remove('active'));
    target.classList.add('active');
  }

  function swapTo(src, imgEl, activeThumb) {
    // cache-buster simple
    const bust = `?t=${Date.now()}`;
    imgEl.src = `${src}${bust}`;
    if (activeThumb) setActiveThumb(activeThumb);
  }

  // Click en miniatura
  thumbsWrap.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLImageElement)) return;
    const src = t.getAttribute('data-src');
    if (!src) return;
    swapTo(src, main, t);
  });

  // Enter/Espacio accesible
  thumbsWrap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target;
    if (!(t instanceof HTMLImageElement)) return;
    const src = t.getAttribute('data-src');
    if (!src) return;
    e.preventDefault();
    swapTo(src, main, t);
  });
});
