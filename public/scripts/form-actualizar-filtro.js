// form-actualizar-filtro.js
//
// Este script se encarga de "sincronizar" el campo de búsqueda principal `q`
// con el modo de filtrado seleccionado por el usuario.
// Básicamente hay dos modos posibles:
//   - Modo "texto": <input type="text" name="q" ...>
//   - Modo "estado": dropdown de estados con color, pero que en realidad
//                    setea un <input type="hidden" name="q" value="...">
//
// La idea es que el usuario elija en un <select id="by-select"> si quiere buscar
// por texto libre o por estado específico. Según esa elección, este script
// reemplaza dinámicamente el contenido dentro de #q-container.
//
// Cosas importantes que resuelve este archivo:
// 1. Si el usuario ya escribió algo, no lo pierde al cambiar de modo.
//    (guardamos lo último que tipeó / seleccionó en variables en memoria)
// 2. El dropdown de estados muestra un puntito de color al lado del nombre,
//    usando la variable CSS --dot-color.
// 3. Tenemos soporte para datos que vienen "inyectados" desde el servidor
//    en forma de data attributes (data-estados y data-colores), codificados.
//
// Nota: este archivo asume que existe Bootstrap con dropdowns,
//       porque usa clases tipo "dropdown-menu" y el data-bs-toggle="dropdown".
//

