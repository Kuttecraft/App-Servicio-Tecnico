// form-ampliar-imagen.js
//
// OBJETIVO GENERAL
// ----------------
// Este script implementa un visor fullscreen (overlay modal) para una imagen principal
// con id="imagen-equipo". Al tocar/clickear esa imagen principal se abre un overlay negro
// a pantalla completa mostrando la imagen agrandada.
//
// FUNCIONALIDADES CLAVE
// ---------------------
// 1. Crea dinámicamente el overlay y el CSS necesario (no dependemos de CSS externo).
// 2. Bloquea el scroll del <body> mientras está abierto el visor.
// 3. Permite cerrar con:
//    - botón "✕ Cerrar",
//    - tecla Escape,
//    - click afuera de la imagen,
//    - click/tap en el fondo del overlay.
// 4. Permite zoom in / zoom out con doble click en desktop o doble tap rápido en mobile.
//    (Escala entre 1x y 2x).
// 5. Cambia el cursor entre zoom-in / zoom-out según el estado.
//
// DEPENDENCIAS / SUPOSICIONES
// ---------------------------
// - Debe existir un <img id="imagen-equipo" ...> en el DOM al momento de DOMContentLoaded.
// - No necesita Bootstrap ni librerías externas.
// - Usa estilos inyectados al vuelo, con una clase .is-open para mostrar/ocultar.
// - Usa currentSrc para respetar <img srcset> en navegadores modernos.
//
// NOTA IMPORTANTE
// ---------------
// Todo está envuelto en una IIFE + DOMContentLoaded para no ensuciar el scope global
// y asegurarnos de que el DOM esté listo antes de tocarlo.
//

