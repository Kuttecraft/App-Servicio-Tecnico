// form-mas-imagenes.js
//
// PROPÓSITO GENERAL
// -----------------
// Este script está pensado para pantallas de EDICIÓN donde un equipo / ticket
// puede tener varias imágenes distintas (por ejemplo: principal, ticket, extra).
//
// La idea es no repetir lógica para cada imagen, sino tener una función genérica
// `setupImageHandler(...)` que reciba los IDs de los elementos relevantes y
// le agregue toda la funcionalidad necesaria:
//
// 1. Previsualizar cuando el usuario selecciona una nueva imagen.
// 2. Intentar comprimir la imagen seleccionada antes de previsualizarla
//    (usando la librería opcional `window.imageCompression`).
// 3. Resetear el preview si el usuario cancela la selección.
// 4. Marcar si esa imagen debe eliminarse del servidor (hidden "delete").
// 5. Cambiar la UI a un placeholder cuando se elige "eliminar".
//
// FLUJO BACKEND
// -------------
// Para cada imagen tenemos:
//   - <input type="file" ...>              → la imagen nueva que se podría subir.
//   - <img ...>                            → preview actual de esa imagen.
//   - <input type="hidden" ...>            → marca intención ("false" | "delete").
//   - Un botón "eliminar"                  → si el user quiere borrar esa imagen.
//
// El hidden (borrarInput) se interpreta así:
//   - "false": mantener la imagen actual o reemplazarla con la nueva subida
//              (si se eligió un archivo).
//   - "delete": el usuario quiere borrar esa imagen al guardar, sin reemplazo.
//
// Cada set (principal, ticket, extra) tiene sus propios IDs, y abajo del todo
// llamamos a setupImageHandler() tres veces, una por cada imagen.
//
// NOTAS
// -----
// - Este archivo NO actualiza el FileList del <input type="file"> con una versión comprimida
//   como haces en otros módulos (ej. form-editar-equipo.js). Acá sólo mostramos la versión
//   comprimida (si existe) en el preview. El input como tal se queda con el archivo original,
//   salvo que la compresión se haga y luego vos manualmente la reemplaces en backend.
//   O sea: esto es más "preview UX" que "optimización de payload".
// - `window.imageCompression` es opcional. Si no está presente, simplemente se usa la imagen tal cual.
// - Para accesibilidad/performance: usamos URL.createObjectURL() para el preview,
//   que es eficiente y no bloquea con FileReader base64.
//
//
// ------------------------------------
// DEFINICIÓN PRINCIPAL REUTILIZABLE
// ------------------------------------

