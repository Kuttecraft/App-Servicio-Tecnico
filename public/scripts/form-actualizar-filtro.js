(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var bySelect = document.getElementById('by-select');
    var qContainer = document.getElementById('q-container');
    if (!bySelect || !qContainer) return;

    // === Estados ===
    var estados = [];
    try {
      var rawFromData = qContainer.dataset && qContainer.dataset.estados;
      if (rawFromData) estados = JSON.parse(decodeURIComponent(rawFromData));
    } catch (e) {}
    if (!Array.isArray(estados)) estados = [];

    // === Colores por estado ===
    var colores = {};
    try {
      var rawColors = qContainer.dataset && qContainer.dataset.colores;
      if (rawColors) colores = JSON.parse(decodeURIComponent(rawColors)) || {};
    } catch (e) {}
    if (typeof colores !== 'object' || colores === null) colores = {};

    var lastTextValue = '';
    var lastEstadoValue = '';

    function getColor(estado) {
      return colores[estado] || '#007bff';
    }

    function renderEstadoDropdown(selected) {
      var wrapper = document.createElement('div');
      wrapper.className = 'dropdown w-100';
      wrapper.id = 'estado-dropdown';

      var hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'q';
      hidden.value = selected || '';
      hidden.id = 'estado-hidden';

      var toggle = document.createElement('button');
      toggle.className = 'btn btn-outline-secondary w-100 d-flex justify-content-between align-items-center';
      toggle.type = 'button';
      toggle.dataset.bsToggle = 'dropdown';
      toggle.ariaExpanded = 'false';
      toggle.id = 'estado-toggle';

      var label = document.createElement('span');
      label.id = 'estado-label';
      label.textContent = selected || 'Seleccioná estado…';

      var dot = document.createElement('span');
      dot.className = 'estado-dot ms-2';
      dot.style.setProperty('--dot-color', selected ? getColor(selected) : '#ccc');

      toggle.appendChild(label);
      toggle.appendChild(dot);

      var ul = document.createElement('ul');
      ul.className = 'dropdown-menu w-100 shadow-sm';

      // (Sin filtro)
      var liEmpty = document.createElement('li');
      var btnEmpty = document.createElement('button');
      btnEmpty.type = 'button';
      btnEmpty.className = 'dropdown-item d-flex justify-content-between align-items-center';
      btnEmpty.dataset.value = '';
      btnEmpty.innerHTML = `<span>(Sin filtro)</span><span class="estado-dot" style="--dot-color:#ccc;"></span>`;
      liEmpty.appendChild(btnEmpty);
      ul.appendChild(liEmpty);

      // Items con color correcto
      estados.forEach(function (e) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dropdown-item d-flex justify-content-between align-items-center';
        btn.dataset.value = e;
        var color = getColor(e);
        btn.innerHTML = `<span>${e}</span><span class="estado-dot" style="--dot-color:${color};"></span>`;
        if (selected && selected === e) btn.classList.add('active');
        li.appendChild(btn);
        ul.appendChild(li);
      });

      wrapper.appendChild(hidden);
      wrapper.appendChild(toggle);
      wrapper.appendChild(ul);

      qContainer.innerHTML = '';
      qContainer.appendChild(wrapper);

      // Interacción
      ul.querySelectorAll('.dropdown-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.value || '';
          hidden.value = val;
          label.textContent = val || 'Seleccioná estado…';
          dot.style.setProperty('--dot-color', val ? getColor(val) : '#ccc');
          ul.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
          btn.classList.add('active');
        });
      });
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

    // Recordar valor inicial renderizado por el servidor
    (function bootstrapMemory() {
      var currentField = qContainer.querySelector('[name="q"]');
      if (!currentField) return;

      // Si ya está el dropdown SSR, no lo tocamos (y ya trae los colores correctos)
      if (currentField.tagName === 'INPUT' && currentField.type === 'hidden') {
        lastEstadoValue = currentField.value || '';
        // Asegurar que el puntito del botón muestre el color correcto al cargar
        var toggleDot = qContainer.querySelector('#estado-toggle .estado-dot');
        if (toggleDot) toggleDot.style.setProperty('--dot-color', lastEstadoValue ? getColor(lastEstadoValue) : '#ccc');
        return;
      }

      // Si es input de texto
      if (currentField.tagName === 'INPUT') {
        lastTextValue = currentField.value || '';
      }
    })();

    // Cambio tipo de campo
    bySelect.addEventListener('change', function () {
      var v = bySelect.value;

      // Guardar el valor actual antes de reemplazar
      var currentField = qContainer.querySelector('[name="q"]');
      if (currentField) {
        if (currentField.tagName === 'INPUT' && currentField.type === 'hidden') {
          lastEstadoValue = currentField.value || '';
        } else if (currentField.tagName === 'INPUT') {
          lastTextValue = currentField.value || '';
        }
      }

      if (v === 'estado') {
        renderEstadoDropdown(lastEstadoValue);
      } else {
        renderTextInput(lastTextValue);
      }
    });
  });
})();
