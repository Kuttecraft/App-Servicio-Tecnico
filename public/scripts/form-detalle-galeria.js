// form-detalle-galeria.js
//
// PROPÓSITO
// ---------
// Este script maneja la galería de imágenes en la vista de "detalle".
// Tenés:
//   - Una imagen principal grande con id="imagen-equipo".
//   - Un contenedor de miniaturas con id="thumbs", que adentro tiene varias <img class="thumb">.
// 
// Lo que hace el script:
//   1. Cuando hacés click en una miniatura, actualiza la imagen principal con esa imagen.
//   2. También marca visualmente cuál miniatura está "activa" (clase .active).
//   3. Maneja accesibilidad por teclado: si la miniatura tiene foco y el usuario
//      presiona Enter o Space, también hace el cambio.
//   4. Agrega un "cache-buster" (?t=timestamp) para obligar a que el navegador
//      recargue una versión fresca de la imagen (útil si se reemplazó el archivo en el server
//      pero mantiene la misma URL).
//
// SUPOSICIONES DEL HTML
// ---------------------
// - #imagen-equipo es un <img> principal que muestra la imagen grande.
// - #thumbs es un contenedor que incluye varias <img class="thumb"> miniatura.
//   Cada miniatura DEBE tener un atributo data-src="URL_DE_LA_IMAGEN_GRANDE"
//   que apunta a la versión full que queremos mostrar en la principal.
//   Ejemplo de miniatura:
//     <img class="thumb active" src="/thumbs/123.webp" data-src="/full/123.webp" tabindex="0" />
//
// - .thumb.active debería estar estilado con borde/resaltado para indicar selección actual.
// - Idealmente las miniaturas tienen tabindex="0" para ser focusables con teclado, así
//   el listener de keydown abajo sirve también para accesibilidad.
//
// NOTA ACCESSIBILIDAD
// -------------------
// Este script soporta Enter y Space como activadores por teclado, lo cual es muy bueno
// para navegación sin mouse. También es bueno que las miniaturas sean focusables.
// A nivel ARIA, podrías considerar role="button" o role="radio" para mejorar
// el anuncio en lectores de pantalla, pero eso ya es tema del HTML, no de JS.
//
// NOTA CACHE-BUSTER
// -----------------
// swapTo() agrega "?t=<Date.now()>" al final del src de la imagen grande.
// Esto evita que el browser use una versión vieja en caché si en el server
// guardaste una nueva imagen con el mismo nombre/URL.
// Si tu backend YA versiona o firma las URLs (por hash), podrías omitir esto,
// pero dejarlo no hace daño salvo cache misses más frecuentes.
//

document.addEventListener('DOMContentLoaded', () => {
  // Referencias a:
  // - main: la imagen grande principal que se actualiza cuando elegimos otra miniatura
  // - thumbsWrap: el contenedor de las miniaturas clickeables
  const main = document.getElementById('imagen-equipo'); // <img> principal
  const thumbsWrap = document.getElementById('thumbs');  // contenedor de miniaturas (<div id="thumbs"> ... )
  if (!main || !thumbsWrap) return;
  // Si alguno no existe (por ejemplo, este script se cargó en otra página),
  // abortamos silenciosamente para evitar errores en consola.


  // setActiveThumb(target):
  // -----------------------
  // Quita la clase .active de TODAS las miniaturas actuales
  // y se la coloca sólo a la miniatura clickeada/elegida.
  //
  // Esto sirve para marcar visualmente cuál es la imagen que
  // está actualmente mostrada en la imagen principal.
  //
  function setActiveThumb(target) {
    // Sacamos 'active' de cualquier miniatura que la tenga
    thumbsWrap.querySelectorAll('.thumb.active').forEach(t => t.classList.remove('active'));

    // Agregamos 'active' sólo en la miniatura seleccionada
    target.classList.add('active');
  }


  // swapTo(src, imgEl, activeThumb):
  // --------------------------------
  // Cambia la imagen principal a una nueva URL.
  //
  // Parámetros:
  // - src: string. URL "base" de la imagen grande, tomada de data-src en la miniatura.
  // - imgEl: el elemento <img> principal que vamos a actualizar.
  // - activeThumb: la miniatura que activó el cambio (para marcarla con .active).
  //
  // Detalle técnico importante:
  // - Le agregamos un "cache buster" (query param t=timestamp actual).
  //   Esto fuerza que el navegador trate la URL como única cada vez y no use versión cacheada.
  //
  function swapTo(src, imgEl, activeThumb) {
    // cache-buster simple para evitar que el navegador use una versión vieja.
    // Date.now() retorna timestamp en ms desde el epoch.
    const bust = `?t=${Date.now()}`;

    // Actualizamos el src de la imagen principal.
    // Nota: Esto asume que `src` NO tenía ya query params.
    // Si los tuviera (ej "/foto.jpg?foo=bar"), esto lo pisaría.
    // Si eso es un tema, se podría mejorar detectando si hay "?" ya presente.
    imgEl.src = `${src}${bust}`;

    // Marcamos visualmente la miniatura clickeada como activa.
    if (activeThumb) setActiveThumb(activeThumb);
  }


  // EVENTO CLICK EN MINIATURAS
  // --------------------------
  // Delegamos el evento "click" en el contenedor thumbsWrap.
  // Esto es mejor que agregar un listener en cada miniatura individual,
  // porque escala mejor y funciona aunque se agreguen miniaturas dinámicamente.
  //
  // Flujo:
  // - Verificamos que el target real del click sea un <img>.
  // - Obtenemos la URL grande desde su data-src.
  // - Llamamos a swapTo() para actualizar la principal.
  //
  thumbsWrap.addEventListener('click', (e) => {
    const t = e.target;

    // Chequeamos que el clic haya sido sobre una miniatura <img>, no en el contenedor.
    if (!(t instanceof HTMLImageElement)) return;

    // data-src DEBE contener la URL de la imagen grande asociada a esa miniatura.
    const src = t.getAttribute('data-src');
    if (!src) return;

    swapTo(src, main, t);
  });


  // ACCESIBILIDAD POR TECLADO
  // -------------------------
  // Permitimos que también se pueda cambiar la imagen principal
  // usando teclado: Enter o Space (barra espaciadora) sobre una miniatura.
  //
  // Para que esto funcione:
  // - Las miniaturas deberían ser focusables (por ejemplo tabindex="0" en cada <img.thumb>).
  // - Opcionalmente podrías darle role="button" en el HTML para que lector de pantalla lo anuncie.
  //
  thumbsWrap.addEventListener('keydown', (e) => {
    // Aceptamos Enter ("Enter") y Espacio (" ")
    if (e.key !== 'Enter' && e.key !== ' ') return;

    const t = e.target;

    // Sólo actuamos si el foco actual está en una <img> thumbnail
    if (!(t instanceof HTMLImageElement)) return;

    const src = t.getAttribute('data-src');
    if (!src) return;

    // Evitamos que Space haga scroll de página o "click" default en algún browser raro
    e.preventDefault();

    swapTo(src, main, t);
  });
});
