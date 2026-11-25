const config = require('./config');
const { crearPool } = require('./db');
const { crearApp } = require('./app');

const pool = crearPool(config.db);
const app = crearApp(pool, config);

const servidor = app.listen(config.puerto, '0.0.0.0', () => {
  console.log(`Patitas API escuchando en http://localhost:${config.puerto}`);
  console.log(`Base de datos: ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`);
});

async function cerrar() {
  servidor.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
