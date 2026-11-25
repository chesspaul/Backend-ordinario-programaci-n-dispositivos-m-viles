// Pruebas de integración: levantan la API contra una base de prueba (patitas_test)
// que se recrea desde database/schema.sql. Ejecutar con:  npm test
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');
const { crearPool } = require('../src/db');
const { crearApp } = require('../src/app');

const BD_PRUEBA = 'patitas_test';
let servidor, pool, base, carpeta;

const api = async (metodo, ruta, cuerpo) => {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: cuerpo ? { 'content-type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  return { status: res.status, headers: res.headers, json: texto ? JSON.parse(texto) : null };
};

const reporteValido = (extra = {}) => ({
  especie: 'Perro', estado: 'Herido', urgencia: 3,
  descripcion: 'Cojea de una pata', latitud: 19.43, longitud: -99.13, ...extra,
});

test.before(async () => {
  const admin = await mysql.createConnection({
    host: config.db.host, port: config.db.port, user: config.db.user,
    password: config.db.password, multipleStatements: true,
  });
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8')
    .replaceAll('patitas_db', BD_PRUEBA);
  await admin.query(sql);
  await admin.end();

  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'patitas-up-'));
  pool = crearPool({ ...config.db, database: BD_PRUEBA });
  const app = crearApp(pool, { ...config, carpetaSubidas: carpeta });
  await new Promise((ok) => { servidor = app.listen(0, ok); });
  base = `http://127.0.0.1:${servidor.address().port}`;
});

test.after(async () => {
  servidor?.close();
  await pool?.end();
  if (carpeta) fs.rmSync(carpeta, { recursive: true, force: true });
});

test('salud responde ok y la ruta inexistente da 404 en JSON', async () => {
  assert.equal((await api('GET', '/api/salud')).json.estado, 'ok');
  const r = await api('GET', '/api/nada');
  assert.equal(r.status, 404);
  assert.equal(r.json.error.codigo, 'ruta_inexistente');
});

test('lista reportes con paginación y filtros', async () => {
  const todos = await api('GET', '/api/reportes');
  assert.equal(todos.status, 200);
  assert.equal(todos.json.total, 5);
  const gatos = await api('GET', '/api/reportes?especie=Gato');
  assert.ok(gatos.json.datos.every((r) => r.especie === 'Gato'));
  const pag = await api('GET', '/api/reportes?limit=2&offset=1');
  assert.equal(pag.json.datos.length, 2);
  assert.equal(pag.json.total, 5);
  assert.equal((await api('GET', '/api/reportes?especie=Dragon')).status, 400);
  assert.equal((await api('GET', '/api/reportes?urgencia=9')).status, 400);
});

test('crear reporte: 201, tipos correctos y valores por defecto', async () => {
  const r = await api('POST', '/api/reportes', reporteValido({ tiene_collar: true, cantidad_animales: 3, fecha_avistamiento: '2026-11-01' }));
  assert.equal(r.status, 201);
  assert.match(r.headers.get('location'), /^\/api\/reportes\/\d+$/);
  assert.equal(r.json.tiene_collar, true);
  assert.equal(r.json.cantidad_animales, 3);
  assert.equal(r.json.atendido, false);
  assert.equal(r.json.fecha_avistamiento, '2026-11-01');
  assert.equal(typeof r.json.latitud, 'number');
  const d = await api('POST', '/api/reportes', reporteValido());
  assert.equal(d.json.cantidad_animales, 1);
  assert.equal(d.json.tiene_collar, false);
});

