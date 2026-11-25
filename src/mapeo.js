/** Convierte filas de MySQL al JSON que consume la app (booleanos reales, fechas ISO, URLs de archivos). */

const aIso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);
const url = (ruta) => (ruta ? `/uploads/${ruta}` : null);

function reporteAJson(r) {
  return {
    id: r.id,
    id_cliente: r.id_cliente,
    especie: r.especie,
    estado: r.estado,
    urgencia: r.urgencia,
    descripcion: r.descripcion,
    cantidad_animales: r.cantidad_animales,
    tiene_collar: !!r.tiene_collar,
    fecha_avistamiento: r.fecha_avistamiento ?? null,
    latitud: r.latitud,
    longitud: r.longitud,
    foto_url: url(r.foto_ruta),
    audio_url: url(r.audio_ruta),
    atendido: !!r.atendido,
    albergue_id: r.albergue_id ?? null,
    albergue_nombre: r.albergue_nombre ?? undefined,
    fecha: aIso(r.fecha),
    creado_en: aIso(r.creado_en),
    actualizado_en: aIso(r.actualizado_en),
  };
}

function albergueAJson(a) {
  return {
    id: a.id,
    nombre: a.nombre,
    telefono: a.telefono,
    zona: a.zona,
    total_reportes: a.total_reportes ?? undefined,
    creado_en: aIso(a.creado_en),
  };
}

function seguimientoAJson(s) {
  return {
    id: s.id,
    reporte_id: s.reporte_id,
    fecha: s.fecha,
    nota: s.nota,
    estado_nuevo: s.estado_nuevo ?? null,
    requiere_traslado: !!s.requiere_traslado,
    creado_en: aIso(s.creado_en),
  };
}

module.exports = { reporteAJson, albergueAJson, seguimientoAJson };
