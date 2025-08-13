(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var bySelect = document.getElementById('by-select');
    var qContainer = document.getElementById('q-container');
    if (!bySelect || !qContainer) return;

    // 1) Preferimos leer los estados desde data-estados del contenedor
    var estados = [];
    try {
      var rawFromData = qContainer.dataset && qContainer.dataset.estados;
      if (rawFromData) {
        estados = JSON.parse(decodeURIComponent(rawFromData));
      }
    } catch (e) {
      // seguimos al fallback
    }

    // 2) Fallback: desde <script type="application/json" id="estados-data">
    if (!Array.isArray(estados) || estados.length === 0) {
      try {
        var estadosNode = document.getElementById('estados-data');
        if (estadosNode && estadosNode.textContent) {
          estados = JSON.parse(estadosNode.textContent);
        }
      } catch (e2) {
        estados = [];
      }
    }

    // 3) Último fallback: lista por defecto (para que nunca quede vacío)
    if (!Array.isArray(estados)) estados = [];
    if (estados.length === 0) {
      console.warn('[dashboard] Lista de ESTADOS vacía; usando lista por defecto de emergencia.');
      estados = [
        "Retirar",
        "Presupuestar",
        "Enviar presupuesto",
        "P. Enviado",
        "Reparación",
        "Prueba",
        "Lista",
        "Entregada",
        "Feedback Enviado",
        "Archivada",
        "No realizada"
      ];
    }

    // Guardamos el último valor de cada tipo para no perderlo al alternar
    var lastTextValue = '';
    var lastEstadoValue = '';

    // Helpers
    function renderEstadoSelect(selected) {
      var select = document.createElement('select');
      select.name = 'q';
      select.className = 'form-select';

      var optEmpty = document.createElement('option');
      optEmpty.value = '';
      optEmpty.textContent = 'Seleccioná estado…';
      select.appendChild(optEmpty);

      estados.forEach(function (e) {
        var o = document.createElement('option');
        o.value = e;
        o.textContent = e;
        if (selected && selected === e) o.selected = true;
        select.appendChild(o);
      });

      qContainer.innerHTML = '';
      qContainer.appendChild(select);

      // Si querés auto-enviar al elegir un estado, descomentá:
      // select.addEventListener('change', function () {
      //   if (select.value) document.getElementById('filterForm')?.submit();
      // });
    }

    function renderTextInput(value) {
      var input = document.createElement('input');
      input.type = 'text';
      input.name = 'q';
      input.placeholder = 'Buscar…';
      input.className = 'form-control';
      if (value) input.value = value;

      qContainer.innerHTML = '';
      qContainer.appendChild(input);
    }

    // Al cargar, recordamos el valor inicial renderizado por el servidor
    (function bootstrapMemory() {
      var currentField = qContainer.querySelector('[name="q"]');
      if (!currentField) return;
      if (currentField.tagName === 'SELECT') {
        lastEstadoValue = /** @type {HTMLSelectElement} */ (currentField).value || '';
      } else {
        lastTextValue = /** @type {HTMLInputElement} */ (currentField).value || '';
      }
    })();

    // Cambio en vivo del tipo de campo según el filtro seleccionado
    bySelect.addEventListener('change', function () {
      var v = bySelect.value;

      // Antes de reemplazar, guardamos el valor actual
      var currentField = qContainer.querySelector('[name="q"]');
      if (currentField) {
        if (currentField.tagName === 'SELECT') {
          lastEstadoValue = /** @type {HTMLSelectElement} */ (currentField).value || '';
        } else {
          lastTextValue = /** @type {HTMLInputElement} */ (currentField).value || '';
        }
      }

      if (v === 'estado') {
        renderEstadoSelect(lastEstadoValue);
      } else {
        renderTextInput(lastTextValue);
      }
    });
  });
})();
