const express = require('express');
const { asincrono, noEncontrado, parsearId } = require('../errores');
const { validarAlbergue } = require('../validacion');
const { albergueAJson } = require('../mapeo');

module.exports = (pool) => {
  const router = express.Router();

  const SELECT = `SELECT a.*, (SELECT COUNT(*) FROM reportes r WHERE r.albergue_id = a.id) AS total_reportes
                  FROM albergues a`;

  router.get('/', asincrono(async (req, res) => {
    const [filas] = await pool.query(`${SELECT} ORDER BY a.nombre`);
    res.json({ total: filas.length, datos: filas.map(albergueAJson) });
  }));

  router.get('/:id', asincrono(async (req, res) => {
    const id = parsearId(req.params.id);
    const [filas] = await pool.query(`${SELECT} WHERE a.id = ?`, [id]);
    if (!filas.length) throw noEncontrado('Albergue');
    res.json(albergueAJson(filas[0]));
  }));

  router.post('/', asincrono(async (req, res) => {
    const d = validarAlbergue(req.body);
    const [r] = await pool.query('INSERT INTO albergues (nombre, telefono, zona) VALUES (?, ?, ?)',
      [d.nombre, d.telefono, d.zona]);
    const [filas] = await pool.query(`${SELECT} WHERE a.id = ?`, [r.insertId]);
    res.status(201).location(`/api/albergues/${r.insertId}`).json(albergueAJson(filas[0]));
  }));

  router.put('/:id', asincrono(async (req, res) => {
    const id = parsearId(req.params.id);
    const d = validarAlbergue(req.body);
    const [r] = await pool.query('UPDATE albergues SET nombre = ?, telefono = ?, zona = ? WHERE id = ?',
      [d.nombre, d.telefono, d.zona, id]);
    if (!r.affectedRows) throw noEncontrado('Albergue');
    const [filas] = await pool.query(`${SELECT} WHERE a.id = ?`, [id]);
    res.json(albergueAJson(filas[0]));
  }));

  router.delete('/:id', asincrono(async (req, res) => {
    const id = parsearId(req.params.id);
    const [r] = await pool.query('DELETE FROM albergues WHERE id = ?', [id]);
    if (!r.affectedRows) throw noEncontrado('Albergue');
    res.status(204).end();
  }));

  return router;
};
