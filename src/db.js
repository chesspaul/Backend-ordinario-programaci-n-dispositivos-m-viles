const mysql = require('mysql2/promise');

/**
 * Crea el pool de conexiones a MySQL.
 *  - timezone 'Z': las fechas con hora (DATETIME) se manejan en UTC.
 *  - dateStrings ['DATE']: las columnas DATE regresan como 'AAAA-MM-DD'.
 *  - decimalNumbers: DECIMAL (latitud, longitud) regresa como número, no texto.
 */
function crearPool(config) {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: ['DATE'],
    decimalNumbers: true,
  });
}

module.exports = { crearPool };
