/**
 * app.js — Frontend DataVivienda v2
 * Incluye: navegación, formulario, importación masiva, dashboard, tabla
 */

'use strict';

// ═══════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
let todosLosRegistros = [];
let chartGrupo = null;
let chartTipo  = null;
let chartFracc = null;

// ═══════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════
const MES_MAP = {
  enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
  julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12,
  ene:1, feb:2, mar:3, abr:4, jun:6, jul:7, ago:8, sep:9, oct:10, nov:11, dic:12,
};

function convertirMes(val) {
  const str = String(val).trim().toLowerCase();
  const num = parseInt(str, 10);
  if (!isNaN(num) && num >= 1 && num <= 12) return num;
  return MES_MAP[str] || null;
}

function formatPeso(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
  }).format(n);
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ═══════════════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════════════
const TABS = {
  captura:   { title: 'Nueva Captura'   },
  importar:  { title: 'Importar Excel'  },
  dashboard: { title: 'Dashboard'       },
  registros: { title: 'Tabla de Datos'  },
};

function initNavegacion() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => activarTab(btn.dataset.tab));
  });
}

function activarTab(nombre) {
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === nombre)
  );
  document.querySelectorAll('.tab-panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${nombre}`)
  );
  document.getElementById('pageTitle').textContent = TABS[nombre]?.title || '';

  if (nombre === 'dashboard' || nombre === 'registros') cargarDatos();
}

// ═══════════════════════════════════════════════════════
// FORMULARIO — VALIDACIONES
// ═══════════════════════════════════════════════════════
const VALIDACIONES = {
  institucion:      (v) => v.trim() !== '' || 'La institución es obligatoria.',
  anio: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return 'El año debe ser un número.';
    if (n < 2010 || n > 2030) return 'El año debe estar entre 2010 y 2030.';
    return true;
  },
  mes: (v) => {
    if (v.trim() === '') return 'El mes es obligatorio.';
    if (!convertirMes(v)) return 'Mes inválido. Use 1-12 o nombre en español.';
    return true;
  },
  estado:           (v) => v.trim() !== '' || 'El estado es obligatorio.',
  municipio:        (v) => v.trim() !== '' || 'El municipio es obligatorio.',
  cp:               (v) => /^\d{5}$/.test(v.trim()) || 'El CP debe tener exactamente 5 dígitos.',
  empresa_comercial:(v) => v.trim() !== '' || 'La empresa comercial es obligatoria.',
  valor: (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return 'El valor debe ser numérico.';
    if (n < 300000) return 'El valor mínimo es $300,000.';
    return true;
  },
  segmento:  (v) => v.trim() !== '' || 'El segmento es obligatorio.',
  count: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) return 'El count debe ser un entero positivo.';
    return true;
  },
  tipo_vivienda: (v) => {
    if (!['VIVIENDA NUEVA','VIVIENDA USADA'].includes(v.toUpperCase()))
      return 'Seleccione un tipo de vivienda válido.';
    return true;
  },
  grupo: (v) => {
    if (!['Bancos','Infonavit','Fovissste'].includes(v))
      return 'Seleccione un grupo válido.';
    return true;
  },
  fraccionamiento: (v) => v.trim() !== '' || 'El fraccionamiento es obligatorio.',
};

function setFieldError(campo, msg) {
  const input = document.getElementById(campo);
  const errEl = document.getElementById(`err-${campo}`);
  if (!input || !errEl) return;
  if (msg) {
    errEl.textContent = msg;
    input.classList.add('invalid');
    input.classList.remove('valid');
  } else {
    errEl.textContent = '';
    input.classList.remove('invalid');
    input.classList.add('valid');
  }
}

function validarCampo(campo) {
  const input = document.getElementById(campo);
  if (!input) return true;
  const res = VALIDACIONES[campo]?.(input.value);
  if (res === true) { setFieldError(campo, null); return true; }
  else              { setFieldError(campo, res);  return false; }
}

function initValidacionesEnVivo() {
  Object.keys(VALIDACIONES).forEach((campo) => {
    const input = document.getElementById(campo);
    if (input) {
      input.addEventListener('blur',  () => validarCampo(campo));
      input.addEventListener('input', () => { if (input.value.trim()) setFieldError(campo, null); });
    }
  });
}

