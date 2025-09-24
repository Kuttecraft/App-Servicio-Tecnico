// Convierte el filtro "q" en input de texto o dropdown de estados con color.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var bySelect = document.getElementById('by-select');      // <select> que elige "texto" | "estado"
    var qContainer = document.getElementById('q-container');  // contenedor donde se renderiza el campo q
    if (!bySelect || !qContainer) return;

    // === Estados disponibles (vienen del servidor en data-estados, URL-encoded JSON) ===
    var estados = [];
    try {
      var rawFromData = qContainer.dataset && qContainer.dataset.estados;
      if (rawFromData) estados = JSON.parse(decodeURIComponent(rawFromData));
    } catch (e) {}
    if (!Array.isArray(estados)) estados = [];

    // === Mapa de colores por estado (data-colores, URL-encoded JSON) ===
    var colores = {};
    try {
      var rawColors = qContainer.dataset && qContainer.dataset.colores;
      if (rawColors) colores = JSON.parse(decodeURIComponent(rawColors)) || {};
    } catch (e) {}
    if (typeof colores !== 'object' || colores === null) colores = {};

    // Memoria del último valor usado en cada modo (para no perder lo tipeado)
    var lastTextValue = '';
    var lastEstadoValue = '';

    // Color para el puntito del estado (fallback azul)
    function getColor(estado) {
      return colores[estado] || '#007bff';
    }

    // Renderiza el dropdown de estados (con input hidden[name="q"])
    function renderEstadoDropdown(selected) {
      var wrapper = document.createElement('div');
      wrapper.className = 'dropdown w-100';
      wrapper.id = 'estado-dropdown';

      // Campo real que viaja en el form: q = "<estado>"
      var hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = 'q';
      hidden.value = selected || '';
      hidden.id = 'estado-hidden';

      // Botón que abre el menú y muestra estado + puntito
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

      // Menú con opciones + “(Sin filtro)”
      var ul = document.createElement('ul');
      ul.className = 'dropdown-menu w-100 shadow-sm';

      // Opción: sin filtro
      var liEmpty = document.createElement('li');
      var btnEmpty = document.createElement('button');
      btnEmpty.type = 'button';
      btnEmpty.className = 'dropdown-item d-flex justify-content-between align-items-center';
      btnEmpty.dataset.value = '';
      btnEmpty.innerHTML = `<span>(Sin filtro)</span><span class="estado-dot" style="--dot-color:#ccc;"></span>`;
      liEmpty.appendChild(btnEmpty);
      ul.appendChild(liEmpty);

      // Opciones por cada estado (con color)
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

      // Montaje
      wrapper.appendChild(hidden);
      wrapper.appendChild(toggle);
      wrapper.appendChild(ul);

      qContainer.innerHTML = '';
      qContainer.appendChild(wrapper);

      // Interacción: click en ítem → actualiza hidden, label y puntito
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

    // Renderiza input de texto simple para q
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

    // Bootstrap: detecta qué hay renderizado por el servidor y guarda su valor
    (function bootstrapMemory() {
      var currentField = qContainer.querySelector('[name="q"]');
      if (!currentField) return;

      // Si el servidor ya puso el dropdown (hidden), tomamos ese valor y ajustamos color inicial
      if (currentField.tagName === 'INPUT' && currentField.type === 'hidden') {
        lastEstadoValue = currentField.value || '';
        var toggleDot = qContainer.querySelector('#estado-toggle .estado-dot');
        if (toggleDot) toggleDot.style.setProperty('--dot-color', lastEstadoValue ? getColor(lastEstadoValue) : '#ccc');
        return;
      }

      // Si es un input de texto, recordamos lo tipeado
      if (currentField.tagName === 'INPUT') {
        lastTextValue = currentField.value || '';
      }
    })();

    // Cambio en el <select> (texto ↔ estado)
    bySelect.addEventListener('change', function () {
      var v = bySelect.value;

      // Guardar el valor actual antes de reemplazar el control
      var currentField = qContainer.querySelector('[name="q"]');
      if (currentField) {
        if (currentField.tagName === 'INPUT' && currentField.type === 'hidden') {
          lastEstadoValue = currentField.value || '';
        } else if (currentField.tagName === 'INPUT') {
          lastTextValue = currentField.value || '';
        }
      }

      // Render según selección
      if (v === 'estado') {
        renderEstadoDropdown(lastEstadoValue);
      } else {
        renderTextInput(lastTextValue);
      }
    });
  });
})();
