// public/scripts/ampliar-imagen.js
// Visor de imagen en pantalla completa con zoom, arrastre y cierre con Esc.
// Abre tanto desde el botón "Agrandar imagen" como desde el click en la imagen chica.

(function () {
  // Estilos del visor (se inyectan 1 sola vez)
  const css = `
  .visor-imagen__overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.85);
    display: none; z-index: 1050; /* por encima de la card */
  }
  .visor-imagen__inner {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .visor-imagen__img {
    max-width: 95vw; max-height: 90vh;
    border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.5);
    cursor: zoom-in; transition: transform .2s ease;
    user-select: none;
  }
  .visor-imagen__close {
    position: absolute; top: 16px; right: 16px;
    background: rgba(255,255,255,.15);
    border: 1px solid rgba(255,255,255,.35);
    color: #fff; padding: 8px 12px; border-radius: 8px;
    font-size: 14px; cursor: pointer; backdrop-filter: blur(4px);
  }
  .visor-imagen__close:hover { background: rgba(255,255,255,.25); }
  `;
  const style = document.createElement('style');
  style.innerHTML = css;
  document.head.appendChild(style);

  // Crea overlay
  const overlay = document.createElement('div');
  overlay.className = 'visor-imagen__overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="visor-imagen__inner">
      <img class="visor-imagen__img" alt="Vista ampliada" draggable="false"/>
      <button type="button" class="visor-imagen__close" aria-label="Cerrar (Esc)">✕ Cerrar</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const imgAmpliada = overlay.querySelector('.visor-imagen__img');
  const btnCerrar = overlay.querySelector('.visor-imagen__close');

  // Elementos de la página
  function $(id) { return document.getElementById(id); }
  const btnAbrir = $('btn-ampliar-imagen');
  const imgChica = $('imagen-equipo');

  if (!imgChica) return; // nada que hacer

  // Abrir visor
  function abrirVisor() {
    imgAmpliada.src = imgChica.currentSrc || imgChica.src;
    overlay.style.display = 'block';
    document.body.style.overflow = 'hidden';
    // reset zoom
    escala = 1; translateX = 0; translateY = 0; aplicarTransform();
  }

  // Cerrar visor
  function cerrarVisor() {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Abrir visor desde botón (si existe)
  if (btnAbrir) btnAbrir.addEventListener('click', abrirVisor);
  // Abrir visor también al hacer click sobre la imagen pequeña
  imgChica.addEventListener('click', abrirVisor);

  // Cerrar con botón
  btnCerrar.addEventListener('click', cerrarVisor);

  // Cerrar al clickear fuera de la imagen
  overlay.addEventListener('click', (e) => {
    const inner = overlay.querySelector('.visor-imagen__inner');
    if (!inner.contains(e.target) || e.target === overlay) cerrarVisor();
  });

  // Esc para cerrar
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.style.display === 'block') cerrarVisor();
  });

  // --- Zoom y arrastre ---
  let escala = 1;
  let translateX = 0, translateY = 0;
  let arrastrando = false, inicioX = 0, inicioY = 0;

  function aplicarTransform() {
    imgAmpliada.style.transform = `translate(${translateX}px, ${translateY}px) scale(${escala})`;
    imgAmpliada.style.cursor = escala > 1 ? 'grab' : 'zoom-in';
  }

  // Doble click: alternar zoom 1x / 2x
  imgAmpliada.addEventListener('dblclick', () => {
    if (escala === 1) escala = 2;
    else { escala = 1; translateX = 0; translateY = 0; }
    aplicarTransform();
  });

  // Rueda para zoom (en overlay para evitar scroll del body)
  overlay.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    const nueva = Math.min(4, Math.max(1, escala + (delta < 0 ? 0.2 : -0.2)));
    escala = parseFloat(nueva.toFixed(2));
    aplicarTransform();
  }, { passive: false });

  // Arrastrar cuando hay zoom
  imgAmpliada.addEventListener('mousedown', (e) => {
    if (escala === 1) return;
    arrastrando = true;
    imgAmpliada.style.cursor = 'grabbing';
    inicioX = e.clientX - translateX;
    inicioY = e.clientY - translateY;
  });
  window.addEventListener('mousemove', (e) => {
    if (!arrastrando) return;
    translateX = e.clientX - inicioX;
    translateY = e.clientY - inicioY;
    aplicarTransform();
  });
  window.addEventListener('mouseup', () => {
    arrastrando = false;
    if (escala > 1) imgAmpliada.style.cursor = 'grab';
  });
})();