test('reglas de negocio del reporte devuelven 422 con detalles', async () => {
  const casos = [
    [{ especie: 'Dragon' }, 'especie'],
    [{ estado: 'Raro' }, 'estado'],
    [{ urgencia: 9 }, 'urgencia'],
    [{ descripcion: 'ab' }, 'descripcion'],
    [{ cantidad_animales: 0 }, 'cantidad_animales'],
    [{ cantidad_animales: 1000 }, 'cantidad_animales'],
    [{ latitud: 91 }, 'latitud'],
    [{ longitud: -181 }, 'longitud'],
    [{ fecha_avistamiento: '2999-01-01' }, 'fecha_avistamiento'],
    [{ fecha_avistamiento: '2026-02-31' }, 'fecha_avistamiento'],
    [{ fecha_avistamiento: '01/11/2026' }, 'fecha_avistamiento'],
    [{ tiene_collar: 'tal vez' }, 'tiene_collar'],
    [{ id_cliente: 'no-uuid' }, 'id_cliente'],
    [{ albergue_id: 999 }, null],
  ];
  for (const [extra, campo] of casos) {
    const r = await api('POST', '/api/reportes', reporteValido(extra));
    assert.equal(r.status, 422, JSON.stringify(extra));
    assert.ok(r.json.error.mensaje, 'debe traer mensaje');
    if (campo) assert.ok(r.json.error.detalles.some((x) => x.campo === campo), JSON.stringify(extra));
  }
  const vacio = await api('POST', '/api/reportes', {});
  assert.equal(vacio.status, 422);
  assert.ok(vacio.json.error.detalles.length >= 6);
});

