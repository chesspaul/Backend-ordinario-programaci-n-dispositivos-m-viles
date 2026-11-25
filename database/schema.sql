-- =====================================================================
--  Patitas en la calle · Script de base de datos (MySQL 8.0.16 o superior)
--
--  Crea la base patitas_db con 3 entidades relacionadas:
--
--      albergues (1) ───< (N) reportes (1) ───< (N) seguimientos
--
--  Uso:   mysql -u root -p < database/schema.sql
--  Es seguro ejecutarlo varias veces: borra y recrea las tablas.
-- =====================================================================

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS patitas_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE patitas_db;

DROP TABLE IF EXISTS seguimientos;
DROP TABLE IF EXISTS reportes;
DROP TABLE IF EXISTS albergues;

-- ---------------------------------------------------------------------
--  ALBERGUES: lugares o rescatistas a los que se puede asignar un reporte
-- ---------------------------------------------------------------------
CREATE TABLE albergues (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre     VARCHAR(120) NOT NULL,
  telefono   CHAR(10)     NOT NULL,
  zona       VARCHAR(80)  NOT NULL,
  creado_en  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_albergues_nombre (nombre),
  CONSTRAINT ck_albergues_telefono CHECK (telefono REGEXP '^[0-9]{10}$')
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
--  REPORTES: un animal en situación de calle con foto, nota de voz y GPS
--  (las columnas foto_ruta y audio_ruta guardan la ruta del archivo en el
--  servidor, no el archivo)
-- ---------------------------------------------------------------------
CREATE TABLE reportes (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_cliente          CHAR(36)     NULL COMMENT 'UUID generado por la app; evita duplicados al reintentar',
  especie             ENUM('Perro','Gato','Otro') NOT NULL,
  estado              ENUM('Sano','Herido','Desnutrido','Enfermo','Cachorro') NOT NULL,
  urgencia            TINYINT UNSIGNED NOT NULL COMMENT '1 baja, 2 media, 3 alta',
  descripcion         VARCHAR(1000) NOT NULL,
  cantidad_animales   SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  tiene_collar        TINYINT(1)   NOT NULL DEFAULT 0,
  fecha_avistamiento  DATE         NULL,
  latitud             DECIMAL(9,6) NOT NULL,
  longitud            DECIMAL(9,6) NOT NULL,
  foto_ruta           VARCHAR(255) NULL,
  audio_ruta          VARCHAR(255) NULL,
  atendido            TINYINT(1)   NOT NULL DEFAULT 0,
  albergue_id         INT UNSIGNED NULL,
  fecha               DATETIME(3)  NOT NULL COMMENT 'Momento en que se creó el reporte en la app',
  creado_en           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reportes_id_cliente (id_cliente),
  KEY ix_reportes_fecha (fecha),
  KEY ix_reportes_urgencia (urgencia),
  KEY ix_reportes_albergue (albergue_id),
  CONSTRAINT fk_reportes_albergue
    FOREIGN KEY (albergue_id) REFERENCES albergues (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT ck_reportes_urgencia  CHECK (urgencia BETWEEN 1 AND 3),
  CONSTRAINT ck_reportes_cantidad  CHECK (cantidad_animales BETWEEN 1 AND 999),
  CONSTRAINT ck_reportes_latitud   CHECK (latitud  BETWEEN -90  AND 90),
  CONSTRAINT ck_reportes_longitud  CHECK (longitud BETWEEN -180 AND 180)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
--  SEGUIMIENTOS: historial de atención de un reporte
--  Si se borra el reporte, se borran sus seguimientos (ON DELETE CASCADE)
-- ---------------------------------------------------------------------
CREATE TABLE seguimientos (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporte_id         INT UNSIGNED NOT NULL,
  fecha              DATE         NOT NULL,
  nota               VARCHAR(500) NOT NULL,
  estado_nuevo       ENUM('Sano','Herido','Desnutrido','Enfermo','Cachorro') NULL,
  requiere_traslado  TINYINT(1)   NOT NULL DEFAULT 0,
  creado_en          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_seguimientos_reporte_fecha (reporte_id, fecha),
  CONSTRAINT fk_seguimientos_reporte
    FOREIGN KEY (reporte_id) REFERENCES reportes (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
--  DATOS DE EJEMPLO (para probar la API y grabar el video)
-- ---------------------------------------------------------------------
INSERT INTO albergues (nombre, telefono, zona) VALUES
  ('Refugio Huellitas del Sur',  '5551234567', 'Coyoacán'),
  ('Casa Gatuna Roma',           '5557654321', 'Cuauhtémoc'),
  ('Rescate Patitas Felices',    '5559876543', 'Benito Juárez');

INSERT INTO reportes
  (especie, estado, urgencia, descripcion, cantidad_animales, tiene_collar,
   fecha_avistamiento, latitud, longitud, atendido, albergue_id, fecha)
VALUES
  ('Perro', 'Herido',     3, 'Cojea de la pata derecha, está cerca del parque.',        1, 0, '2026-11-17',  19.432600, -99.133200, 0, 1,    '2026-11-17 10:42:00.000'),
  ('Gato',  'Cachorro',   2, 'Cuatro cachorros bajo un coche, sin mamá.',               4, 0, '2026-11-16',  19.419700, -99.162300, 0, 2,    '2026-11-16 18:05:00.000'),
  ('Perro', 'Sano',       1, 'Collar sin placa, se ve tranquilo.',                      1, 1, '2026-11-15',  19.346100, -99.161700, 1, 1,    '2026-11-15 09:20:00.000'),
  ('Perro', 'Desnutrido', 3, 'Muy delgado, busca comida en los botes de basura.',       1, 0, '2026-11-18',  19.370200, -99.176800, 0, NULL, '2026-11-18 08:15:00.000'),
  ('Otro',  'Enfermo',    2, 'Una tortuga en la banqueta, parece desorientada.',        1, 0, '2026-11-19',  19.404100, -99.170500, 0, 3,    '2026-11-19 13:30:00.000');

INSERT INTO seguimientos (reporte_id, fecha, nota, estado_nuevo, requiere_traslado) VALUES
  (1, '2026-11-17', 'Se avisó al refugio; llevarán una camilla.',                  NULL,     1),
  (1, '2026-11-18', 'Recibió revisión veterinaria; tiene una fisura en la pata.',  'Herido', 0),
  (3, '2026-11-16', 'Se encontró a su dueño por el collar.',                       'Sano',   0),
  (2, '2026-11-17', 'La zona queda dentro de la cobertura del albergue.',          NULL,     0);
