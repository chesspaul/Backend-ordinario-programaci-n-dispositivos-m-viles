const express = require('express');
const cors = require('cors');
const { asincrono, noEncontradaRuta, manejadorErrores } = require('./errores');

function crearApp(pool, config) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  // Bitácora sencilla: método, ruta, status y duración.
  app.use((req, res, next) => {
    const inicio = Date.now();
    res.on('finish', () => {
      if (process.env.NODE_ENV !== 'test') {
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - inicio} ms)`);
      }
    });
    next();
  });

  app.use('/uploads', express.static(config.carpetaSubidas, { fallthrough: true }));

  app.get('/api/salud', asincrono(async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ estado: 'ok', base_de_datos: 'conectada', hora: new Date().toISOString() });
  }));

  app.get('/api/estadisticas', asincrono(async (req, res) => {
    const [[tot]] = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(atendido = 1), 0) AS atendidos,
              COALESCE(SUM(atendido = 0), 0) AS pendientes
         FROM reportes`);
    const [porEspecie] = await pool.query(
      'SELECT especie, COUNT(*) AS total FROM reportes GROUP BY especie ORDER BY total DESC');
    const [porUrgencia] = await pool.query(
      'SELECT urgencia, COUNT(*) AS total FROM reportes GROUP BY urgencia ORDER BY urgencia DESC');
    const [[alb]] = await pool.query('SELECT COUNT(*) AS total FROM albergues');
    res.json({
      total_reportes: Number(tot.total),
      atendidos: Number(tot.atendidos),
      pendientes: Number(tot.pendientes),
      total_albergues: Number(alb.total),
      por_especie: porEspecie.map((r) => ({ especie: r.especie, total: Number(r.total) })),
      por_urgencia: porUrgencia.map((r) => ({ urgencia: r.urgencia, total: Number(r.total) })),
    });
  }));

  app.use('/api/reportes', require('./routes/reportes')(pool, config));
  app.use('/api/albergues', require('./routes/albergues')(pool));
  app.use('/api', require('./routes/seguimientos')(pool));

  app.use(noEncontradaRuta);
  app.use(manejadorErrores);
  return app;
}

module.exports = { crearApp };
