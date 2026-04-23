/**
 * app.js — Frontend del Sistema de Viviendas
 * Maneja: navegación, formulario, validaciones, dashboard, tabla
 */

'use strict';

// ═══════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════
let todosLosRegistros = [];  // cache de datos del servidor
let chartGrupo = null;
let chartTipo  = null;
let chartFracc = null;

// ═══════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════

/** Convierte mes texto o número → número */
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

/** Formatear número como moneda MXN */
function formatPeso(n) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency', currency: 'MXN', maximumFractionDigits: 0,
  }).format(n);
}

/** Obtener fecha y hora en formato legible */
function fechaHoy() {
  return new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ═══════════════════════════════════════════════════════
// NAVEGACIÓN ENTRE PESTAÑAS
// ═══════════════════════════════════════════════════════
const TABS = {
  captura:   { btn: null, panel: null, title: 'Nueva Captura'    },
  dashboard: { btn: null, panel: null, title: 'Dashboard'        },
  registros: { btn: null, panel: null, title: 'Tabla de Datos'   },
};

function initNavegacion() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    const tab = btn.dataset.tab;
    TABS[tab].btn   = btn;
    TABS[tab].panel = document.getElementById(`tab-${tab}`);

    btn.addEventListener('click', () => activarTab(tab));
  });
}

function activarTab(nombre) {
  Object.entries(TABS).forEach(([key, t]) => {
    const isActive = key === nombre;
    t.btn  && t.btn.classList.toggle('active', isActive);
    t.panel && t.panel.classList.toggle('active', isActive);
  });
  document.getElementById('pageTitle').textContent = TABS[nombre].title;

  // Cargar datos al entrar al dashboard o registros
  if (nombre === 'dashboard' || nombre === 'registros') {
    cargarDatos();
  }
}

// ═══════════════════════════════════════════════════════
// FORMULARIO — VALIDACIONES FRONTEND
// ═══════════════════════════════════════════════════════

/**
 * Reglas de validación por campo.
 * Cada regla devuelve true si es válido, o un string de error.
 */
const VALIDACIONES = {
  institucion: (v) => v.trim() !== '' || 'La institución es obligatoria.',
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
  estado: (v) => v.trim() !== '' || 'El estado es obligatorio.',
  municipio: (v) => v.trim() !== '' || 'El municipio es obligatorio.',
  cp: (v) => {
    if (!/^\d{5}$/.test(v.trim())) return 'El CP debe tener exactamente 5 dígitos.';
    return true;
  },
  empresa_comercial: (v) => v.trim() !== '' || 'La empresa comercial es obligatoria.',
  valor: (v) => {
    const n = parseFloat(v);
    if (isNaN(n)) return 'El valor debe ser numérico.';
    if (n < 300000) return 'El valor mínimo es $300,000.';
    return true;
  },
  segmento: (v) => v.trim() !== '' || 'El segmento es obligatorio.',
  count: (v) => {
    const n = parseInt(v, 10);
    if (isNaN(n) || n < 1) return 'El count debe ser un entero positivo.';
    return true;
  },
  tipo_vivienda: (v) => {
    const vals = ['VIVIENDA NUEVA', 'VIVIENDA USADA'];
    if (!vals.includes(v.toUpperCase())) return 'Seleccione un tipo de vivienda válido.';
    return true;
  },
  grupo: (v) => {
    const vals = ['Bancos', 'Infonavit', 'Fovissste'];
    if (!vals.includes(v)) return 'Seleccione un grupo válido.';
    return true;
  },
  fraccionamiento: (v) => v.trim() !== '' || 'El fraccionamiento es obligatorio.',
};

/** Mostrar/ocultar error de un campo */
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

/** Validar un solo campo */
function validarCampo(campo) {
  const input = document.getElementById(campo);
  if (!input) return true;
  const resultado = VALIDACIONES[campo]?.(input.value);
  if (resultado === true) {
    setFieldError(campo, null);
    return true;
  } else {
    setFieldError(campo, resultado);
    return false;
  }
}

/** Agregar validación en tiempo real (blur) */
function initValidacionesEnVivo() {
  Object.keys(VALIDACIONES).forEach((campo) => {
    const input = document.getElementById(campo);
    if (input) {
      input.addEventListener('blur', () => validarCampo(campo));
      input.addEventListener('input', () => {
        // Limpiar error si ya tiene contenido
        if (input.value.trim()) setFieldError(campo, null);
      });
    }
  });
}