// ═══════════════════════════════════════════════════════
// FORMULARIO — ENVÍO
// ═══════════════════════════════════════════════════════
function initFormulario() {
  const form    = document.getElementById('capturaForm');
  const btnSave = document.getElementById('btnGuardar');

  document.getElementById('btnLimpiar').addEventListener('click', limpiarFormulario);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let hayErrores = false;
    Object.keys(VALIDACIONES).forEach((c) => { if (!validarCampo(c)) hayErrores = true; });
    if (hayErrores) { mostrarAlerta('Corrija los errores marcados antes de guardar.', 'error'); return; }

    const payload = {};
    Object.keys(VALIDACIONES).forEach((c) => {
      const el = document.getElementById(c);
      if (el) payload[c] = el.value;
    });

    btnSave.disabled = true;
    btnSave.innerHTML = '<span class="spinner"></span> Guardando…';

    try {
      const resp = await fetch('/guardar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (data.ok) {
        mostrarAlerta('✓ Registro guardado correctamente.', 'success');
        limpiarFormulario();
        actualizarStatTotal();
      } else {
        mostrarAlerta(data.errores?.join(' | ') || 'Error al guardar.', 'error');
      }
    } catch {
      mostrarAlerta('No se pudo conectar con el servidor.', 'error');
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Guardar Registro`;
    }
  });
}

function limpiarFormulario() {
  document.getElementById('capturaForm').reset();
  Object.keys(VALIDACIONES).forEach((c) => {
    document.getElementById(c)?.classList.remove('valid', 'invalid');
    setFieldError(c, null);
  });
  ocultarAlerta();
}

// ═══════════════════════════════════════════════════════
// ALERTAS (formulario)
// ═══════════════════════════════════════════════════════
function mostrarAlerta(msg, tipo = 'error') {
  const el = document.getElementById('formAlert');
  el.textContent = msg;
  el.className = `alert ${tipo}`;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (tipo === 'success') setTimeout(ocultarAlerta, 4000);
}

function ocultarAlerta() {
  document.getElementById('formAlert').className = 'alert hidden';
}

// ═══════════════════════════════════════════════════════
// IMPORTACIÓN MASIVA DE EXCEL
// ═══════════════════════════════════════════════════════
let archivoSeleccionado = null;

function initImportacion() {
  const dropZone    = document.getElementById('dropZone');
  const fileInput   = document.getElementById('archivoExcel');
  const importFile  = document.getElementById('importFile');
  const fileName    = document.getElementById('importFileName');
  const btnImportar = document.getElementById('btnImportar');
  const btnRemove   = document.getElementById('btnRemoveFile');
  const result      = document.getElementById('importResult');
  const progressWrap= document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const progressLbl = document.getElementById('progressLabel');

  // Drag & Drop
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) seleccionarArchivo(file);
  });

  // Click en input
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) seleccionarArchivo(fileInput.files[0]);
  });

  // Quitar archivo
  btnRemove.addEventListener('click', () => {
    archivoSeleccionado = null;
    fileInput.value = '';
    importFile.classList.add('hidden');
    btnImportar.disabled = true;
    result.className = 'import-result hidden';
  });

  // Importar
  btnImportar.addEventListener('click', async () => {
    if (!archivoSeleccionado) return;

    // UI: mostrar progreso
    btnImportar.disabled = true;
    btnImportar.innerHTML = '<span class="spinner"></span> Importando…';
    result.className = 'import-result hidden';
    progressWrap.classList.remove('hidden');
    progressBar.style.width = '60%';
    progressLbl.textContent = 'Enviando archivo al servidor…';

    const formData = new FormData();
    formData.append('archivo', archivoSeleccionado);

    try {
      progressBar.style.width = '80%';
      progressLbl.textContent = 'Procesando registros…';

      const resp = await fetch('/importar', { method: 'POST', body: formData });
      const data = await resp.json();

      progressBar.style.width = '100%';
      progressLbl.textContent = 'Completado';

      setTimeout(() => progressWrap.classList.add('hidden'), 800);

      if (data.ok) {
        result.className = 'import-result success';
        result.innerHTML = `
          ✓ ${data.mensaje}<br>
          <small style="opacity:.8">
            ${data.insertados} insertados
            ${data.errores > 0 ? `· ${data.errores} con error` : ''}
          </small>
          ${data.detalleErrores?.length ? `<br><small style="opacity:.6">${data.detalleErrores.join('<br>')}</small>` : ''}
        `;
        actualizarStatTotal();
      } else {
        result.className = 'import-result error';
        result.textContent = data.errores?.join(' | ') || 'Error al importar.';
      }
    } catch {
      progressWrap.classList.add('hidden');
      result.className = 'import-result error';
      result.textContent = 'No se pudo conectar con el servidor.';
    } finally {
      btnImportar.disabled = false;
      btnImportar.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Importar Registros`;
    }
  });

  function seleccionarArchivo(file) {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      alert('Solo se aceptan archivos .xlsx o .xls');
      return;
    }
    archivoSeleccionado = file;
    fileName.textContent = file.name;
    importFile.classList.remove('hidden');
    btnImportar.disabled = false;
    result.className = 'import-result hidden';
  }
}

