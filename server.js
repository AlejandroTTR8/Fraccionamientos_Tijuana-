/**
 * server.js - Backend con PostgreSQL + importación masiva de Excel
 */
 
const express = require('express');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');
const multer = require('multer');
const path = require('path');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
// ─── Conexión a PostgreSQL ─────────────────────────────────────────────────
// Railway inyecta DATABASE_URL automáticamente
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});
 
// ─── Multer: recibir archivos Excel en memoria ─────────────────────────────
const upload = multer({ storage: multer.memoryStorage() });
 
// ─── Middleware ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
 
// ─── Crear tabla si no existe ──────────────────────────────────────────────
async function inicializarDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS viviendas (
      id               SERIAL PRIMARY KEY,
      institucion      TEXT,
      anio             INTEGER,
      mes              INTEGER,
      estado           TEXT,
      municipio        TEXT,
      cp               TEXT,
      empresa_comercial TEXT,
      valor            NUMERIC,
      segmento         TEXT,
      count            INTEGER,
      tipo_vivienda    TEXT,
      grupo            TEXT,
      fraccionamiento  TEXT,
      created_at       TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('✅ Tabla viviendas lista');
}
 
// ─── Listas de valores permitidos ─────────────────────────────────────────
const GRUPOS_VALIDOS       = ['Bancos', 'Infonavit', 'Fovissste'];
const TIPOS_VIVIENDA_VALIDOS = ['VIVIENDA NUEVA', 'VIVIENDA USADA'];
 
// ─── Conversión de mes ─────────────────────────────────────────────────────
const MES_MAP = {
  enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6,
  julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12,
  ene:1, feb:2, mar:3, abr:4, jun:6, jul:7, ago:8, sep:9, oct:10, nov:11, dic:12,
};
 
function convertirMes(val) {
  if (val === null || val === undefined || val === '') return null;
  const str = String(val).trim().toLowerCase();
  const num = parseInt(str, 10);
  if (!isNaN(num) && num >= 1 && num <= 12) return num;
  return MES_MAP[str] || null;
}
 
// ─── Validación ────────────────────────────────────────────────────────────
function validarDatos(data) {
  const errores = [];
  const campos = [
    'institucion','anio','mes','estado','municipio','cp',
    'empresa_comercial','valor','segmento','count','tipo_vivienda','grupo','fraccionamiento'
  ];
  campos.forEach(c => {
    if (data[c] === undefined || data[c] === null || String(data[c]).trim() === '')
      errores.push(`El campo "${c}" es obligatorio.`);
  });
  if (errores.length) return errores;
 
  const anio = parseInt(data.anio, 10);
  if (isNaN(anio) || anio < 2010 || anio > 2030)
    errores.push('El año debe estar entre 2010 y 2030.');
 
  if (!convertirMes(data.mes))
    errores.push('El mes no es válido.');
 
  if (!/^\d{5}$/.test(String(data.cp).trim()))
    errores.push('El CP debe tener exactamente 5 dígitos.');
 
  const valor = parseFloat(data.valor);
  if (isNaN(valor) || valor < 300000)
    errores.push('El valor debe ser mayor o igual a 300,000.');
 
  if (!GRUPOS_VALIDOS.includes(data.grupo))
    errores.push(`GRUPO debe ser: ${GRUPOS_VALIDOS.join(', ')}.`);
 
  if (!TIPOS_VIVIENDA_VALIDOS.includes(String(data.tipo_vivienda).toUpperCase()))
    errores.push(`Tipo de vivienda debe ser: ${TIPOS_VIVIENDA_VALIDOS.join(' o ')}.`);
 
  const count = parseInt(data.count, 10);
  if (isNaN(count) || count < 1)
    errores.push('El COUNT debe ser un entero positivo.');
 
  return errores;
}
 
// ─── Sanitizar ─────────────────────────────────────────────────────────────
function sanitizar(data) {
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
 
// ─── INSERT helper ─────────────────────────────────────────────────────────
async function insertarRegistro(d) {
  await pool.query(`
    INSERT INTO viviendas
      (institucion, anio, mes, estado, municipio, cp, empresa_comercial,
       valor, segmento, count, tipo_vivienda, grupo, fraccionamiento)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `, [
    d.institucion, d.anio, d.mes, d.estado, d.municipio, d.cp,
    d.empresa_comercial, d.valor, d.segmento, d.count,
    d.tipo_vivienda, d.grupo, d.fraccionamiento,
  ]);
}
 
// ═══════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════
 
// ─── POST /guardar ─────────────────────────────────────────────────────────
app.post('/guardar', async (req, res) => {
  try {
    const errores = validarDatos(req.body);
    if (errores.length) return res.status(400).json({ ok: false, errores });
 
    const datos = sanitizar(req.body);
    await insertarRegistro(datos);
    res.json({ ok: true, mensaje: 'Registro guardado correctamente.', datos });
  } catch (err) {
    console.error('[POST /guardar]', err.message);
    res.status(500).json({ ok: false, errores: ['Error interno del servidor.'] });
  }
});
 
// ─── GET /datos ────────────────────────────────────────────────────────────
app.get('/datos', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM viviendas ORDER BY id ASC'
    );
    res.json({ ok: true, registros: result.rows });
  } catch (err) {
    console.error('[GET /datos]', err.message);
    res.status(500).json({ ok: false, errores: ['Error al leer los datos.'] });
  }
});
 
