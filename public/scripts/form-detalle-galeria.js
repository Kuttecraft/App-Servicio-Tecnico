// Cambia la imagen principal desde miniaturas en detalle (click o teclado, con cache-buster).
document.addEventListener('DOMContentLoaded', () => {
  const main = document.getElementById('imagen-equipo'); // imagen principal
  const thumbsWrap = document.getElementById('thumbs');  // contenedor de miniaturas
  if (!main || !thumbsWrap) return;

  // Marca visualmente qué miniatura está activa
  function setActiveThumb(target) {
    thumbsWrap.querySelectorAll('.thumb.active').forEach(t => t.classList.remove('active'));
    target.classList.add('active');
  }

  // Cambia la imagen principal y actualiza la miniatura activa
  function swapTo(src, imgEl, activeThumb) {
    // cache-buster simple para evitar mostrar imagen vieja del caché
    const bust = `?t=${Date.now()}`;
    imgEl.src = `${src}${bust}`;
    if (activeThumb) setActiveThumb(activeThumb);
  }

  // Click en miniatura → cambia imagen principal
  thumbsWrap.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLImageElement)) return;
    const src = t.getAttribute('data-src');
    if (!src) return;
    swapTo(src, main, t);
  });

  // Accesibilidad: Enter/Espacio sobre miniatura también cambia imagen
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
