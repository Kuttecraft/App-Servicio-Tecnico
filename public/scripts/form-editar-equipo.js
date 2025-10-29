// form-editar-equipo.js
//
// PROPÓSITO
// ---------
// Este script maneja la edición de la imagen asociada a un "equipo" (o item).
// Casos que cubre:
//   1. Reemplazar la imagen existente por una nueva (con preview instantánea).
//   2. Eliminar la imagen actual marcándola como "para borrar".
//   3. Enviar al backend si se cambió, si se quiere borrar, o si no hubo cambios.
//   4. (Extra UX) Comprimir/convertir la imagen a WebP antes de subirla,
//      para ahorrar peso/bandwidth.
//
// ¿Cómo se comunica con el backend?
// ---------------------------------
// Usa un input oculto (hidden) llamado `input-borrar-imagen`, que puede tener estos valores:
//
//   - "false": no borrar la imagen existente y no hubo reemplazo
//   - "true": se subió una imagen nueva (el backend debería usar la nueva)
//   - "delete": el usuario pidió borrar la imagen actual (sin reemplazarla)
//
// El backend lee ese valor en el submit final y decide qué hacer.
//
// SUPOSICIONES DEL HTML
// ---------------------
// - <input type="file" id="input-imagen-archivo">  → para subir una nueva imagen
// - <img id="img-actual-o-preview">                → muestra la imagen actual o la nueva preview
// - <input type="hidden" id="input-borrar-imagen"> → bandera para el servidor ("false"|"true"|"delete")
// - <button id="btn-eliminar-equipo">              → botón "Eliminar imagen"
// - <form id="form-editar-equipo">                 → formulario de edición
//
// - Hay una imagen placeholder en "/logo.webp" que usamos como "sin imagen".
//
// - Se asume que tenés Bootstrap-ish classes como .btn-success/.btn-primary.
//   btnGuardar se obtiene por si necesitás deshabilitarlo, validar, etc.
//   (Actualmente sólo lo referenciás, no lo usás, lo cual está bien.)
//
// DEPENDENCIAS OPCIONALES
// -----------------------
// - window.imageCompression: librería externa (ej: "browser-image-compression") que
//   permite comprimir/redimensionar y exportar como WebP en el frontend.
//   Si está presente, comprimimos automáticamente la imagen nueva y reemplazamos
//   el File en el input con esa versión WebP reducida.
//   Si no está, simplemente se sube el archivo original.
//
// NOTA: Este script NO evita el submit ni valida nada más allá del manejo de imagen.
//       El backend tiene la última palabra.
//

