// form-galeria.js
//
// PROPÓSITO
// ---------
// Este script controla una galería de imágenes pública tipo "detalle de producto / equipo":
// - Hay una imagen principal grande con id="imagen-equipo".
// - Hay una tira de miniaturas dentro de #thumbs, cada una con clase .thumb.
//
// Funcionalidad que aporta:
// 1. Cuando el usuario hace click en una miniatura, actualiza la imagen principal.
// 2. Marca visualmente cuál miniatura está "activa" (clase .active).
// 3. Soporta navegación con teclado (Enter / Espacio sobre una miniatura).
// 4. Evita problemas de caché agregando un cache-buster (?t=timestamp) al src
//    de la imagen principal en cada cambio. Esto fuerza al navegador a recargar
//    la imagen incluso si el archivo en el servidor se reemplazó manteniendo el mismo nombre.
// 5. Al cargar la página, determina cuál miniatura corresponde actualmente
//    a la imagen grande y la marca como activa.
//
// SUPOSICIONES DEL HTML
// ---------------------
// - <img id="imagen-equipo" src="..."> es la imagen grande.
// - <div id="thumbs"> ... </div> contiene varias miniaturas .thumb.
//   Ejemplo típico de miniatura:
//     <img class="thumb active" src="/imgs/thumb123.webp" data-src="/imgs/full123.webp" tabindex="0">
//
//   Donde:
//   - .thumb                 → clase que identifica miniaturas
//   - data-src               → URL de la imagen grande (full). Si falta, se usa el src de la miniatura misma.
//   - tabindex="0"           → permite foco por teclado (recomendado para accesibilidad).
//   - .active (opcional)     → se usa visualmente para resaltar la miniatura seleccionada.
//
// ACCESIBILIDAD
// -------------
// - Se escucha 'keydown' y se aceptan Enter/Espacio como acciones de selección.
// - Para que esto funcione bien con teclado:
//   * las miniaturas deben poder enfocarse (tabindex="0" o que sean botones reales).
//   * podría sumarse role="button" en el HTML para lectores de pantalla.
//
// CACHE-BUSTER
// ------------
// Cuando cambiamos la imagen principal, hacemos:
//    main.src = `${src}?t=${Date.now()}`
//
// Esto agrega un query param único (timestamp). Así se evita que el navegador
// sirva una versión vieja de la imagen desde caché. Es especialmente útil si
// las imágenes se reemplazan en el servidor con el mismo nombre.
//
// LIMPIEZA DE URLS
// ----------------
// Para poder comparar qué miniatura coincide con la imagen principal al inicio,
// sacamos la querystring (todo después del "?"). Ejemplo:
//   /full/123.webp?t=123456 → /full/123.webp
//
// Eso permite matchear incluso si la imagen principal ya tenía cache-buster.
//

