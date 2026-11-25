const express = require('express');
const { asincrono, noEncontrado, parsearId } = require('../errores');
const { validarSeguimiento } = require('../validacion');
const { seguimientoAJson } = require('../mapeo');

/** Se monta en /api: maneja /reportes/:id/seguimientos y /seguimientos/:id. */
module.exports = (pool) => {
  const router = express.Router();

  router.get('/reportes/:id/seguimientos', asincrono(async (req, res) => {
    const id = parsearId(req.params.id);
    const [rep] = await pool.query('SELECT id FROM reportes WHERE id = ?', [id]);
    if (!rep.length) throw noEncontrado('Reporte');
    const [filas] = await pool.query(
      'SELECT * FROM seguimientos WHERE reporte_id = ? ORDER BY fecha DESC, id DESC', [id]);
    res.json({ total: filas.length, datos: filas.map(seguimientoAJson) });
  }));

  // Crea el seguimiento y, si trae estado_nuevo, actualiza el estado del reporte (misma transacción).
  router.post('/reportes/:id/seguimientos', asincrono(async (req, res) => {
    const id = parsearId(req.params.id);
    const d = validarSeguimiento(req.body);
    const con = await pool.getConnection();
    try {
      await con.beginTransaction();
      const [rep] = await con.query('SELECT id FROM reportes WHERE id = ? FOR UPDATE', [id]);
      if (!rep.length) throw noEncontrado('Reporte');
      const [r] = await con.query(
        `INSERT INTO seguimientos (reporte_id, fecha, nota, estado_nuevo, requiere_traslado)
         VALUES (?, ?, ?, ?, ?)`,
        [id, d.fecha, d.nota, d.estado_nuevo ?? null, d.requiere_traslado ?? 0]);
      if (d.estado_nuevo) {
        await con.query('UPDATE reportes SET estado = ? WHERE id = ?', [d.estado_nuevo, id]);
      }
      await con.commit();
      const [filas] = await pool.query('SELECT * FROM seguimientos WHERE id = ?', [r.insertId]);
      res.status(201).location(`/api/seguimientos/${r.insertId}`).json(seguimientoAJson(filas[0]));
    } catch (e) {
      await con.rollback();
      throw e;
    } finally {
      con.release();
    }
  }));

  router.delete('/seguimientos/:id', asincrono(async (req, res) => {
    const id = parsearId(req.params.id);
    const [r] = await pool.query('DELETE FROM seguimientos WHERE id = ?', [id]);
    if (!r.affectedRows) throw noEncontrado('Seguimiento');
    res.status(204).end();
  }));

  return router;
};