// ═══════════════════════════════════════════════════════
// CARGA DE DATOS
// ═══════════════════════════════════════════════════════
async function cargarDatos() {
  try {
    const resp = await fetch('/datos');
    const data = await resp.json();
    if (data.ok) {
      todosLosRegistros = data.registros || [];
      renderDashboard(todosLosRegistros);
      renderTabla(todosLosRegistros);
      document.getElementById('statTotal').textContent = todosLosRegistros.length;
    }
  } catch (e) { console.warn('Error cargando datos:', e); }
}

async function actualizarStatTotal() {
  try {
    const resp = await fetch('/datos');
    const data = await resp.json();
    if (data.ok) {
      todosLosRegistros = data.registros || [];
      document.getElementById('statTotal').textContent = todosLosRegistros.length;
    }
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════
function renderDashboard(registros) {
  const total    = registros.length;
  const promedio = total ? registros.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0) / total : 0;
  const nueva    = registros.filter(r => String(r.tipo_vivienda).includes('NUEVA')).length;
  const usada    = registros.filter(r => String(r.tipo_vivienda).includes('USADA')).length;

  document.getElementById('kpiTotal').textContent    = total.toLocaleString('es-MX');
  document.getElementById('kpiPromedio').textContent = total ? formatPeso(promedio) : '—';
  document.getElementById('kpiNueva').textContent    = nueva.toLocaleString('es-MX');
  document.getElementById('kpiUsada').textContent    = usada.toLocaleString('es-MX');

  const paleta = ['#3d7fff','#a855f7','#ec4899','#22c55e','#f59e0b','#14b8a6'];

  // Gráfica Grupo
  const gruposConteo = {};
  registros.forEach(r => { const g = r.grupo || 'N/D'; gruposConteo[g] = (gruposConteo[g] || 0) + 1; });
  if (chartGrupo) chartGrupo.destroy();
  chartGrupo = new Chart(document.getElementById('chartGrupo').getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(gruposConteo),
      datasets: [{ data: Object.values(gruposConteo), backgroundColor: paleta, borderColor: '#161b24', borderWidth: 3, hoverOffset: 6 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: '#6b7a99', padding: 14, font: { family: 'IBM Plex Sans', size: 11 } } } },
    },
  });

  // Gráfica Tipo
  if (chartTipo) chartTipo.destroy();
  chartTipo = new Chart(document.getElementById('chartTipo').getContext('2d'), {
    type: 'bar',
    data: {
      labels: ['Vivienda Nueva', 'Vivienda Usada'],
      datasets: [{
        label: 'Cantidad', data: [nueva, usada],
        backgroundColor: ['rgba(34,197,94,.7)','rgba(245,158,11,.7)'],
        borderColor: ['#22c55e','#f59e0b'], borderWidth: 1.5, borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b7a99', font: { family: 'IBM Plex Sans', size: 11 } }, grid: { color: '#2a3347' } },
        y: { beginAtZero: true, ticks: { color: '#6b7a99', font: { family: 'IBM Plex Mono', size: 11 }, stepSize: 1 }, grid: { color: '#2a3347' } },
      },
    },
  });

  // Gráfica Fraccionamientos Top 10
  const fraccMap = {};
  registros.forEach(r => {
    const f = r.fraccionamiento || 'N/D';
    if (!fraccMap[f]) fraccMap[f] = { suma: 0, count: 0 };
    fraccMap[f].suma  += parseFloat(r.valor) || 0;
    fraccMap[f].count += 1;
  });
  const top10 = Object.entries(fraccMap)
    .map(([k, v]) => ({ nombre: k, promedio: v.suma / v.count }))
    .sort((a, b) => b.promedio - a.promedio)
    .slice(0, 10);

  if (chartFracc) chartFracc.destroy();
  chartFracc = new Chart(document.getElementById('chartFracc').getContext('2d'), {
    type: 'bar',
    data: {
      labels: top10.map(f => f.nombre),
      datasets: [{ label: 'Valor Promedio', data: top10.map(f => f.promedio), backgroundColor: 'rgba(61,127,255,.7)', borderColor: '#3d7fff', borderWidth: 1.5, borderRadius: 4 }],
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ' ' + formatPeso(ctx.raw) } } },
      scales: {
        x: { ticks: { color: '#6b7a99', font: { family: 'IBM Plex Mono', size: 10 }, callback: (v) => '$' + Intl.NumberFormat('es-MX').format(v) }, grid: { color: '#2a3347' } },
        y: { ticks: { color: '#6b7a99', font: { family: 'IBM Plex Sans', size: 11 } }, grid: { display: false } },
      },
    },
  });
}

