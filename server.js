/**
 * server.js - Backend principal del sistema de captura de viviendas
 * Node.js + Express + ExcelJS
 */

const express = require('express');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Rutas de archivos ─────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const EXCEL_PATH = path.join(DATA_DIR, 'viviendas.xlsx');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ─── Middleware ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

// Crear directorio /data si no existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── Columnas del Excel ────────────────────────────────────────────────────
const COLUMNS = [
  { header: 'INSTITUCIÓN',        key: 'institucion',        width: 20 },
  { header: 'AÑO',                key: 'anio',               width: 8  },
  { header: 'MES',                key: 'mes',                width: 8  },
  { header: 'ESTADO',             key: 'estado',             width: 20 },
  { header: 'MUNICIPIO',          key: 'municipio',          width: 20 },
  { header: 'CP',                 key: 'cp',                 width: 8  },
  { header: 'EMPRESA COMERCIAL',  key: 'empresa_comercial',  width: 25 },
  { header: 'VALOR',              key: 'valor',              width: 15 },
  { header: 'SEGMENTO',           key: 'segmento',           width: 15 },
  { header: 'COUNT',              key: 'count',              width: 8  },
  { header: 'TIPO DE VIVIENDA',   key: 'tipo_vivienda',      width: 20 },
  { header: 'GRUPO',              key: 'grupo',              width: 15 },
  { header: 'FRACCIONAMIENTO',    key: 'fraccionamiento',    width: 25 },
];

// ─── Listas de valores permitidos ─────────────────────────────────────────
const GRUPOS_VALIDOS = ['Bancos', 'Infonavit', 'Fovissste'];
const TIPOS_VIVIENDA_VALIDOS = ['VIVIENDA NUEVA', 'VIVIENDA USADA'];

// ─── Conversión de mes texto → número ─────────────────────────────────────
const MES_MAP = {
  enero: 1, febrero: 2, marzo: 3, abril: 4,
  mayo: 5, junio: 6, julio: 7, agosto: 8,
  septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  // abreviaciones
  ene: 1, feb: 2, mar: 3, abr: 4,
  jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

function convertirMes(mes) {
  if (typeof mes === 'number') {
    const n = Math.round(mes);
    return (n >= 1 && n <= 12) ? n : null;
  }
  const str = String(mes).trim().toLowerCase();
  // Si es numérico
  const num = parseInt(str, 10);
  if (!isNaN(num) && num >= 1 && num <= 12) return num;
  // Si es texto
  return MES_MAP[str] || null;
}

// ─── Función: inicializar o abrir el Excel ─────────────────────────────────
async function obtenerWorkbook() {
  const workbook = new ExcelJS.Workbook();

  if (fs.existsSync(EXCEL_PATH)) {
    await workbook.xlsx.readFile(EXCEL_PATH);
    // Verificar que la hoja existe
    let sheet = workbook.getWorksheet('Viviendas');
    if (!sheet) {
      sheet = workbook.addWorksheet('Viviendas');
      sheet.columns = COLUMNS;
      aplicarEstiloEncabezado(sheet);
    }
  } else {
    // Crear libro nuevo
    const sheet = workbook.addWorksheet('Viviendas');
    sheet.columns = COLUMNS;
    aplicarEstiloEncabezado(sheet);
  }

  return workbook;
}

// ─── Estilo a encabezados ──────────────────────────────────────────────────
function aplicarEstiloEncabezado(sheet) {
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A3C5E' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF0D2137' } },
    };
  });
  headerRow.height = 22;
}

