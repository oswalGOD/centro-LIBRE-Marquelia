// Copias de actividades entre perfiles (por envío aceptado o desde la Agenda de actividades).
// La copia es propia de quien la obtiene: lleva su folio, queda a su nombre como facilitadora,
// conserva las mismas asistentes con sus firmas y no incluye fotografías.

import * as db from "./db.js";
import { nombreRol, TIPOS_ACTIVIDAD, TIPOS_RETIRADOS } from "./catalogos.js";

const TIPO_CURSO = "Curso";

/**
 * Crea (o completa, si ya existía) la copia de `origen` para el perfil `yo`.
 * Los ids salen de `copiaId`, así que repetir la operación desde otro dispositivo no la duplica.
 * `meta` describe el origen del envío: { de, deNombre, en, via }.
 */
export async function crearCopia(yo, origen, copiaId, nombre, tipo, meta) {
  const previa = await db.uno("actividades", copiaId);
  const copia = previa || {
    id: copiaId, folio: await db.siguienteFolio(origen.fecha), creadaPor: yo.id, estado: "abierta",
    fecha: origen.fecha, lugar: origen.lugar, tipo: origen.tipo, horaInicio: origen.horaInicio || "", horaFin: origen.horaFin || "",
    facilitadoraId: yo.id, facilitadora: yo.nombre, puesto: nombreRol(yo.rol),
  };
  copia.nombre = nombre;
  copia.tipo = tipo;
  copia.compartidas = [{
    ...meta, a: yo.id, aNombre: yo.nombre, origenId: origen.id, nombreOriginal: origen.nombre,
    ...(nombre !== origen.nombre ? { nombreAnterior: origen.nombre } : {}), ...(tipo !== origen.tipo ? { tipoAnterior: origen.tipo } : {}),
  }];
  await db.guardar("actividades", copia);
  const existentes = new Set((await db.todos("asistencias", "actividadId", copiaId)).map(x => x.id));
  for (const x of await db.todos("asistencias", "actividadId", origen.id)) {
    const id = `${copiaId}-${x.id}`;
    if (!existentes.has(id)) await db.guardar("asistencias", { ...x, id, actividadId: copiaId, creado: undefined });
  }
  return copia;
}

/** id de la copia que el perfil `perfilId` obtiene desde la Agenda. */
export const idCopiaAgenda = (origenId, perfilId) => `copia-ag-${origenId}-${perfilId}`;

/** Tipos de actividad ofrecidos al copiar: el catálogo más los escritos a mano en otras actividades. */
export async function tiposDisponibles() {
  const usados = (await db.todos("actividades")).map(x => x.tipo).filter(t => t && t !== TIPO_CURSO && !TIPOS_RETIRADOS.includes(t));
  return [...new Set([...TIPOS_ACTIVIDAD, ...usados.sort((x, y) => x.localeCompare(y, "es"))])];
}