(function () {
  // Usamos una IIFE (función autoejecutable) para:
  // - no ensuciar el scope global con variables internas
  // - ejecutar este módulo apenas se cargue el archivo

  document.addEventListener('DOMContentLoaded', function () {
    // Esperamos al DOMContentLoaded para asegurarnos de que los elementos
    // existan en el DOM antes de consultarlos.

    var bySelect = document.getElementById('by-select');      // <select> que elige entre "texto" o "estado"
    var qContainer = document.getElementById('q-container');  // contenedor donde vamos a renderizar dinámicamente el campo q

    if (!bySelect || !qContainer) return;
    // Early return defensivo:
    // Si por alguna razón el HTML no tiene estos elementos,
    // no hacemos nada para evitar errores JS en consola.

    // === Estados disponibles (vienen del servidor en data-estados, URL-encoded JSON) ===
    // Ejemplo esperado en el HTML:
    //   <div id="q-container"
    //        data-estados="%5B%22Pendiente%22%2C%22Aprobado%22%2C%22Cancelado%22%5D"
    //        ...>
    //
    // Acá los parseamos de vuelta a array JS.
    var estados = [];
    try {
      var rawFromData = qContainer.dataset && qContainer.dataset.estados;
      // dataset.estados es un JSON encodeado y además URL-encoded.
      // decodeURIComponent -> vuelve a texto JSON legible.
      if (rawFromData) estados = JSON.parse(decodeURIComponent(rawFromData));
    } catch (e) {
      // Si algo rompe (JSON inválido, etc.), ignoramos silenciosamente
      // y seguimos con estados = [].
    }
    if (!Array.isArray(estados)) estados = [];
    // Garantizamos que sea un array aunque el server mande basura.

    // === Mapa de colores por estado (data-colores, URL-encoded JSON) ===
    // Ejemplo esperado:
    //   data-colores="%7B%22Pendiente%22%3A%22%23ffcc00%22%2C%22Aprobado%22%3A%22%2300aa44%22%7D"
    //
    // Resultado final (objeto JS):
    //   {
    //     "Pendiente": "#ffcc00",
    //     "Aprobado": "#00aa44",
    //     ...
    //   }
    var colores = {};
    try {
      var rawColors = qContainer.dataset && qContainer.dataset.colores;
      if (rawColors) colores = JSON.parse(decodeURIComponent(rawColors)) || {};
    } catch (e) {
      // mismo criterio: que falle silenciosamente, pero no explote todo
    }
    if (typeof colores !== 'object' || colores === null) colores = {};
    // Forzamos que "colores" sea un objeto plano usable.

    // Memoria del último valor usado en cada modo (para no perder lo tipeado)
    // --------------------------------------------------
    // Caso real: el usuario escribe "Juan Pérez" en texto.
    // Después cambia el filtro a "estado = Aprobado".
    // Después vuelve a "texto": queremos restaurar "Juan Pérez".
    //
    // Mismo al revés: si eligió estado "Aprobado", cambiamos a "texto"
    // y luego vuelve a "estado", queremos re-seleccionar "Aprobado".
    var lastTextValue = '';
    var lastEstadoValue = '';

    // Helper: obtiene el color que le corresponde visualmente a un estado.
    // Si no lo encuentra, usamos un color fallback (azul Bootstrap-ish).
    function getColor(estado) {
      return colores[estado] || '#007bff';
    }

    // --------------------------------------------------
    // renderEstadoDropdown(selected)
    //
    // Renderiza en #q-container:
    //  - Un wrapper con clase .dropdown
    //  - Un <input type="hidden" name="q" /> que es el valor real que se envía en submit
    //  - Un botón "toggle" que muestra el estado elegido + puntito de color
    //  - Un ul.dropdown-menu con todas las opciones de estado
    //
    // Parámetro:
    //  selected: string con el estado actualmente seleccionado (ej "Aprobado")
    //            o '' (sin filtro)
    //
    // Notas:
    //  - Bootstrap usa data-bs-toggle="dropdown" (ojo: en el código definimos dataset.bsToggle).
    //  - Cada opción del menú actualiza tanto el hidden como el label visual.
    //
    function renderEstadoDropdown(selected) {
      var wrapper = document.createElement('div');
      wrapper.className = 'dropdown w-100'; // w-100 = ancho completo del contenedor padre
      wrapper.id = 'estado-dropdown';       // id útil por si después querés ubicarlo en el DOM

      // Campo oculto que realmente viaja en el form:
      // name="q" mantiene compatibilidad con el backend, que espera el parámetro q
      var hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'q';           // MUY IMPORTANTE: el backend recibe siempre ?q=...
      hidden.value = selected || '';
      hidden.id = 'estado-hidden';

      // Botón que actúa como "select custom"
      // Muestra el estado elegido y el puntito de color
      var toggle = document.createElement('button');
      toggle.className = 'btn btn-outline-secondary w-100 d-flex justify-content-between align-items-center';
      toggle.type = 'button';
      toggle.dataset.bsToggle = 'dropdown'; // Esto le dice a Bootstrap que abre un dropdown
      toggle.ariaExpanded = 'false';
      toggle.id = 'estado-toggle';

      // Texto visible del estado actual
      var label = document.createElement('span');
      label.id = 'estado-label';
      label.textContent = selected || 'Seleccioná estado…';

      // Puntito de color al costado
      // Usamos una clase .estado-dot que debería tener en CSS algo tipo:
      //   .estado-dot {
      //     width: .6rem;
      //     height: .6rem;
      //     border-radius: 50%;
      //     background-color: var(--dot-color);
      //   }
      //
      // Acá seteamos --dot-color dinámicamente en línea.
      var dot = document.createElement('span');
      dot.className = 'estado-dot ms-2';
      dot.style.setProperty('--dot-color', selected ? getColor(selected) : '#ccc');
      // Nota: si no hay estado elegido, usamos gris "#ccc"

      // Armamos el contenido visual del botón toggle
      toggle.appendChild(label);
      toggle.appendChild(dot);

      // Creamos el menú desplegable <ul> con las opciones
      var ul = document.createElement('ul');
      ul.className = 'dropdown-menu w-100 shadow-sm';
      // w-100 => hacemos el menú tan ancho como el botón
      // shadow-sm => leve sombra, más "dropdown custom" que menú flotando random

      // --- Primera opción especial: "(Sin filtro)" ---
      // Esta opción significa q = "" (string vacío), o sea: no filtrar por estado.
      var liEmpty = document.createElement('li');
      var btnEmpty = document.createElement('button');
      btnEmpty.type = 'button';
      btnEmpty.className = 'dropdown-item d-flex justify-content-between align-items-center';
      btnEmpty.dataset.value = '';
      // Notar que también lleva un puntito gris como "sin color"
      btnEmpty.innerHTML = `<span>(Sin filtro)</span><span class="estado-dot" style="--dot-color:#ccc;"></span>`;
      liEmpty.appendChild(btnEmpty);
      ul.appendChild(liEmpty);

      // --- Opciones reales: cada estado del array `estados` ---
      // Por cada estado creamos un <button.dropdown-item> que:
      //  - Muestra el nombre del estado
      //  - Muestra un puntito con su color asociado (getColor)
      //  - Marca .active si coincide con el seleccionado actual
      estados.forEach(function (e) {
        var li = document.createElement('li');

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dropdown-item d-flex justify-content-between align-items-center';
        btn.dataset.value = e;

        var color = getColor(e);

        // innerHTML porque queremos inyectar puntito de color
        btn.innerHTML = `<span>${e}</span><span class="estado-dot" style="--dot-color:${color};"></span>`;

        if (selected && selected === e) btn.classList.add('active');
        // .active sirve para dar feedback visual sobre qué está actualmente seleccionado

        li.appendChild(btn);
        ul.appendChild(li);
      });

      // Montaje final dentro del wrapper
      wrapper.appendChild(hidden);
      wrapper.appendChild(toggle);
      wrapper.appendChild(ul);

      // Limpiamos el contenedor visual y metemos nuestro dropdown recién armado
      qContainer.innerHTML = '';
      qContainer.appendChild(wrapper);

      // ============ Interacción del dropdown ============
      // Cada .dropdown-item (incluyendo "(Sin filtro)") al hacer click:
      // - Actualiza el input hidden[name="q"]
      // - Cambia el texto del label en el botón toggle
      // - Cambia el color del puntito al color correspondiente
      // - Marca visualmente la opción activa
      ul.querySelectorAll('.dropdown-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.value || '';

          // Actualizamos el hidden que va en el form
          hidden.value = val;

          // Actualizamos label visible del botón
          label.textContent = val || 'Seleccioná estado…';

          // Actualizamos el color del puntito en el botón
          dot.style.setProperty('--dot-color', val ? getColor(val) : '#ccc');

          // Quitamos .active de todas las opciones, y se la agregamos a la actual
          ul.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
          btn.classList.add('active');
        });
      });
    }

    // --------------------------------------------------
    // renderTextInput(value)
    //
    // Renderiza un input de texto normal (para búsqueda libre),
    // con name="q" (para que el backend reciba `q` igual que en el modo estado).
    //
    // Parámetro:
    //   value: valor inicial que debería tener el input (si volvemos desde "estado")
    //
    function renderTextInput(value) {
      var input = document.createElement('input');
      input.type = 'text';
      input.name = 'q';           // mantenemos mismo name="q" para el backend
      input.placeholder = 'Buscar…';
      input.className = 'form-control';

      if (value) input.value = value;
      // Si había algo guardado de antes (lastTextValue), lo restauramos.

      // Reemplazamos el contenido actual del contenedor
      qContainer.innerHTML = '';
      qContainer.appendChild(input);
    }

    // --------------------------------------------------
    // bootstrapMemory()
    //
    // Esta IIFE corre una sola vez al inicio.
    //
    // ¿Para qué?
    // El servidor pudo haber renderizado YA un control dentro de #q-container
    // antes de que este JS corra.
    //
    // Ejemplos:
    //  - Caso A: el servidor ya decidió que el modo actual es "estado", entonces
    //            nos entrega <input type="hidden" name="q" value="Aprobado"> + el dropdown armado.
    //
    //  - Caso B: el servidor nos dio un <input type="text" name="q" value="Juan Pérez">
    //
    // Queremos:
    //   1. Leer ese valor inicial para poblar lastEstadoValue / lastTextValue.
    //   2. Ajustar el color del puntito en el toggle si ya hay un estado elegido.
    //
    (function bootstrapMemory() {
      var currentField = qContainer.querySelector('[name="q"]');
      // Buscamos el campo actual con name="q" (puede ser hidden o text).
      if (!currentField) return;

      // Caso: el campo q es <input type="hidden"> => modo "estado"
      if (currentField.tagName === 'INPUT' && currentField.type === 'hidden') {
        lastEstadoValue = currentField.value || '';

        // Además, si el server ya pintó el toggle con .estado-dot,
        // aseguramos que el puntito tenga el color correcto de entrada.
        var toggleDot = qContainer.querySelector('#estado-toggle .estado-dot');
        if (toggleDot) {
          toggleDot.style.setProperty(
            '--dot-color',
            lastEstadoValue ? getColor(lastEstadoValue) : '#ccc'
          );
        }
        return; // Importante: cortamos acá porque ya tratamos el caso "estado".
      }

      // Caso: el campo q es un <input type="text"> => modo "texto"
      if (currentField.tagName === 'INPUT') {
        lastTextValue = currentField.value || '';
      }
      // Nota: no contemplamos <select name="q"> etc. porque en este flujo
      // el name="q" debería ser siempre input text u hidden.
    })();

    // --------------------------------------------------
    // Listener de cambio en el <select id="by-select">
    //
    // Cuando el usuario cambia de "texto" a "estado" (o viceversa),
    // necesitamos:
    //   1. Guardar el valor actual visible para no perderlo.
    //   2. Re-renderizar el control adecuado.
    //
    bySelect.addEventListener('change', function () {
      var v = bySelect.value; // "texto" o "estado" (esperado según tu HTML)

      // Antes de reemplazar el contenido del contenedor,
      // leemos el valor actual del campo `q` que está montado ahora mismo.
      // Así actualizamos lastEstadoValue / lastTextValue.
      var currentField = qContainer.querySelector('[name="q"]');
      if (currentField) {
        if (currentField.tagName === 'INPUT' && currentField.type === 'hidden') {
          // Estábamos en modo "estado"
          lastEstadoValue = currentField.value || '';
        } else if (currentField.tagName === 'INPUT') {
          // Estábamos en modo "texto"
          lastTextValue = currentField.value || '';
        }
      }

      // Ahora sí, según lo elegido en el select, renderizamos el control adecuado.
      if (v === 'estado') {
        // Cambiamos a UI de estado (dropdown custom)
        renderEstadoDropdown(lastEstadoValue);
      } else {
        // Cambiamos a input de texto normal
        renderTextInput(lastTextValue);
      }
    });
  });
  // fin DOMContentLoaded
})();
// fin IIFE raíz