document.addEventListener('DOMContentLoaded', () => {
  // Obtenemos las referencias a los elementos clave en el DOM:

  const inputArchivo = document.getElementById('input-imagen-archivo');          // <input type="file"> donde el usuario elige nueva imagen
  const imgActualPreview = document.getElementById('img-actual-o-preview');      // <img> que muestra la imagen actual o la preview en vivo
  const inputBorrar = document.getElementById('input-borrar-imagen');            // <input type="hidden"> que indica acción al backend
  const btnEliminar = document.getElementById('btn-eliminar-equipo');            // botón "Eliminar imagen" (borrar la imagen actual)
  const form = document.getElementById('form-editar-equipo') || document.querySelector('form'); 
  // ^ fallback: si por alguna razón no hay id="form-editar-equipo", tomamos el primer <form> de la página.

  const btnGuardar = document.querySelector('button[type="submit"].btn-success, button[type="submit"].btn-primary');
  // ^ Referencia opcional al botón Guardar (por si quisieras deshabilitarlo hasta que haya cambios, etc.)
  //   En este código no se usa, pero lo dejamos porque puede ser útil para validaciones posteriores.
  //   No lo removemos porque dijiste que no querés perder funcionalidad posible.

  // Si no hay inputArchivo, no tiene sentido seguir (probablemente estamos en una vista donde no se edita imagen)
  if (!inputArchivo) return;

  // ==========================================================
  // CAMBIO DE IMAGEN (REEMPLAZO)
  // ==========================================================
  //
  // Flujo cuando el usuario elige una nueva imagen desde el file picker:
  // 1. Si canceló la selección → restauramos placeholder y marcamos que NO hay cambios.
  // 2. Si eligió archivo:
  //    - Mostramos preview inmediata con FileReader.
  //    - Marcamos inputBorrar.value = "true" (hay nueva imagen).
  //    - Intentamos comprimir / convertir a WebP y guardarlo en el input.
  //
  inputArchivo.addEventListener('change', async () => {
    const file = inputArchivo.files?.[0]; // operador ?. protege si files es undefined/null

    if (!file) {
      // Caso: el usuario abrió el diálogo de archivos pero apretó "cancelar".
      // Volvemos a mostrar el placeholder (logo.webp) como "sin imagen".
      if (imgActualPreview) imgActualPreview.src = "/logo.webp";

      // Marcamos explícitamente que NO queremos borrar ni reemplazar.
      // "false" = no borrar imagen actual y no hay nueva imagen subida.
      inputBorrar.value = "false";
      return;
    }

    // Tenemos un archivo nuevo, así que:
    // 1. Mostramos al usuario lo que seleccionó.
    // 2. Comunicamos al backend que, cuando guarde, debe usar esta imagen nueva.
    mostrarPreview(file);       // ver función más abajo
    inputBorrar.value = "true"; // "true" = hay reemplazo; el backend debería tomar el nuevo archivo

    // ----------------------------------------------------------
    // COMPRESIÓN Y CONVERSIÓN A WEBP
    // ----------------------------------------------------------
    //
    // Intentamos reducir tamaño y normalizar formato a WebP ANTES de enviar al server.
    //
    // - maxSizeMB: límite de peso aproximado.
    // - maxWidthOrHeight: redimensiona para que ninguno de los lados supere 500px.
    //                     (esto mantiene calidad suficiente tipo thumbnail / foto de referencia)
    // - useWebWorker: si la lib lo soporta, esto previene bloquear la UI.
    // - fileType: 'image/webp' → salida final WebP.
    //
    try {
      const compressedWebP = await window.imageCompression(file, {
        maxSizeMB: 2,
        maxWidthOrHeight: 500,
        useWebWorker: true,
        fileType: 'image/webp'
      });

      // Ahora renombramos el archivo a ".webp".
      // Ejemplo: foto.jpg → foto.webp
      //
      // Importante: usamos file.name como base, o sea, conservamos el nombre original
      // pero le cambiamos extensión. Esto ayuda en el backend si usás el nombre
      // para logs o debugging.
      //
      const renamedFile = new File(
        [compressedWebP],
        file.name.replace(/\.(jpg|jpeg|png|webp)$/i, '.webp'), // reemplaza extensión común por .webp
        { type: 'image/webp' }
      );

      // Reemplazamos el archivo seleccionado en el <input type="file">
      // por la nueva versión comprimida WebP. Así cuando el form se mande,
      // el backend recibe ESTE archivo comprimido y no el original pesado.
      //
      // DataTransfer nos deja crear una FileList programáticamente y asignarla.
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(renamedFile);
      inputArchivo.files = dataTransfer.files;

      // Nota: No actualizamos la preview acá porque ya la mostramos con `file` arriba.
      // Podríamos volver a mostrar la preview con renamedFile para ser 100% fiel,
      // pero visualmente casi siempre va a ser la misma imagen (sólo más liviana).
      // Tu código actual prioriza rapidez → está perfecto.

    } catch (error) {
      console.error('Error al comprimir/convertir imagen:', error);
      // Si algo falla en la compresión:
      // - Dejamos el archivo original sin tocar (inputArchivo.files sigue siendo el original).
      // - Preview ya está mostrada con el original.
      // - inputBorrar.value ya está en "true", así que el servidor va a intentar reemplazar con este archivo original.
      // Básicamente seguimos adelante sin matar la UX.
    }
  });


  // ==========================================================
  // FUNCIÓN mostrarPreview(file)
  // ==========================================================
  //
  // Lee un File (Blob local que el usuario acaba de seleccionar)
  // y lo convierte en un DataURL (base64) para mostrarlo en <img id="img-actual-o-preview">.
  //
  // Esto da feedback visual inmediato al usuario de cuál imagen se va a guardar.
  //
  function mostrarPreview(file) {
    if (!imgActualPreview) return;
    const reader = new FileReader();

    reader.onload = function (e) {
      // e.target.result es algo tipo "data:image/webp;base64,AAAA..."
      imgActualPreview.src = e.target.result;
    };

    reader.readAsDataURL(file);
  }


  // ==========================================================
  // ELIMINAR IMAGEN ACTUAL
  // ==========================================================
  //
  // Flujo cuando el usuario hace click en "Eliminar imagen":
  // 1. Confirmamos con window.confirm (bloqueante, pero simple y directo).
  // 2. Si confirma:
  //    - Mostramos un placeholder (logo.webp) como preview.
  //    - Limpiamos el inputArchivo (para que no haya nueva imagen cargada).
  //    - Seteamos inputBorrar.value = "delete":
  //         => Esto es la señal al backend de "borrame la imagen actual".
  //    - Avisamos con alert() que el borrado se aplicará al guardar.
  //
  if (btnEliminar && inputBorrar) {
    btnEliminar.addEventListener('click', () => {
      const respuesta = confirm(
        "¿Seguro que querés eliminar la imagen? Esta acción no se puede deshacer."
      );
      if (!respuesta) return;

      // Mostramos placeholder que representa "sin imagen"
      if (imgActualPreview) imgActualPreview.src = "/logo.webp";

      // Borramos cualquier archivo que tal vez se había elegido pero aún no se guardó
      inputArchivo.value = "";

      // Marcamos que se debe ELIMINAR la imagen existente en el servidor.
      // El backend, al ver "delete", debería borrar la imagen antigua.
      inputBorrar.value = "delete";

      alert("La imagen será eliminada cuando guardes los cambios.");
    });
  }


  // ==========================================================
  // HOOK ANTES DEL SUBMIT
  // ==========================================================
  //
  // Este listener está atado al form en sí.
  // Actualmente no hace validaciones extra, pero queda listo si en el futuro querés:
  // - Bloquear submit si no hay imagen y es obligatoria.
  // - Mostrar spinner y desactivar btnGuardar.
  // - Auditar el valor de inputBorrar antes de enviar.
  //
  form?.addEventListener('submit', (e) => {
    // Acá podrías hacer cosas como:
    // if (inputBorrar.value === 'false' && !imgActualPreview.src) { ... }
    // Por ahora intencionalmente vacío.
  });
});