function setupImageHandler(fileInputId, imgPreviewId, hiddenDeleteId, deleteButtonId) {
  // Obtenemos las referencias DOM específicas para ESTA imagen:
  const inputFile = document.getElementById(fileInputId);        // <input type="file"> donde el usuario elige reemplazo
  const img = document.getElementById(imgPreviewId);             // <img> que muestra el preview actual / nuevo
  const borrarInput = document.getElementById(hiddenDeleteId);   // <input type="hidden"> que el backend lee: "false" | "delete"
  const btnEliminar = document.getElementById(deleteButtonId);   // botón de eliminar imagen actual

  // Falla silenciosa si falta alguno de los elementos.
  // Esto permite que esta misma función se use en páginas donde,
  // por ejemplo, "extra" no existe o no aplica.
  if (!img || !inputFile || !borrarInput || !btnEliminar) return;

  // Guardamos el src original de la imagen para poder restaurarlo
  // si el usuario abre el file picker y luego cancela sin elegir nada.
  const originalSrc = img.getAttribute('src');

  // Estado inicial coherente:
  // Si el hidden no dice "delete", lo forzamos a "false".
  //
  // Por qué:
  // - "false": estado por defecto → no quiero borrar esta imagen.
  // - "delete": el usuario explicitamente pidió borrarla.
  //
  // Evitamos que quede vacío (""), cosa que el backend no entienda.
  if (borrarInput.value !== 'delete') borrarInput.value = 'false';

  // ----------------------------------------------------------
  // EVENTO: CAMBIO DE ARCHIVO (input[type="file"])
  // ----------------------------------------------------------
  //
  // Cuando el usuario selecciona un archivo nuevo:
  //  - Si cancela el diálogo (no seleccionó nada), restauramos la imagen original.
  //  - Si selecciona una imagen:
  //      * Intentamos comprimir con imageCompression (si está disponible).
  //      * Mostramos preview usando esa imagen comprimida (o la original si falla).
  //      * Seteamos borrarInput.value = "false", porque subir un archivo nuevo
  //        implica que NO queremos eliminar la imagen al guardar.
  //
  inputFile.addEventListener('change', async (e) => {
    // Obtenemos el primer archivo seleccionado.
    const file = e?.target?.files?.[0] || null;
    if (!file) {
      // El usuario abrió el file picker pero apretó "Cancelar".
      // En ese caso:
      // - Volvemos a la imagen original del server.
      // - No tocamos borrarInput (salvo que vos quieras forzar algo).
      img.src = originalSrc || img.src;
      return;
    }

    try {
      // Intentamos comprimir/redimensionar usando window.imageCompression si existe.
      // Opciones:
      //   maxSizeMB: peso objetivo (aproximado).
      //   maxWidthOrHeight: limita resolución máxima (1600px en ancho o alto).
      //   useWebWorker: offload en worker si está soportado.
      //
      // NOTA: A diferencia de otros módulos, acá NO forzamos a WebP explícitamente.
      // Solamente comprimimos (lo que la lib devuelva según heurística por defecto).
      const options = { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true };

      const compressed = window.imageCompression
        ? await window.imageCompression(file, options) // imagen comprimida (Blob/File)
        : file;                                        // fallback: usamos la imagen original sin comprimir

      // Mostramos la preview apuntando al objeto Blob/File en memoria usando createObjectURL:
      // Esto es eficiente y no bloquea la UI como FileReader base64.
      img.src = URL.createObjectURL(compressed);
    } catch {
      // Si por alguna razón la compresión revienta (error interno, etc.)
      // igual mostramos preview usando el archivo original.
      img.src = URL.createObjectURL(file);
    }

    // Si el usuario seleccionó una imagen nueva,
    // tiene sentido interpretar eso como "NO la borres".
    borrarInput.value = 'false';
  });

  // ----------------------------------------------------------
  // EVENTO: CLICK EN "ELIMINAR IMAGEN"
  // ----------------------------------------------------------
  //
  // Cuando el usuario presiona el botón eliminar:
  //   - Seteamos borrarInput.value = "delete"  → esto le dice al backend:
  //       "Quiero que saques esta imagen del registro, no la mantengas."
  //
  //   - Reemplazamos la preview por un placeholder genérico "/logo.webp".
  //     (Esto comunica visualmente al usuario que esa imagen va a desaparecer).
  //
  //   - Limpiamos el inputFile.value para que, al guardar, NO se suba ninguna imagen nueva.
  //
  // Importante UX: Acá NO hay confirm() integrado → a diferencia de form-editar-equipo.js,
  // este flujo elimina directo. Si querés confirmación en esta pantalla particular,
  // podrías envolver este bloque en un confirm() como hiciste allá.
  //
  btnEliminar.addEventListener('click', () => {
    borrarInput.value = 'delete';  // marcamos intención de borrar al guardar
    img.src = '/logo.webp';        // placeholder "sin imagen"
    inputFile.value = '';          // limpiamos el file input (si el user había elegido algo)
  });
}


// ----------------------------------------------------------
// CONFIGURACIÓN DE LOS 3 GRUPOS DE IMÁGENES
// ----------------------------------------------------------
//
// Llamamos a setupImageHandler() para cada tipo de imagen que puede editarse.
// Cada uno tiene su propio set de elementos (input file, img preview, hidden delete, botón eliminar).
//
// 1. Imagen PRINCIPAL
//    - input-imagen-archivo           → <input type="file"> de la imagen principal
//    - img-actual-o-preview           → <img> que muestra la imagen actual o el preview nuevo
//    - input-borrar-imagen            → <input type="hidden"> que el backend lee para saber si borrar
//    - btn-eliminar-equipo            → botón "eliminar imagen principal"
//
setupImageHandler(
  'input-imagen-archivo',
  'img-actual-o-preview',
  'input-borrar-imagen',
  'btn-eliminar-equipo'
);

// 2. Imagen de TICKET (por ejemplo foto de ticket/factura)
//    - input-imagen-ticket           → <input type="file">
//    - img-ticket-preview             → <img> preview de esa imagen secundaria
//    - input-borrar-imagen-ticket     → hidden con "false"/"delete"
//    - btn-eliminar-imagen-ticket     → botón para borrar esa imagen
//
setupImageHandler(
  'input-imagen-ticket',
  'img-ticket-preview',
  'input-borrar-imagen-ticket',
  'btn-eliminar-imagen-ticket'
);

// 3. Imagen EXTRA / adicional
//    - input-imagen-extra            → <input type="file">
//    - img-extra-preview              → <img> preview
//    - input-borrar-imagen-extra      → hidden con "false"/"delete"
//    - btn-eliminar-imagen-extra      → botón para eliminar esa imagen adicional
//
setupImageHandler(
  'input-imagen-extra',
  'img-extra-preview',
  'input-borrar-imagen-extra',
  'btn-eliminar-imagen-extra'
);
