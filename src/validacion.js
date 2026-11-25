const { ErrorApi } = require('./errores');

/** Catálogos: deben coincidir con models/catalogos.dart de la app. */
const ESPECIES = ['Perro', 'Gato', 'Otro'];
const ESTADOS = ['Sano', 'Herido', 'Desnutrido', 'Enfermo', 'Cachorro'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UN_DIA_MS = 24 * 60 * 60 * 1000;

/** Acumula los errores de validación para responderlos todos juntos. */
class Errores {
  constructor() { this.detalles = []; }
  agregar(campo, mensaje) { this.detalles.push({ campo, mensaje }); }
  lanzarSiHay() {
    if (this.detalles.length > 0) {
      throw new ErrorApi(422, 'validacion', 'Hay datos que no cumplen las reglas del negocio.', this.detalles);
    }
  }
}

/* ---------- validadores simples: devuelven el valor limpio o undefined ---------- */

function texto(e, valor, campo, { min, max }) {
  if (typeof valor !== 'string') { e.agregar(campo, 'Debe ser un texto.'); return undefined; }
  const limpio = valor.trim();
  if (limpio.length < min) { e.agregar(campo, `Debe tener al menos ${min} caracteres.`); return undefined; }
  if (limpio.length > max) { e.agregar(campo, `No puede pasar de ${max} caracteres.`); return undefined; }
  return limpio;
}

function opcion(e, valor, campo, lista) {
  if (!lista.includes(valor)) { e.agregar(campo, `Debe ser uno de: ${lista.join(', ')}.`); return undefined; }
  return valor;
}

function numero(valor) {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string' && valor.trim() !== '') return Number(valor);
  return NaN;
}

function entero(e, valor, campo, { min, max }) {
  const n = numero(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    e.agregar(campo, `Debe ser un entero entre ${min} y ${max}.`);
    return undefined;
  }
  return n;
}

function decimal(e, valor, campo, { min, max }) {
  const n = numero(valor);
  if (!Number.isFinite(n) || n < min || n > max) {
    e.agregar(campo, `Debe ser un número entre ${min} y ${max}.`);
    return undefined;
  }
  return Number(n.toFixed(6));
}

function booleano(e, valor, campo) {
  if (valor === true || valor === 1 || valor === '1' || valor === 'true') return 1;
  if (valor === false || valor === 0 || valor === '0' || valor === 'false') return 0;
  e.agregar(campo, 'Debe ser verdadero o falso.');
  return undefined;
}

/** Fecha 'AAAA-MM-DD' real y que no sea futura (con un día de tolerancia por zona horaria). */
function fechaSola(e, valor, campo) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    e.agregar(campo, 'Debe tener el formato AAAA-MM-DD.');
    return undefined;
  }
  const d = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    e.agregar(campo, 'No es una fecha real.');
    return undefined;
  }
  if (d.getTime() > Date.now() + UN_DIA_MS) {
    e.agregar(campo, 'No puede ser una fecha futura.');
    return undefined;
  }
  return valor;
}

/** Fecha y hora ISO 8601 que no esté en el futuro (5 minutos de tolerancia por relojes). */
function fechaHora(e, valor, campo) {
  const d = new Date(valor);
  if (typeof valor !== 'string' || Number.isNaN(d.getTime())) {
    e.agregar(campo, 'Debe ser una fecha y hora en formato ISO 8601.');
    return undefined;
  }
  if (d.getTime() > Date.now() + 5 * 60 * 1000) {
    e.agregar(campo, 'No puede estar en el futuro.');
    return undefined;
  }
  return d;
}

/**
 * Aplica `validar` al campo si viene en el cuerpo. Si es obligatorio y falta,
 * lo reporta. Con `nulo` se permite enviar null para vaciar el campo.
 */
function campo(e, cuerpo, salida, nombre, { obligatorio = false, nulo = false }, validar) {
  const valor = cuerpo[nombre];
  if (valor === undefined) {
    if (obligatorio) e.agregar(nombre, 'Es obligatorio.');
    return;
  }
  if (valor === null) {
    if (nulo) salida[nombre] = null;
    else e.agregar(nombre, 'No puede ser nulo.');
    return;
  }
  const limpio = validar(valor);
  if (limpio !== undefined) salida[nombre] = limpio;
}

function comoObjeto(cuerpo) {
  return cuerpo && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? cuerpo : {};
}

/* ---------- reglas de negocio por entidad ---------- */