test('JSON roto devuelve 400 y id inválido 400', async () => {
  const res = await fetch(`${base}/api/reportes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{roto' });
  assert.equal(res.status, 400);
  assert.equal((await api('GET', '/api/reportes/abc')).status, 400);
  assert.equal((await api('GET', '/api/reportes/9999')).status, 404);
});

test('POST con id_cliente es idempotente (reintentos no duplican)', async () => {
  const id_cliente = '123e4567-e89b-42d3-a456-426614174000';
  const a = await api('POST', '/api/reportes', reporteValido({ id_cliente }));
  const b = await api('POST', '/api/reportes', reporteValido({ id_cliente }));
  assert.equal(a.status, 201);
  assert.equal(b.status, 200);
  assert.equal(a.json.id, b.json.id);
});

test('PATCH solo cambia campos permitidos', async () => {
  const { json: nuevo } = await api('POST', '/api/reportes', reporteValido());
  const ok = await api('PATCH', `/api/reportes/${nuevo.id}`, { atendido: true, albergue_id: 1 });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.atendido, true);
  assert.equal(ok.json.albergue_nombre, 'Refugio Huellitas del Sur');
  const ajeno = await api('PATCH', `/api/reportes/${nuevo.id}`, { latitud: 1 });
  assert.equal(ajeno.status, 422);
  assert.equal((await api('PATCH', '/api/reportes/9999', { atendido: true })).status, 404);
  assert.equal((await api('PATCH', `/api/reportes/${nuevo.id}`, { albergue_id: 999 })).status, 422);
  const quitar = await api('PATCH', `/api/reportes/${nuevo.id}`, { albergue_id: null });
  assert.equal(quitar.json.albergue_id, null);
});

test('detalle incluye albergue y seguimientos', async () => {
  const r = await api('GET', '/api/reportes/1');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.json.seguimientos));
  assert.ok(r.json.seguimientos.length >= 1);
});

test('seguimiento con estado_nuevo actualiza el reporte en la misma transacción', async () => {
  const { json: rep } = await api('POST', '/api/reportes', reporteValido({ estado: 'Herido' }));
  const s = await api('POST', `/api/reportes/${rep.id}/seguimientos`, { nota: 'Ya fue valorado', estado_nuevo: 'Sano', requiere_traslado: true });
  assert.equal(s.status, 201);
  assert.equal(s.json.requiere_traslado, true);
  assert.equal((await api('GET', `/api/reportes/${rep.id}`)).json.estado, 'Sano');
  assert.equal((await api('POST', `/api/reportes/${rep.id}/seguimientos`, { nota: 'x' })).status, 422);
  assert.equal((await api('POST', `/api/reportes/${rep.id}/seguimientos`, { nota: 'Hoy', fecha: '2999-01-01' })).status, 422);
  assert.equal((await api('POST', '/api/reportes/9999/seguimientos', { nota: 'Hola' })).status, 404);
  const lista = await api('GET', `/api/reportes/${rep.id}/seguimientos`);
  assert.equal(lista.json.total, 1);
  assert.equal((await api('DELETE', `/api/seguimientos/${s.json.id}`)).status, 204);
  assert.equal((await api('DELETE', `/api/seguimientos/${s.json.id}`)).status, 404);
});

test('albergues: CRUD, teléfono de 10 dígitos y nombre único', async () => {
  const c = await api('POST', '/api/albergues', { nombre: 'Refugio Nuevo', telefono: '5550001111', zona: 'Tlalpan' });
  assert.equal(c.status, 201);
  assert.equal((await api('POST', '/api/albergues', { nombre: 'Refugio Nuevo', telefono: '5550001111', zona: 'Otra' })).status, 409);
  const mal = await api('POST', '/api/albergues', { nombre: 'Otro lugar', telefono: '12', zona: 'X' });
  assert.equal(mal.status, 422);
  assert.ok(mal.json.error.detalles.some((x) => x.campo === 'telefono'));
  const put = await api('PUT', `/api/albergues/${c.json.id}`, { nombre: 'Refugio Nuevo', telefono: '5550002222', zona: 'Xochimilco' });
  assert.equal(put.json.zona, 'Xochimilco');
  assert.ok((await api('GET', '/api/albergues')).json.total >= 4);
  assert.equal((await api('GET', '/api/albergues/9999')).status, 404);
});

test('borrar albergue deja el reporte sin albergue; borrar reporte borra seguimientos', async () => {
  const { json: alb } = await api('POST', '/api/albergues', { nombre: 'Temporal', telefono: '5551112222', zona: 'Centro' });
  const { json: rep } = await api('POST', '/api/reportes', reporteValido({ albergue_id: alb.id }));
  await api('POST', `/api/reportes/${rep.id}/seguimientos`, { nota: 'Nota de prueba' });
  assert.equal((await api('DELETE', `/api/albergues/${alb.id}`)).status, 204);
  assert.equal((await api('GET', `/api/reportes/${rep.id}`)).json.albergue_id, null);
  assert.equal((await api('DELETE', `/api/reportes/${rep.id}`)).status, 204);
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM seguimientos WHERE reporte_id = ?', [rep.id]);
  assert.equal(n, 0);
  assert.equal((await api('GET', `/api/reportes/${rep.id}`)).status, 404);
});

test('subida de archivos: foto y audio se guardan, se sirven y se validan', async () => {
  const { json: rep } = await api('POST', '/api/reportes', reporteValido());
  const subir = (campos, id = rep.id) => {
    const f = new FormData();
    for (const [campo, nombre, bytes] of campos) f.append(campo, new Blob([bytes]), nombre);
    return fetch(`${base}/api/reportes/${id}/archivos`, { method: 'POST', body: f });
  };

  const ok = await subir([['foto', 'gato.jpg', Buffer.from('fotofalsa')], ['audio', 'nota.m4a', Buffer.from('audiofalso')]]);
  assert.equal(ok.status, 200);
  const j = await ok.json();
  assert.match(j.foto_url, /^\/uploads\/fotos\/.+\.jpg$/);
  assert.match(j.audio_url, /^\/uploads\/audios\/.+\.m4a$/);
  const servida = await fetch(base + j.foto_url);
  assert.equal(servida.status, 200);
  assert.equal(await servida.text(), 'fotofalsa');

  assert.equal((await subir([['foto', 'virus.exe', Buffer.from('x')]])).status, 422);
  assert.equal((await subir([['foto', 'a.jpg', Buffer.alloc(6 * 1024 * 1024)]])).status, 413);
  assert.equal((await subir([['foto', 'a.jpg', Buffer.from('x')]], 9999)).status, 404);
  assert.equal((await subir([['otro', 'a.jpg', Buffer.from('x')]])).status, 422);

  // al borrar el reporte se borran los archivos
  const archivo = path.join(carpeta, j.foto_url.replace('/uploads/', ''));
  assert.ok(fs.existsSync(archivo));
  await api('DELETE', `/api/reportes/${rep.id}`);
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(!fs.existsSync(archivo));
});

test('estadísticas suman los reportes', async () => {
  const e = await api('GET', '/api/estadisticas');
  assert.equal(e.status, 200);
  assert.equal(e.json.atendidos + e.json.pendientes, e.json.total_reportes);
});