(function () {
  // Obtenemos referencias clave:
  const main = document.getElementById('imagen-equipo'); // imagen principal grande
  const thumbsWrap = document.getElementById('thumbs');  // contenedor que agrupa todas las miniaturas

  // Si falta alguno, no hacemos nada. Esto protege el script en páginas donde
  // no hay galería pero el JS igual se incluyó.
  if (!main || !thumbsWrap) return;

  // clean(url):
  // -----------
  // Recibe una URL de imagen y devuelve la misma URL pero sin querystring (?...).
  // Ejemplo:
  //   clean("/foto.jpg?t=12345") -> "/foto.jpg"
  //
  // ¿Por qué?
  // Para poder comparar rutas "reales" sin el cache-buster. Esto nos sirve
  // al inicializar la miniatura activa, y también al leer src de thumbs.
  const clean = (url) => (url || '').split('?')[0];

  // activarThumb(el):
  // -----------------
  // - Saca la clase .active de todas las miniaturas dentro de #thumbs.
  // - Le agrega .active a la miniatura que pasamos.
  //
  // Esto da feedback visual tipo borde/outline/etc. indicando cuál thumbnail
  // corresponde a la imagen que se está viendo en grande.
  function activarThumb(el) {
    // Removemos .active de cualquier thumb que lo tenga actualmente
    thumbsWrap.querySelectorAll('.thumb.active').forEach(t => t.classList.remove('active'));

    // Agregamos .active sólo a la miniatura seleccionada (si existe)
    if (el) el.classList.add('active');
  }

  // cambiarImagen(src, el):
  // -----------------------
  // Cambia la imagen principal usando la URL `src` recibida.
  // Además, marca la miniatura `el` como activa.
  //
  // IMPORTANTÍSIMO:
  // Le agregamos `?t=${Date.now()}` para evitar que el navegador
  // use caché viejo si estás reemplazando la misma ruta de imagen en el server.
  //
  function cambiarImagen(src, el) {
    main.src = `${src}?t=${Date.now()}`; // Append cache-buster para forzar refetch
    activarThumb(el);
  }

  // EVENTO: click en miniatura
  // --------------------------
  // Delegación de eventos:
  // - Escuchamos el click en el contenedor #thumbs, no en cada miniatura individual.
  // - Usamos e.target.closest('.thumb') para permitir que funcione incluso si el user
  //   clickea en un hijo dentro de la miniatura (por ejemplo, si en el futuro
  //   la thumbnail no es solo <img> sino un <div> con overlay y cosas adentro).
  //
  thumbsWrap.addEventListener('click', (e) => {
    const el = e.target.closest('.thumb');
    if (!el) return;

    // Obtenemos la URL grande. Preferimos el dataset.src si está,
    // porque muchas veces la miniatura tiene un src chiquito (thumbnail)
    // y data-src apunta a la imagen en calidad completa.
    //
    // Si no hay data-src, usamos su propio src "limpio" (sin querystring).
    //
    const src = el.dataset.src || clean(el.getAttribute('src'));
    if (!src) return;

    cambiarImagen(src, el);
  });

  // EVENTO: keydown (accesibilidad teclado)
  // ---------------------------------------
  // Permitimos que las miniaturas se puedan activar con teclado usando:
  //  - Enter
  //  - Espacio (barra)
  //
  // Esto hace que la galería sea navegable sin mouse.
  //
  // Importante:
  // - Para que esto funcione bien, las miniaturas tienen que poder recibir foco.
  //   Lo más común es darles tabindex="0" en el HTML.
  //
  thumbsWrap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;

    const el = e.target.closest('.thumb');
    if (!el) return;

    e.preventDefault(); // Evita scroll al presionar " " (espacio) en algunas condiciones

    const src = el.dataset.src || clean(el.getAttribute('src'));
    if (!src) return;

    cambiarImagen(src, el);
  });

  // ESTADO INICIAL: marcar la miniatura activa al cargar
  // ---------------------------------------------------
  //
  // Cuando se carga la página, probablemente la imagen principal ya tiene un src.
  // Queremos que la miniatura correspondiente a esa imagen aparezca marcada con .active.
  //
  // Problema:
  //   main.src puede venir con cache-buster o query params.
  // Solución:
  //   1. limpiamos main.src (sin querystring)
  //   2. buscamos la miniatura cuya data-src o src "limpios" coincidan con eso
  //   3. le aplicamos activarThumb()
  //
  const principalLimpia =
    clean(main.getAttribute('src')) ||  // primero tratamos el src "crudo" del atributo
    clean(main.currentSrc);             // fallback: currentSrc (importante si hay srcset)

  const inicial = Array.from(thumbsWrap.querySelectorAll('.thumb'))
    .find(t => {
      // Para cada thumb:
      //  - Preferimos comparar contra t.dataset.src (la URL grande "real")
      //  - Si no tiene dataset.src, usamos su propio src
      //
      const thumbSrcLimpia = clean(t.dataset.src || t.getAttribute('src'));
      return thumbSrcLimpia === principalLimpia;
    });

  // Marcamos esa miniatura como la activa inicial (si la encontramos).
  activarThumb(inicial);
})();