// ─── Validación del payload ────────────────────────────────────────────────
function validarDatos(data) {
  const errores = [];

  // Campos obligatorios
  const camposReq = [
    'institucion', 'anio', 'mes', 'estado', 'municipio', 'cp',
    'empresa_comercial', 'valor', 'segmento', 'count', 'tipo_vivienda',
    'grupo', 'fraccionamiento',
  ];
  camposReq.forEach((c) => {
    if (data[c] === undefined || data[c] === null || String(data[c]).trim() === '') {
      errores.push(`El campo "${c}" es obligatorio.`);
    }
  });

  if (errores.length > 0) return errores;

  // Año
  const anio = parseInt(data.anio, 10);
  if (isNaN(anio) || anio < 2010 || anio > 2030) {
    errores.push('El año debe estar entre 2010 y 2030.');
  }

  // Mes
  const mes = convertirMes(data.mes);
  if (!mes) {
    errores.push('El mes no es válido. Use número (1-12) o nombre en español.');
  }

  // CP
  const cpStr = String(data.cp).trim();
  if (!/^\d{5}$/.test(cpStr)) {
    errores.push('El CP debe tener exactamente 5 dígitos numéricos.');
  }

  // Valor
  const valor = parseFloat(data.valor);
  if (isNaN(valor) || valor < 300000) {
    errores.push('El valor debe ser un número mayor o igual a 300,000.');
  }

  // GRUPO
  if (!GRUPOS_VALIDOS.includes(data.grupo)) {
    errores.push(`El GRUPO debe ser uno de: ${GRUPOS_VALIDOS.join(', ')}.`);
  }

  // Tipo de vivienda
  if (!TIPOS_VIVIENDA_VALIDOS.includes(String(data.tipo_vivienda).toUpperCase())) {
    errores.push(`El tipo de vivienda debe ser: ${TIPOS_VIVIENDA_VALIDOS.join(' o ')}.`);
  }

  // Count
  const count = parseInt(data.count, 10);
  if (isNaN(count) || count < 1) {
    errores.push('El COUNT debe ser un número entero positivo.');
  }

  return errores;
}

// ─── Sanitizar datos ───────────────────────────────────────────────────────
function sanitizarDatos(data) {
  return {
    institucion:       String(data.institucion).trim(),
    anio:              parseInt(data.anio, 10),
    mes:               convertirMes(data.mes),
    estado:            String(data.estado).trim(),
    municipio:         String(data.municipio).trim(),
    cp:                String(data.cp).trim(),
    empresa_comercial: String(data.empresa_comercial).trim(),
    valor:             parseFloat(data.valor),
    segmento:          String(data.segmento).trim(),
    count:             parseInt(data.count, 10),
    tipo_vivienda:     String(data.tipo_vivienda).trim().toUpperCase(),
    grupo:             String(data.grupo).trim(),
    fraccionamiento:   String(data.fraccionamiento).trim(),
  };
}

// ─── ENDPOINT: POST /guardar ───────────────────────────────────────────────
app.post('/guardar', async (req, res) => {
  try {
    const errores = validarDatos(req.body);
    if (errores.length > 0) {
      return res.status(400).json({ ok: false, errores });
    }

    const datos = sanitizarDatos(req.body);
    const workbook = await obtenerWorkbook();
    const sheet = workbook.getWorksheet('Viviendas');

    // Añadir fila
    sheet.addRow([
      datos.institucion,
      datos.anio,
      datos.mes,
      datos.estado,
      datos.municipio,
      datos.cp,
      datos.empresa_comercial,
      datos.valor,
      datos.segmento,
      datos.count,
      datos.tipo_vivienda,
      datos.grupo,
      datos.fraccionamiento,
    ]);

    await workbook.xlsx.writeFile(EXCEL_PATH);

    return res.json({ ok: true, mensaje: 'Registro guardado correctamente.', datos });
  } catch (error) {
    console.error('[POST /guardar]', error);
    return res.status(500).json({ ok: false, errores: ['Error interno del servidor.'] });
  }
});

// ─── ENDPOINT: GET /datos ──────────────────────────────────────────────────
app.get('/datos', async (req, res) => {
  try {
    if (!fs.existsSync(EXCEL_PATH)) {
      return res.json({ ok: true, registros: [] });
    }

    const workbook = await obtenerWorkbook();
    const sheet = workbook.getWorksheet('Viviendas');
    const registros = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Saltar encabezado
      const vals = row.values.slice(1); // index 0 es null en exceljs
      if (!vals[0]) return; // Fila vacía
      registros.push({
        institucion:       vals[0],
        anio:              vals[1],
        mes:               vals[2],
        estado:            vals[3],
        municipio:         vals[4],
        cp:                vals[5],
        empresa_comercial: vals[6],
        valor:             vals[7],
        segmento:          vals[8],
        count:             vals[9],
        tipo_vivienda:     vals[10],
        grupo:             vals[11],
        fraccionamiento:   vals[12],
      });
    });

    return res.json({ ok: true, registros });
  } catch (error) {
    console.error('[GET /datos]', error);
    return res.status(500).json({ ok: false, errores: ['Error al leer los datos.'] });
  }
});

// ─── Ruta raíz ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ─── Iniciar servidor ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📁 Excel en: ${EXCEL_PATH}`);
});
