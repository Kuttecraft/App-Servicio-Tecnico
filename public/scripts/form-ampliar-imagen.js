// Visor a pantalla completa para la imagen principal (#imagen-equipo)
// Click en la imagen -> abre visor
// Doble click / doble toque -> zoom 2x o vuelve a 1x
// Esc, botón o clic afuera -> cerrar

(function () {
  document.addEventListener('DOMContentLoaded', () => {
    // Estilos inyectados
    const css = `
      .visor-imagen__overlay {
        position: fixed; inset: 0;
        background: rgba(0,0,0,.85);
        display: none; z-index: 1050;
      }
      .visor-imagen__overlay.is-open { display: block; }
      .visor-imagen__inner {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
      }
      .visor-imagen__img {
        max-width: 95vw; max-height: 90vh;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,.5);
        user-select: none;
        cursor: zoom-in;
        transition: transform .2s ease;
        transform-origin: center center;
      }
      .visor-imagen__close {
        position: absolute; top: 16px; right: 16px;
        background: rgba(255,255,255,.15);
        border: 1px solid rgba(255,255,255,.35);
        color: #fff; padding: 8px 12px; border-radius: 8px;
        font-size: 14px; cursor: pointer;
        backdrop-filter: blur(4px);
      }
      .visor-imagen__close:hover { background: rgba(255,255,255,.25); }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'visor-imagen__overlay';
    overlay.innerHTML = `
      <div class="visor-imagen__inner">
        <img class="visor-imagen__img" alt="Vista ampliada" draggable="false"/>
        <button type="button" class="visor-imagen__close" aria-label="Cerrar (Esc)">✕ Cerrar</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const imgZoom = overlay.querySelector('.visor-imagen__img');
    const btnCerrar = overlay.querySelector('.visor-imagen__close');
    const mainImg = document.getElementById('imagen-equipo');

    if (!mainImg) return;

    let escala = 1;
    function aplicar() {
      imgZoom.style.transform = `scale(${escala})`;
      imgZoom.style.cursor = escala > 1 ? 'zoom-out' : 'zoom-in';
    }

    // Abrir visor desde la imagen principal
    function abrir() {
      imgZoom.src = mainImg.currentSrc || mainImg.src;
      overlay.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      escala = 1; aplicar();
    }

    // Cerrar visor
    function cerrar() {
      overlay.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    mainImg.addEventListener('click', abrir);
    btnCerrar.addEventListener('click', cerrar);
    overlay.addEventListener('click', (e) => {
      const inner = overlay.querySelector('.visor-imagen__inner');
      if (!inner.contains(e.target) || e.target === overlay) cerrar();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) cerrar();
    });

    // Doble click o doble toque para zoom
    function toggleZoom() {
      escala = (escala === 1 ? 2 : 1);
      aplicar();
    }
    imgZoom.addEventListener('dblclick', (e) => { e.preventDefault(); toggleZoom(); });

    let lastTap = 0;
    imgZoom.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTap < 300) toggleZoom();
      lastTap = now;
    });

    // Evitar scroll de fondo
    overlay.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  });
})();
