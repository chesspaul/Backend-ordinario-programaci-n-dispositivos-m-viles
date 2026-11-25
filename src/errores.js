/**
 * Error de la API con código HTTP, un código corto para la app y un mensaje
 * entendible para el usuario. La app Flutter lo convierte en AppException.
 */
class ErrorApi extends Error {
  constructor(status, codigo, mensaje, detalles) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

const noEncontrado = (recurso) =>
  new ErrorApi(404, 'no_encontrado', `${recurso} no encontrado.`);

/** Envuelve un handler async para que sus errores lleguen al manejador. */
const asincrono = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Convierte el parámetro :id en entero positivo o lanza 400. */
function parsearId(texto) {
  const id = Number(texto);
  if (!Number.isInteger(id) || id < 1 || id > 4294967295) {
    throw new ErrorApi(400, 'id_invalido', 'El identificador no es válido.');
  }
  return id;
}

function noEncontradaRuta(req, res, next) {
  next(new ErrorApi(404, 'ruta_inexistente', `No existe la ruta ${req.method} ${req.path}.`));
}

/** Traduce cualquier error a una respuesta JSON uniforme. */
function manejadorErrores(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let codigo = 'error_interno';
  let mensaje = 'Ocurrió un error inesperado en el servidor.';
  let detalles;

  if (err instanceof ErrorApi) {
    ({ status, codigo, detalles } = err);
    mensaje = err.message;
  } else if (err.type === 'entity.parse.failed') {
    status = 400; codigo = 'json_invalido'; mensaje = 'El cuerpo de la petición no es un JSON válido.';
  } else if (err.type === 'entity.too.large') {
    status = 413; codigo = 'cuerpo_muy_grande'; mensaje = 'El cuerpo de la petición es demasiado grande.';
  } else if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413; codigo = 'archivo_muy_grande'; mensaje = 'El archivo pesa demasiado (máximo 15 MB).';
    } else {
      status = 422; codigo = 'archivo_invalido'; mensaje = 'Los archivos enviados no son válidos. Usa los campos foto y audio.';
    }
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409; codigo = 'duplicado'; mensaje = 'Ya existe un registro con esos datos.';
  } else if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
    status = 422; codigo = 'referencia_invalida'; mensaje = 'Se hace referencia a un registro que no existe.';
  } else if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.code === 'ER_CONSTRAINT_FAILED') {
    status = 422; codigo = 'regla_incumplida'; mensaje = 'Los datos no cumplen una regla de la base de datos.';
  } else if (err.code === 'ER_DATA_TOO_LONG' || err.code === 'ER_TRUNCATED_WRONG_VALUE') {
    status = 422; codigo = 'dato_invalido'; mensaje = 'Alguno de los datos es demasiado largo o tiene un formato inválido.';
  } else if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(err.code)) {
    status = 503; codigo = 'base_no_disponible'; mensaje = 'No se pudo conectar con la base de datos.';
  }

  if (status >= 500) console.error(err);

  const cuerpo = { error: { codigo, mensaje } };
  if (detalles) cuerpo.error.detalles = detalles;
  res.status(status).json(cuerpo);
}

module.exports = { ErrorApi, noEncontrado, asincrono, parsearId, noEncontradaRuta, manejadorErrores };