function initFiltroDashboard() {
  document.getElementById('btnFiltrar').addEventListener('click', aplicarFiltro);
  document.getElementById('btnLimpiarFiltro').addEventListener('click', () => {
    document.getElementById('filtroFraccionamiento').value = '';
    renderDashboard(todosLosRegistros);
  });
  document.getElementById('filtroFraccionamiento').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') aplicarFiltro();
  });
}

function aplicarFiltro() {
  const q = document.getElementById('filtroFraccionamiento').value.trim().toLowerCase();
  const filtrados = q
    ? todosLosRegistros.filter(r => String(r.fraccionamiento || '').toLowerCase().includes(q))
    : todosLosRegistros;
  renderDashboard(filtrados);
}

// ═══════════════════════════════════════════════════════
// TABLA
// ═══════════════════════════════════════════════════════
const MESES_NOMBRE = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function renderTabla(registros) {
  const tbody = document.getElementById('tableBody');
  if (!registros.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="14">Sin registros encontrados.</td></tr>`;
    return;
  }
  tbody.innerHTML = registros.map((r, i) => {
    const tipoClass  = String(r.tipo_vivienda || '').includes('NUEVA') ? 'nueva' : 'usada';
    const grupoClass = String(r.grupo || '').toLowerCase();
    return `
      <tr>
        <td>${i + 1}</td>
        <td>${r.institucion || ''}</td>
        <td>${r.anio || ''}</td>
        <td>${MESES_NOMBRE[r.mes] || r.mes || ''}</td>
        <td>${r.estado || ''}</td>
        <td>${r.municipio || ''}</td>
        <td>${r.cp || ''}</td>
        <td>${r.empresa_comercial || ''}</td>
        <td class="valor-cell">${r.valor ? formatPeso(r.valor) : ''}</td>
        <td>${r.segmento || ''}</td>
        <td>${r.count || ''}</td>
        <td><span class="badge badge--${tipoClass}">${r.tipo_vivienda || ''}</span></td>
        <td><span class="badge badge--${grupoClass}">${r.grupo || ''}</span></td>
        <td>${r.fraccionamiento || ''}</td>
      </tr>`;
  }).join('');
}

function initBusquedaTabla() {
  document.getElementById('tableSearch').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtrados = todosLosRegistros.filter(r =>
      Object.values(r).some(v => String(v || '').toLowerCase().includes(q))
    );
    renderTabla(filtrados);
  });
}

// ═══════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('topbarDate').textContent = fechaHoy();
  initNavegacion();
  initFormulario();
  initValidacionesEnVivo();
  initImportacion();
  initFiltroDashboard();
  initBusquedaTabla();
  document.getElementById('btnRefresh').addEventListener('click', cargarDatos);
  actualizarStatTotal();
});
