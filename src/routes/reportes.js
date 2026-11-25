const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { ErrorApi, asincrono, noEncontrado, parsearId } = require('../errores');
const { validarReporte, ESPECIES } = require('../validacion');
const { reporteAJson, seguimientoAJson, albergueAJson } = require('../mapeo');

const EXT_FOTO = ['.jpg', '.jpeg', '.png', '.webp'];
const EXT_AUDIO = ['.m4a', '.aac', '.mp3', '.wav', '.ogg'];
const MAX_FOTO = 5 * 1024 * 1024;
const MAX_AUDIO = 10 * 1024 * 1024;
const PATCHABLES = ['atendido', 'albergue_id', 'estado', 'urgencia', 'descripcion', 'cantidad_animales', 'tiene_collar'];

module.exports = (pool, config) => {
  const router = express.Router();
  const carpeta = config.carpetaSubidas;
  fs.mkdirSync(path.join(carpeta, 'fotos'), { recursive: true });
  fs.mkdirSync(path.join(carpeta, 'audios'), { recursive: true });

  const SELECT = `SELECT r.*, a.nombre AS albergue_nombre
                  FROM reportes r LEFT JOIN albergues a ON a.id = r.albergue_id`;

  const borrarArchivo = (ruta) => {
    if (!ruta) return;
    fs.rm(path.join(carpeta, ruta), { force: true }, () => {});
  };

  /* ---------- GET /api/reportes ---------- */
  router.get('/', asincrono(async (req, res) => {
    const { especie, urgencia, atendido, albergue_id, q } = req.query;
    const donde = [];
    const params = [];

    if (especie !== undefined) {
      if (!ESPECIES.includes(especie)) throw new ErrorApi(400, 'filtro_invalido', 'El filtro especie no es válido.');
      donde.push('r.especie = ?'); params.push(especie);
    }
    if (urgencia !== undefined) {
      if (!['1', '2', '3'].includes(urgencia)) throw new ErrorApi(400, 'filtro_invalido', 'El filtro urgencia debe ser 1, 2 o 3.');
      donde.push('r.urgencia = ?'); params.push(Number(urgencia));
    }
    if (atendido !== undefined) {
      if (!['0', '1', 'true', 'false'].includes(atendido)) throw new ErrorApi(400, 'filtro_invalido', 'El filtro atendido debe ser true o false.');
      donde.push('r.atendido = ?'); params.push(atendido === '1' || atendido === 'true' ? 1 : 0);
    }
    if (albergue_id !== undefined) {
      donde.push('r.albergue_id = ?'); params.push(parsearId(albergue_id));
    }
    if (typeof q === 'string' && q.trim()) {
      donde.push('r.descripcion LIKE ?'); params.push(`%${q.trim().replace(/[%_\\]/g, '\\$&')}%`);
    }

    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const clausula = donde.length ? `WHERE ${donde.join(' AND ')}` : '';

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM reportes r ${clausula}`, params);
    const [filas] = await pool.query(
      `${SELECT} ${clausula} ORDER BY r.fecha DESC, r.id DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]);
    res.json({ total, limit, offset, datos: filas.map(reporteAJson) });
  }));

  /* ---------- GET /api/reportes/:id ---------- */
  router.get('/:id', asincrono(async (req, res) => {
    const id = parsearId(req.params.id);
    const [filas] = await pool.query(`${SELECT} WHERE r.id = ?`, [id]);
    if (!filas.length) throw noEncontrado('Reporte');
    const reporte = reporteAJson(filas[0]);
    const [segs] = await pool.query(
      'SELECT * FROM seguimientos WHERE reporte_id = ? ORDER BY fecha DESC, id DESC', [id]);
    reporte.seguimientos = segs.map(seguimientoAJson);
    if (filas[0].albergue_id) {
      const [alb] = await pool.query('SELECT * FROM albergues WHERE id = ?', [filas[0].albergue_id]);
      reporte.albergue = alb.length ? albergueAJson(alb[0]) : null;
    } else {
      reporte.albergue = null;
    }
    res.json(reporte);
  }));

  /* ---------- POST /api/reportes (idempotente por id_cliente) ---------- */
  router.post('/', asincrono(async (req, res) => {
    const d = validarReporte(req.body);

    if (d.id_cliente) {
      const [existe] = await pool.query(`${SELECT} WHERE r.id_cliente = ?`, [d.id_cliente]);
      if (existe.length) return res.status(200).json(reporteAJson(existe[0]));
    }

    const [r] = await pool.query(
      `INSERT INTO reportes
         (id_cliente, especie, estado, urgencia, descripcion, cantidad_animales, tiene_collar,
          fecha_avistamiento, latitud, longitud, atendido, albergue_id, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [d.id_cliente ?? null, d.especie, d.estado, d.urgencia, d.descripcion,
        d.cantidad_animales ?? 1, d.tiene_collar ?? 0, d.fecha_avistamiento ?? null,
        d.latitud, d.longitud, d.atendido ?? 0, d.albergue_id ?? null, d.fecha]);
    const [filas] = await pool.query(`${SELECT} WHERE r.id = ?`, [r.insertId]);
    res.status(201).location(`/api/reportes/${r.insertId}`).json(reporteAJson(filas[0]));
  }));

  /* ---------- PATCH /api/reportes/:id ---------- */
  router.patch('/:id', asincrono(async (req, res) => {
    const id = parsearId(req.params.id);
    const d = validarReporte(req.body, { parcial: true });
    const campos = PATCHABLES.filter((c) => d[c] !== undefined);
    if (!campos.length) {
      throw new ErrorApi(422, 'validacion', 'No se envió ningún campo modificable.',
        [{ campo: '*', mensaje: `Campos permitidos: ${PATCHABLES.join(', ')}.` }]);
    }
    const [r] = await pool.query(
      `UPDATE reportes SET ${campos.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...campos.map((c) => d[c]), id]);
    if (!r.affectedRows) throw noEncontrado('Reporte');
    const [filas] = await pool.query(`${SELECT} WHERE r.id = ?`, [id]);
    res.json(reporteAJson(filas[0]));
  }));

  /* ---------- DELETE /api/reportes/:id ---------- */
  router.delete('/:id', asincrono(async (req, res) => {
    const id = parsearId(req.params.id);
    const [filas] = await pool.query('SELECT foto_ruta, audio_ruta FROM reportes WHERE id = ?', [id]);
    if (!filas.length) throw noEncontrado('Reporte');
    await pool.query('DELETE FROM reportes WHERE id = ?', [id]);
    borrarArchivo(filas[0].foto_ruta);
    borrarArchivo(filas[0].audio_ruta);
    res.status(204).end();
  }));

  /* ---------- POST /api/reportes/:id/archivos (multipart: foto, audio) ---------- */
  const subir = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) =>
        cb(null, path.join(carpeta, file.fieldname === 'foto' ? 'fotos' : 'audios')),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${req.params.id}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
      },
    }),
    limits: { fileSize: 15 * 1024 * 1024, files: 2 },
    fileFilter: (req, file, cb) => {
      // Se filtra por extensión porque Flutter puede mandar application/octet-stream.
      const ext = path.extname(file.originalname).toLowerCase();
      const validas = file.fieldname === 'foto' ? EXT_FOTO : file.fieldname === 'audio' ? EXT_AUDIO : null;
      if (!validas) return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
      if (!validas.includes(ext)) {
        return cb(new ErrorApi(422, 'archivo_invalido',
          `El archivo de ${file.fieldname} debe ser ${validas.join(', ')}.`));
      }
      cb(null, true);
    },
  }).fields([{ name: 'foto', maxCount: 1 }, { name: 'audio', maxCount: 1 }]);

  // Verifica que el reporte exista ANTES de guardar archivos en disco.
  const existeReporte = asincrono(async (req, res, next) => {
    const id = parsearId(req.params.id);
    const [filas] = await pool.query('SELECT foto_ruta, audio_ruta FROM reportes WHERE id = ?', [id]);
    if (!filas.length) throw noEncontrado('Reporte');
    req.reporteActual = filas[0];
    next();
  });

  router.post('/:id/archivos', existeReporte, subir, asincrono(async (req, res) => {
    const id = parsearId(req.params.id);
    const foto = req.files?.foto?.[0];
    const audio = req.files?.audio?.[0];
    const descartar = () => [foto, audio].forEach((f) => f && fs.rm(f.path, { force: true }, () => {}));

    if (!foto && !audio) {
      throw new ErrorApi(422, 'archivo_invalido', 'Envía al menos un archivo en el campo foto o audio.');
    }
    if (foto && foto.size > MAX_FOTO) {
      descartar();
      throw new ErrorApi(413, 'archivo_muy_grande', 'La foto pesa más de 5 MB.');
    }
    if (audio && audio.size > MAX_AUDIO) {
      descartar();
      throw new ErrorApi(413, 'archivo_muy_grande', 'El audio pesa más de 10 MB.');
    }

    const sets = [];
    const params = [];
    if (foto) { sets.push('foto_ruta = ?'); params.push(`fotos/${foto.filename}`); }
    if (audio) { sets.push('audio_ruta = ?'); params.push(`audios/${audio.filename}`); }

    try {
      await pool.query(`UPDATE reportes SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    } catch (e) {
      descartar();
      throw e;
    }
    if (foto) borrarArchivo(req.reporteActual.foto_ruta);
    if (audio) borrarArchivo(req.reporteActual.audio_ruta);

    const [filas] = await pool.query(`${SELECT} WHERE r.id = ?`, [id]);
    res.json(reporteAJson(filas[0]));
  }));

  return router;
};