// ─── POST /importar ────────────────────────────────────────────────────────
// Recibe un archivo .xlsx y carga todos los registros válidos
app.post('/importar', upload.single('archivo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, errores: ['No se recibió ningún archivo.'] });
  }
 
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
 
    // Tomar la primera hoja
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return res.status(400).json({ ok: false, errores: ['El Excel no tiene hojas.'] });
    }
 
    // Leer encabezados de la fila 1 y mapear a claves internas
    const headerRow = sheet.getRow(1).values.slice(1); // slice(1) porque index 0 es null
    const HEADER_MAP = {
      'institución': 'institucion', 'institucion': 'institucion',
      'año':         'anio',        'anio': 'anio',
      'mes':         'mes',
      'estado':      'estado',
      'municipio':   'municipio',
      'cp':          'cp',          'código postal': 'cp', 'codigo postal': 'cp',
      'empresa comercial': 'empresa_comercial', 'empresa_comercial': 'empresa_comercial',
      'valor':       'valor',
      'segmento':    'segmento',
      'count':       'count',
      'tipo de vivienda': 'tipo_vivienda', 'tipo_vivienda': 'tipo_vivienda',
      'grupo':       'grupo',
      'fraccionamiento': 'fraccionamiento',
    };
 
    // Construir mapa de columna → clave
    const colMap = {}; // { colIndex: 'clave_interna' }
    headerRow.forEach((h, i) => {
      if (!h) return;
      const norm = String(h).trim().toLowerCase();
      const clave = HEADER_MAP[norm];
      if (clave) colMap[i] = clave;
    });
 
    let insertados = 0;
    let errores    = 0;
    const detalleErrores = [];
 
    // Recorrer filas de datos (desde fila 2)
    const filas = [];
    sheet.eachRow((row, rowNum) => {
      if (rowNum === 1) return;
      const obj = {};
      row.values.slice(1).forEach((val, i) => {
        const clave = colMap[i];
        if (clave) obj[clave] = val !== null && val !== undefined ? String(val).trim() : '';
      });
      if (Object.keys(obj).length > 0) filas.push({ rowNum, obj });
    });
 
    // Insertar en lotes para no saturar la DB
    for (const { rowNum, obj } of filas) {
      try {
        // Sanitización básica sin validación estricta de grupo/tipo
        // para ser tolerante con datos históricos
        const d = {
          institucion:       obj.institucion       || '',
          anio:              parseInt(obj.anio, 10) || 0,
          mes:               convertirMes(obj.mes) || 0,
          estado:            obj.estado             || '',
          municipio:         obj.municipio          || '',
          cp:                obj.cp                 || '',
          empresa_comercial: obj.empresa_comercial  || '',
          valor:             parseFloat(obj.valor)  || 0,
          segmento:          obj.segmento           || '',
          count:             parseInt(obj.count, 10)|| 1,
          tipo_vivienda:     String(obj.tipo_vivienda || '').toUpperCase(),
          grupo:             obj.grupo              || '',
          fraccionamiento:   obj.fraccionamiento    || '',
        };
 
        await insertarRegistro(d);
        insertados++;
      } catch (e) {
        errores++;
        if (detalleErrores.length < 10) {
          detalleErrores.push(`Fila ${rowNum}: ${e.message}`);
        }
      }
    }
 
    res.json({
      ok: true,
      mensaje: `Importación completada: ${insertados} registros insertados, ${errores} con error.`,
      insertados,
      errores,
      detalleErrores,
    });
 
  } catch (err) {
    console.error('[POST /importar]', err.message);
    res.status(500).json({ ok: false, errores: [`Error al procesar el Excel: ${err.message}`] });
  }
});
 
// ─── GET / ─────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
 
// ─── Arranque ──────────────────────────────────────────────────────────────
inicializarDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Error conectando a la DB:', err.message);
    process.exit(1);
  });
 
