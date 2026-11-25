const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

function entero(valor, porDefecto) {
  const n = Number.parseInt(valor, 10);
  return Number.isFinite(n) ? n : porDefecto;
}

/** Configuración leída de variables de entorno (archivo .env). */
module.exports = {
  puerto: entero(process.env.PORT, 3000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: entero(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'patitas_db',
  },
  carpetaSubidas: path.resolve(__dirname, '..', process.env.UPLOADS_DIR || 'uploads'),
};