// ═══════════════════════════════════════════════════════
// FORMULARIO — ENVÍO
// ═══════════════════════════════════════════════════════
function initFormulario() {
  const form   = document.getElementById('capturaForm');
  const btnSave = document.getElementById('btnGuardar');
  const btnClr  = document.getElementById('btnLimpiar');

  // Limpiar formulario
  btnClr.addEventListener('click', limpiarFormulario);

  // Guardar
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validar todos los campos
    let hayErrores = false;
    Object.keys(VALIDACIONES).forEach((campo) => {
      if (!validarCampo(campo)) hayErrores = true;
    });
    if (hayErrores) {
      mostrarAlerta('Corrija los errores marcados antes de guardar.', 'error');
      return;
    }

    // Construir payload
    const payload = {};
    Object.keys(VALIDACIONES).forEach((campo) => {
      const input = document.getElementById(campo);
      if (input) payload[campo] = input.value;
    });

    // Mostrar spinner
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
        mostrarAlerta('✓ Registro guardado correctamente en el Excel.', 'success');
        limpiarFormulario();
        actualizarStatTotal();
      } else {
        const msgs = data.errores?.join(' | ') || 'Error al guardar.';
        mostrarAlerta(msgs, 'error');
      }
    } catch (err) {
      mostrarAlerta('No se pudo conectar con el servidor. Verifique que esté corriendo.', 'error');
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/>
          <polyline points="7 3 7 8 15 8"/>
        </svg>
        Guardar Registro`;
    }
  });
}

/** Limpiar todos los campos del formulario */
function limpiarFormulario() {
  document.getElementById('capturaForm').reset();
  Object.keys(VALIDACIONES).forEach((campo) => {
    const input = document.getElementById(campo);
    if (input) {
      input.classList.remove('valid', 'invalid');
    }
    setFieldError(campo, null);
  });
  ocultarAlerta();
}

// ═══════════════════════════════════════════════════════
// ALERTAS
// ═══════════════════════════════════════════════════════
function mostrarAlerta(msg, tipo = 'error') {
  const el = document.getElementById('formAlert');
  el.textContent = msg;
  el.className = `alert ${tipo}`;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Auto-ocultar en éxito después de 4s
  if (tipo === 'success') {
    setTimeout(ocultarAlerta, 4000);
  }
}

function ocultarAlerta() {
  const el = document.getElementById('formAlert');
  el.className = 'alert hidden';
}

// ═══════════════════════════════════════════════════════
// CARGA DE DATOS DESDE EL SERVIDOR
// ═══════════════════════════════════════════════════════
async function cargarDatos() {
  try {
    const resp = await fetch('/datos');
    const data = await resp.json();
    if (data.ok) {
      todosLosRegistros = data.registros || [];
      renderDashboard(todosLosRegistros);
      renderTabla(todosLosRegistros);
      actualizarStatTotal();
    }
  } catch (e) {
    console.warn('No se pudieron cargar los datos:', e);
  }
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
  // KPIs
  const total = registros.length;
  const promedio = total > 0
    ? registros.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0) / total
    : 0;
  const nueva = registros.filter(r => String(r.tipo_vivienda).toUpperCase() === 'VIVIENDA NUEVA').length;
  const usada = registros.filter(r => String(r.tipo_vivienda).toUpperCase() === 'VIVIENDA USADA').length;

  document.getElementById('kpiTotal').textContent   = total;
  document.getElementById('kpiPromedio').textContent = total ? formatPeso(promedio) : '—';
  document.getElementById('kpiNueva').textContent   = nueva;
  document.getElementById('kpiUsada').textContent   = usada;

  // Colores Chart.js adaptados al tema dark
  const paleta = ['#3d7fff','#a855f7','#ec4899','#22c55e','#f59e0b','#14b8a6'];
  const chartDefaults = {
    color: '#6b7a99',
    borderColor: '#2a3347',
    backgroundColor: 'transparent',
  };

  // ─ Gráfica: Grupo ─────────────────────────────────
  const gruposConteo = {};
  registros.forEach(r => {
    const g = r.grupo || 'Desconocido';
    gruposConteo[g] = (gruposConteo[g] || 0) + 1;
  });

  if (chartGrupo) chartGrupo.destroy();
  const ctxG = document.getElementById('chartGrupo').getContext('2d');
  chartGrupo = new Chart(ctxG, {
    type: 'doughnut',
    data: {
      labels: Object.keys(gruposConteo),
      datasets: [{
        data: Object.values(gruposConteo),
        backgroundColor: paleta,
        borderColor: '#161b24',
        borderWidth: 3,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#6b7a99', padding: 14, font: { family: 'IBM Plex Sans', size: 11 } },
        },
      },
      ...chartDefaults,
    },
  });

  // ─ Gráfica: Tipo de Vivienda ───────────────────────
  if (chartTipo) chartTipo.destroy();
  const ctxT = document.getElementById('chartTipo').getContext('2d');
  chartTipo = new Chart(ctxT, {
    type: 'bar',
    data: {
      labels: ['Vivienda Nueva', 'Vivienda Usada'],
      datasets: [{
        label: 'Cantidad',
        data: [nueva, usada],
        backgroundColor: ['rgba(34,197,94,.7)', 'rgba(245,158,11,.7)'],
        borderColor:     ['#22c55e', '#f59e0b'],
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: '#6b7a99', font: { family: 'IBM Plex Sans', size: 11 } },
          grid: { color: '#2a3347' },
        },
        y: {
          beginAtZero: true,
          ticks: { color: '#6b7a99', font: { family: 'IBM Plex Mono', size: 11 }, stepSize: 1 },
          grid: { color: '#2a3347' },
        },
      },
    },
  });

  // ─ Gráfica: Top 10 fraccionamientos por valor promedio ─
  const fraccMap = {};
  registros.forEach(r => {
    const f = r.fraccionamiento || 'N/D';
    if (!fraccMap[f]) fraccMap[f] = { suma: 0, count: 0 };
    fraccMap[f].suma  += parseFloat(r.valor) || 0;
    fraccMap[f].count += 1;
  });

  const fraccOrdenados = Object.entries(fraccMap)
    .map(([k, v]) => ({ nombre: k, promedio: v.suma / v.count }))
    .sort((a, b) => b.promedio - a.promedio)
    .slice(0, 10);

  if (chartFracc) chartFracc.destroy();
  const ctxF = document.getElementById('chartFracc').getContext('2d');
  chartFracc = new Chart(ctxF, {
    type: 'bar',
    data: {
      labels: fraccOrdenados.map(f => f.nombre),
      datasets: [{
        label: 'Valor Promedio',
        data: fraccOrdenados.map(f => f.promedio),
        backgroundColor: 'rgba(61,127,255,.7)',
        borderColor: '#3d7fff',
        borderWidth: 1.5,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ' ' + formatPeso(ctx.raw),
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#6b7a99',
            font: { family: 'IBM Plex Mono', size: 10 },
            callback: (v) => '$' + Intl.NumberFormat('es-MX').format(v),
          },
          grid: { color: '#2a3347' },
        },
        y: {
          ticks: { color: '#6b7a99', font: { family: 'IBM Plex Sans', size: 11 } },
          grid: { display: false },
        },
      },
    },
  });
}

// ─ Filtro de dashboard ─────────────────────────────────
function initFiltroDashboard() {
  document.getElementById('btnFiltrar').addEventListener('click', aplicarFiltroDashboard);
  document.getElementById('btnLimpiarFiltro').addEventListener('click', () => {
    document.getElementById('filtroFraccionamiento').value = '';
    renderDashboard(todosLosRegistros);
  });
  document.getElementById('filtroFraccionamiento').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') aplicarFiltroDashboard();
  });
}

function aplicarFiltroDashboard() {
  const filtro = document.getElementById('filtroFraccionamiento').value.trim().toLowerCase();
  if (!filtro) {
    renderDashboard(todosLosRegistros);
    return;
  }
  const filtrados = todosLosRegistros.filter(
    r => String(r.fraccionamiento || '').toLowerCase().includes(filtro)
  );
  renderDashboard(filtrados);
}

// ═══════════════════════════════════════════════════════
// TABLA DE REGISTROS
// ═══════════════════════════════════════════════════════
const MESES_NOMBRE = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function renderTabla(registros) {
  const tbody = document.getElementById('tableBody');

  if (!registros.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="14">Sin registros encontrados.</td></tr>`;
    return;
  }

  tbody.innerHTML = registros.map((r, i) => {
    const tipoClass = String(r.tipo_vivienda || '').includes('NUEVA') ? 'nueva' : 'usada';
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
      </tr>
    `;
  }).join('');
}

function initBusquedaTabla() {
  const input = document.getElementById('tableSearch');
  input.addEventListener('input', () => {
    const q = input.value.toLowerCase();
    const filtrados = todosLosRegistros.filter(r =>
      Object.values(r).some(v => String(v || '').toLowerCase().includes(q))
    );
    renderTabla(filtrados);
  });
}

function initRefreshTabla() {
  document.getElementById('btnRefresh').addEventListener('click', cargarDatos);
}

// ═══════════════════════════════════════════════════════
// TOPBAR FECHA
// ═══════════════════════════════════════════════════════
function initFecha() {
  document.getElementById('topbarDate').textContent = fechaHoy();
}

// ═══════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  initNavegacion();
  initFormulario();
  initValidacionesEnVivo();
  initFiltroDashboard();
  initBusquedaTabla();
  initRefreshTabla();
  initFecha();
  actualizarStatTotal();
});
