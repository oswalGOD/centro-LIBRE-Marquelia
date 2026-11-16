// Reglas de acceso por perfil.
// - Coordinadora: ve y administra todo (crear, editar, programar, cancelar, eliminar).
// - Psicóloga y Abogada: ven las actividades que crearon o que facilitan, y administran esas actividades.
// - Cursos y capacitaciones (curso: true): los ven todos los perfiles, pero solo la Coordinadora los
//   administra. Los demás perfiles únicamente consultan, y pueden usar el modo captura de datos y
//   capturar evidencias fotográficas mientras el curso esté abierto.

import { esCoordinadora } from "./auth.js";

export const puedeVer = (yo, actividad) =>
  esCoordinadora(yo) || Boolean(actividad.curso) || actividad.creadaPor === yo.id || actividad.facilitadoraId === yo.id;

/** Editar datos, registrar asistentes a mano, programar, cancelar o cerrar. */
export const puedeEditar = (yo, actividad) =>
  actividad.estado !== "cerrada" && (esCoordinadora(yo) || (!actividad.curso && puedeVer(yo, actividad)));

/** Modo captura de datos y evidencias fotográficas: además de quien edita, cualquier perfil en un curso abierto. */
export const puedeCapturar = (yo, actividad) =>
  actividad.estado !== "cerrada" && (puedeEditar(yo, actividad) || (Boolean(actividad.curso) && puedeVer(yo, actividad)));

/** Crear, programar y administrar cursos y capacitaciones. */
export const puedeAdministrarCursos = yo => esCoordinadora(yo);

// Seguimiento de casos confidenciales: cada perfil con casos (Psicóloga, Abogada) ve y edita solo los suyos;
// la Coordinadora los ve todos, solo para lectura.
export const llevaCasos = yo => yo?.rol === "Psicóloga" || yo?.rol === "Abogada";
export const puedeVerCaso = (yo, caso) => esCoordinadora(yo) || caso.perfilId === yo.id;
export const puedeEditarCaso = (yo, caso) => llevaCasos(yo) && caso.perfilId === yo.id;
/** Abrir casos: Psicóloga y Abogada los suyos; la Coordinadora también, para referirlos a otro perfil (primer contacto). */
export const puedeCrearCaso = yo => llevaCasos(yo) || esCoordinadora(yo);
export const puedeUsarCasos = yo => llevaCasos(yo) || esCoordinadora(yo);
