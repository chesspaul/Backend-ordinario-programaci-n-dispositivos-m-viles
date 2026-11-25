-- =====================================================================
--  Usuario de la API (opcional pero recomendado).
--  Así la API no entra como root y solo tiene permisos sobre patitas_db.
--
--  Uso:   mysql -u root -p < database/usuario.sql
--  Cambia la contraseña y ponla igual en el archivo .env (DB_PASSWORD).
-- =====================================================================

CREATE USER IF NOT EXISTS 'patitas_api'@'localhost' IDENTIFIED BY 'CambiaEstaClave123';
GRANT SELECT, INSERT, UPDATE, DELETE ON patitas_db.* TO 'patitas_api'@'localhost';
FLUSH PRIVILEGES;
