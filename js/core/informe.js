// Informe para financiadores y autoridades: cálculo de los datos agregados de un periodo.
// Solo se obtienen totales y conteos: nunca nombres, CURP, teléfonos ni firmas de las usuarias.
// Se calcula con los datos guardados en el dispositivo, por lo que funciona sin conexión.

import * as db from "./db.js";
import { edad, rangoDe, minutosEntre, hoy } from "./catalogos.js";
import { puedeVer } from "./permisos.js";

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const SEXOS_INFORME = [["M", "Mujeres"], ["H", "Hombres"], ["Otro", "Otro"]];
export const ETIQUETA_CURSOS = "Cursos y capacitaciones";

const dos = n => String(n).padStart(2, "0");
const ultimoDia = (anio, mes) => new Date(anio, mes, 0).getDate(); // mes de 1 a 12

/** Fechas (aaaa-mm-dd) y título del periodo. modo: "mes", "trimestre" o "rango". */
export function periodo({ modo, anio, mes, trimestre, desde, hasta }) {
  if (modo === "mes") {
    return { desde: `${anio}-${dos(mes)}-01`, hasta: `${anio}-${dos(mes)}-${dos(ultimoDia(anio, mes))}`, titulo: `${MESES[mes - 1]} de ${anio}`, tipo: "Informe mensual" };
  }
  if (modo === "trimestre") {
    const m1 = (trimestre - 1) * 3 + 1, m3 = m1 + 2;
    return { desde: `${anio}-${dos(m1)}-01`, hasta: `${anio}-${dos(m3)}-${dos(ultimoDia(anio, m3))}`, titulo: `${["primer", "segundo", "tercer", "cuarto"][trimestre - 1]} trimestre de ${anio} (${MESES[m1 - 1]} a ${MESES[m3 - 1]})`, tipo: "Informe trimestral" };
  }
  const [a, b] = desde <= hasta ? [desde, hasta] : [hasta, desde];
  const f = x => `${Number(x.slice(8, 10))} de ${MESES[Number(x.slice(5, 7)) - 1]} de ${x.slice(0, 4)}`;
  return { desde: a, hasta: b, titulo: `del ${f(a)} al ${f(b)}`, tipo: "Informe por periodo" };
}

const minutosDe = a => {
  const m = minutosEntre(a.horaInicio, a.horaFin);
  if (m != null) return m;
  return a.curso && Number(a.horas) > 0 ? Math.round(Number(a.horas) * 60) : null;
};

const conteoSexo = filas => SEXOS_INFORME.map(([s]) => filas.filter(r => r.sexo === s).length);

/**
 * Datos agregados del periodo para el perfil `yo` (la Coordinadora ve todo; los demás, lo que ya ven en Estadísticas).
 * alcance: "todo", "actividades" o "cursos".
 */
