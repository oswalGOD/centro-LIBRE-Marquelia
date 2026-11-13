// Estado de los cursos y capacitaciones. Un curso es una actividad con `curso: true`.
// - programado: se agendó a futuro y aún no se realiza (sin asistentes ni constancias).
// - cancelado: se programó pero no se llevó a cabo.
// «Próximo» = programado, no cancelado y con fecha de hoy en adelante.

import { hoy } from "./catalogos.js";

export const esProximo = (a, ref = hoy()) => Boolean(a.curso && a.programado && !a.cancelado && a.fecha >= ref);
/** Programado o cancelado: todavía no admite asistentes, constancias ni evidencias. */
export const sinRealizar = a => Boolean(a.programado || a.cancelado);

/** Estado de una actividad: "programada", "cancelada", "cerrada" o "abierta". */
export const estadoDe = a => (a.cancelado ? "cancelada" : a.programado ? "programada" : a.estado === "cerrada" ? "cerrada" : "abierta");

/** Días que faltan para la fecha (negativo si ya pasó). */
export const diasPara = (fecha, ref = hoy()) => Math.round((new Date(fecha + "T12:00") - new Date(ref + "T12:00")) / 86400000);

/** «hoy», «mañana», «en 3 días» o «hace 2 días». */
export function cuandoEs(fecha, ref = hoy()) {
  const d = diasPara(fecha, ref);
  return d === 0 ? "hoy" : d === 1 ? "mañana" : d > 1 ? `en ${d} días` : d === -1 ? "ayer" : `hace ${-d} días`;
}

/** Orden de la lista de cursos: primero los próximos (el más cercano arriba) y después el resto, del más reciente al más antiguo. */
export function ordenarCursos(lista, ref = hoy()) {
  const proximos = lista.filter(a => esProximo(a, ref)).sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.horaInicio || "").localeCompare(b.horaInicio || ""));
  const resto = lista.filter(a => !esProximo(a, ref)).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || 0) - (a.creado || 0));
  return [...proximos, ...resto];
}