/**
 * REPORTE
 *  - especie y estado deben estar en el catálogo
 *  - urgencia de 1 (baja) a 3 (alta)
 *  - descripción de 5 a 1000 caracteres
 *  - cantidad de animales de 1 a 999
 *  - latitud entre -90 y 90, longitud entre -180 y 180 (el GPS es obligatorio)
 *  - la fecha de avistamiento y la fecha del reporte no pueden ser futuras
 *  - con `parcial` solo se validan los campos enviados (PATCH)
 */
function validarReporte(cuerpo, { parcial = false } = {}) {
  const e = new Errores();
  const b = comoObjeto(cuerpo);
  const s = {};
  const obligatorio = !parcial;

  campo(e, b, s, 'id_cliente', { nulo: true }, (v) =>
    (typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : (e.agregar('id_cliente', 'Debe ser un UUID.'), undefined)));
  campo(e, b, s, 'especie', { obligatorio }, (v) => opcion(e, v, 'especie', ESPECIES));
  campo(e, b, s, 'estado', { obligatorio }, (v) => opcion(e, v, 'estado', ESTADOS));
  campo(e, b, s, 'urgencia', { obligatorio }, (v) => entero(e, v, 'urgencia', { min: 1, max: 3 }));
  campo(e, b, s, 'descripcion', { obligatorio }, (v) => texto(e, v, 'descripcion', { min: 5, max: 1000 }));
  campo(e, b, s, 'cantidad_animales', {}, (v) => entero(e, v, 'cantidad_animales', { min: 1, max: 999 }));
  campo(e, b, s, 'tiene_collar', {}, (v) => booleano(e, v, 'tiene_collar'));
  campo(e, b, s, 'fecha_avistamiento', { nulo: true }, (v) => fechaSola(e, v, 'fecha_avistamiento'));
  campo(e, b, s, 'latitud', { obligatorio }, (v) => decimal(e, v, 'latitud', { min: -90, max: 90 }));
  campo(e, b, s, 'longitud', { obligatorio }, (v) => decimal(e, v, 'longitud', { min: -180, max: 180 }));
  campo(e, b, s, 'atendido', {}, (v) => booleano(e, v, 'atendido'));
  campo(e, b, s, 'albergue_id', { nulo: true }, (v) => entero(e, v, 'albergue_id', { min: 1, max: 4294967295 }));
  campo(e, b, s, 'fecha', {}, (v) => fechaHora(e, v, 'fecha'));

  e.lanzarSiHay();
  if (!parcial && s.fecha === undefined) s.fecha = new Date();
  return s;
}

/**
 * ALBERGUE
 *  - nombre de 3 a 120 caracteres (único)
 *  - teléfono de exactamente 10 dígitos
 *  - zona de 2 a 80 caracteres
 */
function validarAlbergue(cuerpo) {
  const e = new Errores();
  const b = comoObjeto(cuerpo);
  const s = {};

  campo(e, b, s, 'nombre', { obligatorio: true }, (v) => texto(e, v, 'nombre', { min: 3, max: 120 }));
  campo(e, b, s, 'telefono', { obligatorio: true }, (v) => {
    const t = typeof v === 'number' ? String(v) : v;
    if (typeof t !== 'string' || !/^\d{10}$/.test(t.trim())) {
      e.agregar('telefono', 'Debe tener exactamente 10 dígitos.');
      return undefined;
    }
    return t.trim();
  });
  campo(e, b, s, 'zona', { obligatorio: true }, (v) => texto(e, v, 'zona', { min: 2, max: 80 }));

  e.lanzarSiHay();
  return s;
}

/**
 * SEGUIMIENTO
 *  - nota de 3 a 500 caracteres
 *  - fecha real, no futura (por defecto, hoy)
 *  - si trae estado_nuevo, debe estar en el catálogo y actualiza el reporte
 */
function validarSeguimiento(cuerpo) {
  const e = new Errores();
  const b = comoObjeto(cuerpo);
  const s = {};

  campo(e, b, s, 'nota', { obligatorio: true }, (v) => texto(e, v, 'nota', { min: 3, max: 500 }));
  campo(e, b, s, 'fecha', {}, (v) => fechaSola(e, v, 'fecha'));
  campo(e, b, s, 'estado_nuevo', { nulo: true }, (v) => opcion(e, v, 'estado_nuevo', ESTADOS));
  campo(e, b, s, 'requiere_traslado', {}, (v) => booleano(e, v, 'requiere_traslado'));

  e.lanzarSiHay();
  if (s.fecha === undefined) s.fecha = new Date().toISOString().slice(0, 10);
  return s;
}

module.exports = { ESPECIES, ESTADOS, validarReporte, validarAlbergue, validarSeguimiento };