(function () {
  // IIFE = Immediately Invoked Function Expression
  // Esto evita variables globales accidentales.

  document.addEventListener('DOMContentLoaded', () => {
    // =====================================================================
    // 1. INYECTAR CSS NECESARIO PARA EL VISOR
    // =====================================================================
    //
    // Creamos un <style> dinámicamente y lo metemos en <head>.
    // Esto asegura que el visor siempre tenga sus estilos aunque no estén en la hoja global.
    //
    const css = `
      /* Fondo fullscreen semitransparente oscuro */
      .visor-imagen__overlay {
        position: fixed;
        inset: 0; /* shorthand para top/right/bottom/left:0 */
        background: rgba(0,0,0,.85); /* fondo negro con opacidad */
        display: none; /* oculto por defecto */
        z-index: 1050; /* z-index alto para estar sobre casi todo */
      }

      /* Cuando el visor está abierto le agregamos .is-open */
      .visor-imagen__overlay.is-open {
        display: block;
      }

      /* Contenedor interno centrado */
      .visor-imagen__inner {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px; /* margen interno para que la imagen no toque los bordes de la pantalla */
      }

      /* La imagen ampliada */
      .visor-imagen__img {
        max-width: 95vw;  /* no exceder el ancho visible */
        max-height: 90vh; /* no exceder el alto visible */
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,.5); /* sombra para destacarla sobre el fondo oscuro */
        user-select: none; /* evita seleccionar la imagen al hacer doble click */
        cursor: zoom-in;   /* cursor inicial: zoom in */
        transition: transform .2s ease; /* animación suave al escalar */
        transform-origin: center center; /* el zoom parte del centro */
      }

      /* Botón de cerrar en la esquina superior derecha */
      .visor-imagen__close {
        position: absolute;
        top: 16px;
        right: 16px;
        background: rgba(255,255,255,.15); /* fondo translúcido blanco */
        border: 1px solid rgba(255,255,255,.35);
        color: #fff;
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        backdrop-filter: blur(4px); /* glassmorphism sutil */
      }

      /* Hover del botón cerrar (desktop principalmente) */
      .visor-imagen__close:hover {
        background: rgba(255,255,255,.25);
      }
    `;

    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    // Con esto, ya tenemos el CSS insertado en el documento sin depender de un archivo .css separado.


    // =====================================================================
    // 2. CREAR EL OVERLAY (HTML DEL VISOR) Y AGREGARLO AL <body>
    // =====================================================================
    //
    // Creamos el HTML con una estructura mínima:
    //
    // <div class="visor-imagen__overlay">
    //   <div class="visor-imagen__inner">
    //     <img class="visor-imagen__img" />
    //     <button class="visor-imagen__close">✕ Cerrar</button>
    //   </div>
    // </div>
    //
    // - .visor-imagen__overlay cubre TODA la pantalla.
    // - .visor-imagen__inner centra la imagen.
    // - .visor-imagen__img es la imagen grande.
    // - .visor-imagen__close es el botón flotante de cierre.
    //
    const overlay = document.createElement('div');
    overlay.className = 'visor-imagen__overlay';
    overlay.innerHTML = `
      <div class="visor-imagen__inner">
        <img class="visor-imagen__img" alt="Vista ampliada" draggable="false"/>
        <button type="button" class="visor-imagen__close" aria-label="Cerrar (Esc)">✕ Cerrar</button>
      </div>
    `;
    document.body.appendChild(overlay);
    // Lo dejamos ya en el DOM pero oculto (sin .is-open).


    // =====================================================================
    // 3. REFERENCIAS A ELEMENTOS CLAVE
    // =====================================================================
    //
    const imgZoom = overlay.querySelector('.visor-imagen__img');     // imagen grande dentro del overlay
    const btnCerrar = overlay.querySelector('.visor-imagen__close'); // botón "✕ Cerrar"
    const mainImg = document.getElementById('imagen-equipo');        // imagen en la página que el usuario ve inicialmente

    // Si por alguna razón la imagen principal no existe, abortamos.
    // Esto evita errores si este script se carga en una vista que NO tiene #imagen-equipo.
    if (!mainImg || !imgZoom || !btnCerrar) return;


    // =====================================================================
    // 4. MANEJO DEL ZOOM
    // =====================================================================
    //
    // Vamos a controlar una variable `escala` que determina el zoom actual.
    // - 1 => tamaño normal (ajustado a viewport)
    // - 2 => zoom in (doble tamaño visual con transform: scale(2))
    //
    let escala = 1;

    // aplicar():
    // Aplica la escala actual a la imagen ampliada y cambia el cursor.
    function aplicar() {
      imgZoom.style.transform = `scale(${escala})`;
      imgZoom.style.cursor = escala > 1 ? 'zoom-out' : 'zoom-in';
      // cursor dinámico según el modo:
      // - zoom-in cuando está en escala 1 (podés ampliar)
      // - zoom-out cuando está ampliado (podés volver)
    }


    // =====================================================================
    // 5. ABRIR EL VISOR
    // =====================================================================
    //
    // abrir():
    // - Copia la imagen actual (soporta currentSrc para <img srcset> responsive)
    // - Muestra el overlay agregando la clase .is-open
    // - Bloquea el scroll del body para que la página de atrás no se mueva
    // - Resetea el zoom a escala 1 cada vez que abrimos
    //
    function abrir() {
      // currentSrc es útil si la imagen original usa srcset y el browser eligió
      // una variante particular. Si no existe, fallback al src normal.
      imgZoom.src = mainImg.currentSrc || mainImg.src;

      overlay.classList.add('is-open');

      // Evitamos que el usuario haga scroll en el contenido detrás del overlay
      document.body.style.overflow = 'hidden';

      // Reseteamos el zoom cada vez que abrimos el visor
      escala = 1;
      aplicar();
    }


    // =====================================================================
    // 6. CERRAR EL VISOR
    // =====================================================================
    //
    // cerrar():
    // - Oculta el overlay removiendo .is-open
    // - Restaura el scroll normal del body
    //
    function cerrar() {
      overlay.classList.remove('is-open');
      document.body.style.overflow = '';
      // Importante: devolvemos overflow a '' (string vacío),
      // no a 'auto', porque quizás el body ya tenía un overflow custom
      // y no queremos pisarlo con algo fijo.
    }


    // =====================================================================
    // 7. BIND DE EVENTOS (ABRIR / CERRAR)
    // =====================================================================

    // Al hacer click en la imagen principal (#imagen-equipo), abrimos el visor fullscreen
    mainImg.addEventListener('click', abrir);

    // Click en el botón "✕ Cerrar" dentro del overlay => cerrar
    btnCerrar.addEventListener('click', cerrar);

    // Click en el overlay para cerrar si el usuario clickea "afuera"
    // (pero NO cerrar si el click fue sobre la imagen o sobre el contenido inner).
    overlay.addEventListener('click', (e) => {
      const inner = overlay.querySelector('.visor-imagen__inner');
      // Lógica:
      // - if (!inner.contains(e.target)) -> clickeó fuera del bloque inner
      // - OR e.target === overlay directamente (clickeó en el fondo negro)
      //
      // En cualquiera de esos casos cerramos.
      if (!inner || !inner.contains(e.target) || e.target === overlay) cerrar();
    });

    // Cerrar con la tecla Escape mientras el visor está abierto
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) cerrar();
    });


    // =====================================================================
    // 8. TOGGLE DE ZOOM (DOBLE CLICK / DOBLE TAP)
    // =====================================================================
    //
    // toggleZoom():
    // Cambia entre escala 1 y 2.
    //
    function toggleZoom() {
      escala = (escala === 1 ? 2 : 1);
      aplicar();
    }

    // Desktop / mouse: doble click hace zoom in/out
    imgZoom.addEventListener('dblclick', (e) => {
      e.preventDefault(); // prevenimos comportamiento raro de doble click (ej. seleccionar texto)
      toggleZoom();
    });

    // Mobile: no hay "dblclick" estándar igual de confiable, así que
    // hacemos una detección casera de "doble tap":
    //
    // - Guardamos timestamp del último tap (lastTap).
    // - Si el siguiente tap ocurre antes de 300ms, lo consideramos doble tap.
    //
    let lastTap = 0;
    imgZoom.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTap < 300) {
        // dos taps rápidos => alternamos zoom
        toggleZoom();
      }
      lastTap = now;
    });


    // =====================================================================
    // 9. PREVENIR SCROLL/ZOOM DE FONDO CUANDO EL OVERLAY ESTÁ ABIERTO
    // =====================================================================
    //
    // En móviles especialmente, hacer scroll con el overlay abierto puede
    // intentar hacer scroll del body o "zoom" del viewport. Acá bloqueamos
    // el comportamiento por defecto del scroll con la rueda/trackpad mientras
    // el overlay está activo.
    //
    // Nota: usamos { passive: false } porque queremos llamar e.preventDefault()
    // dentro del listener 'wheel'. Si fuera passive: true, eso tiraría warning.
    //
    overlay.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

    // Fin DOMContentLoaded
  });

// Fin IIFE raíz
})();