export async function calcularInforme(yo, { desde, hasta, alcance = "todo" }) {
  const [acts, asis] = await Promise.all([db.todos("actividades"), db.todos("asistencias")]);
  const visibles = acts.filter(a => puedeVer(yo, a) && !a.programado && !a.cancelado);
  const delPeriodo = visibles
    .filter(a => a.fecha >= desde && a.fecha <= hasta)
    .filter(a => alcance === "todo" || (alcance === "cursos") === Boolean(a.curso))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.folio.localeCompare(b.folio));
  const porId = new Map(delPeriodo.map(a => [a.id, a]));

  const registros = asis.filter(x => porId.has(x.actividadId)).map(x => {
    const a = porId.get(x.actividadId);
    return { usuariaId: x.usuariaId, actividad: a, sexo: x.datos.sexo, grupo: x.datos.grupo, rango: rangoDe(edad(x.datos.fnac, a.fecha)) };
  });

  // Usuarias distintas: una vez cada una, con sus datos de la última actividad del periodo
  const porUsuaria = new Map();
  for (const r of registros) {
    const u = porUsuaria.get(r.usuariaId) || { n: 0, ultima: r };
    u.n++;
    if (r.actividad.fecha >= u.ultima.actividad.fecha) u.ultima = r;
    porUsuaria.set(r.usuariaId, u);
  }
  const unicas = [...porUsuaria.values()].map(u => u.ultima);
  const recurrentes = [...porUsuaria.values()].filter(u => u.n >= 2).length;

  // Nuevas: su primera asistencia (entre todo lo que este perfil puede ver) cae dentro del periodo
  const fechaDe = new Map(visibles.map(a => [a.id, a.fecha]));
  const primera = new Map();
  for (const x of asis) {
    const f = fechaDe.get(x.actividadId);
    if (f && (!primera.has(x.usuariaId) || f < primera.get(x.usuariaId))) primera.set(x.usuariaId, f);
  }
  const nuevas = [...porUsuaria.keys()].filter(id => primera.get(id) >= desde).length;

  const minutos = delPeriodo.map(minutosDe);
  const conHorario = minutos.filter(m => m != null);

  // Por actividad o curso
  const actividades = delPeriodo.map((a, i) => {
    const de = registros.filter(r => r.actividad.id === a.id);
    return { id: a.id, fecha: a.fecha, folio: a.folio, nombre: a.nombre, tipo: a.curso ? ETIQUETA_CURSOS : a.tipo, curso: Boolean(a.curso), lugar: a.lugar, minutos: minutos[i], sexo: conteoSexo(de), total: de.length };
  });

  // Por tipo
  const porTipo = [...new Set(actividades.map(a => a.tipo))].sort((x, y) => (x === ETIQUETA_CURSOS) - (y === ETIQUETA_CURSOS) || x.localeCompare(y, "es")).map(tipo => {
    const acs = actividades.filter(a => a.tipo === tipo);
    const ids = new Set(acs.map(a => a.id));
    const de = registros.filter(r => ids.has(r.actividad.id));
    return { tipo, actividades: acs.length, asistencias: de.length, unicas: new Set(de.map(r => r.usuariaId)).size, sexo: conteoSexo(de), minutos: acs.reduce((t, a) => t + (a.minutos || 0), 0) };
  });

  // Por mes (solo tiene sentido si el periodo abarca más de un mes)
  const meses = [];
  for (let y = Number(desde.slice(0, 4)), m = Number(desde.slice(5, 7)); y * 12 + m <= Number(hasta.slice(0, 4)) * 12 + Number(hasta.slice(5, 7)); m === 12 ? (y++, m = 1) : m++) {
    const clave = `${y}-${dos(m)}`;
    const acs = actividades.filter(a => a.fecha.startsWith(clave));
    const de = registros.filter(r => r.actividad.fecha.startsWith(clave));
    meses.push({ clave, etiqueta: `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${y}`, actividades: acs.length, asistencias: de.length, unicas: new Set(de.map(r => r.usuariaId)).size });
  }

  return {
    desde, hasta, alcance, generado: hoy(),
    totales: {
      actividades: actividades.filter(a => !a.curso).length,
      cursos: actividades.filter(a => a.curso).length,
      asistencias: registros.length,
      unicas: unicas.length, nuevas, recurrentes,
      minutos: conHorario.reduce((t, m) => t + m, 0), sinHorario: delPeriodo.length - conHorario.length,
    },
    sexoAsistencias: conteoSexo(registros),
    sexoUnicas: conteoSexo(unicas),
    registros, unicas, actividades, porTipo, meses,
  };
}

/** Tabla cruzada (catálogo × sexo) a partir de filas con { sexo, [clave] }. */
export function cruzar(filas, clave, catalogo) {
  return catalogo.map(([v, texto]) => {
    const de = filas.filter(r => r[clave] === v);
    return { v, texto, sexo: conteoSexo(de), total: de.length };
  });
}

/** Fotografías disponibles (por actividad) para incluir en el informe: [{ actividad, fotos: [evidencia] }]. */
export async function evidenciasDelPeriodo(actividades) {
  const ids = new Set(actividades.map(a => a.id));
  const todas = (await db.todos("evidencias")).filter(e => ids.has(e.actividadId));
  return actividades
    .map(a => ({
      actividad: a,
      fotos: todas.filter(e => e.actividadId === a.id).sort((x, y) => (x.orden ?? x.tomadaEn) - (y.orden ?? y.tomadaEn) || x.tomadaEn - y.tomadaEn || x.id.localeCompare(y.id)),
    }))
    .filter(g => g.fotos.length);
}
