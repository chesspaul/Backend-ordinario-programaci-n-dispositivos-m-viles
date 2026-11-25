# Patitas en la calle · Backend (Node.js + Express + MySQL)

API REST que recibe los reportes de animales de la app Flutter, los guarda en MySQL y los devuelve para consultarlos.

```
App Flutter ──HTTP/JSON──▶ API Express (puerto 3000) ──mysql2──▶ MySQL (patitas_db)
                                   └── /uploads (fotos y audios)
```

## Requisitos
- Node.js 18 o superior
- MySQL 8.0.16 o superior (por las restricciones CHECK)

## Puesta en marcha (Windows)
1. **Crear la base** (pide la contraseña de root):
   ```
   mysql -u root -p < database\schema.sql
   ```
   Crea `patitas_db` con 3 tablas (albergues, reportes, seguimientos) y datos de ejemplo. Se puede repetir: borra y recrea.
2. **(Recomendado) Usuario propio**: `mysql -u root -p < database\usuario.sql` (cambia la contraseña dentro del archivo).
3. **Configurar**: copia `.env.example` a `.env` y pon tu usuario y contraseña de MySQL.
4. **Instalar y arrancar**:
   ```
   npm install
   npm start
   ```
5. **Probar**: abre http://localhost:3000/api/salud → `{"estado":"ok", ...}`

## Conectar el celular
- **Celular físico por USB**: `adb reverse tcp:3000 tcp:3000` y en la app usa `http://localhost:3000`.
- **Emulador Android**: `http://10.0.2.2:3000`.
- Android bloquea HTTP sin cifrar: en `android/app/src/main/AndroidManifest.xml`, dentro de `<application ...>` agrega `android:usesCleartextTraffic="true"`.

## Endpoints
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/salud` | Estado de la API y la base |
| GET | `/api/reportes` | Lista (filtros `especie`, `urgencia`, `atendido`, `albergue_id`, `q`, `limit`, `offset`) |
| GET | `/api/reportes/:id` | Detalle con albergue y seguimientos |
| POST | `/api/reportes` | Crea (201). Con `id_cliente` (UUID) es idempotente: reintento → 200 |
| PATCH | `/api/reportes/:id` | Cambia `atendido`, `albergue_id`, `estado`, `urgencia`, `descripcion`, `cantidad_animales`, `tiene_collar` |
| DELETE | `/api/reportes/:id` | Borra el reporte, sus seguimientos y sus archivos (204) |
| POST | `/api/reportes/:id/archivos` | Multipart: `foto` (≤5 MB) y/o `audio` (≤10 MB) |
| GET / POST | `/api/albergues` | Lista / crea |
| GET / PUT / DELETE | `/api/albergues/:id` | Detalle / edita / borra |
| GET / POST | `/api/reportes/:id/seguimientos` | Lista / crea (con `estado_nuevo` actualiza el reporte) |
| DELETE | `/api/seguimientos/:id` | Borra un seguimiento |
| GET | `/api/estadisticas` | Totales por especie y urgencia |

Los errores siempre tienen la forma `{"error": {"codigo", "mensaje", "detalles?"}}` (400 formato, 404 no existe, 409 duplicado, 413 archivo grande, 422 regla de negocio, 503 base caída).

## Reglas de negocio
- `especie`: Perro, Gato, Otro. `estado`: Sano, Herido, Desnutrido, Enfermo, Cachorro. `urgencia`: 1 a 3.
- Descripción de 5 a 1000 caracteres; cantidad de animales de 1 a 999.
- Latitud −90 a 90 y longitud −180 a 180 (obligatorias).
- `fecha_avistamiento` (AAAA-MM-DD) y `fecha` no pueden ser futuras.
- Albergue: nombre único (3–120), teléfono de exactamente 10 dígitos, zona obligatoria.
- Seguimiento: nota de 3 a 500 caracteres; si trae `estado_nuevo`, se actualiza el reporte en la misma transacción.
- Borrar un albergue deja sus reportes sin albergue; borrar un reporte borra sus seguimientos.

## Pruebas
`npm test` recrea la base `patitas_test` desde `schema.sql` y corre 13 pruebas de integración (necesita un usuario con permiso para crear bases, p. ej. root; configúralo en `.env`).

## Postman
Importa `postman/patitas.postman_collection.json` (variable `base_url`).

## MySQL sin instalar (PC de la escuela)
Descarga el ZIP de MySQL Community Server, descomprímelo, `bin\mysqld --initialize-insecure --console` y luego `bin\mysqld --console`; en otra terminal `bin\mysql -u root < database\schema.sql`.
