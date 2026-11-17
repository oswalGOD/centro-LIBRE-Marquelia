// Reglas de acceso por perfil.
// - Coordinadora: ve y administra todo (crear, editar, programar, cancelar, eliminar).
// - Asesora Psicoemocional (rol interno «Psicóloga») y Asesora Jurídica (rol interno «Abogada»): ven las actividades que crearon o que facilitan (al compartir una actividad cada perfil recibe su propia copia), y administran esas actividades.
// - Cursos y capacitaciones (curso: true): los ven todos los perfiles, pero solo la Coordinadora los
//   administra (programar, crear, editar, cancelar, cerrar, eliminar y emitir constancias). Los demás perfiles
//   pueden registrar usuarias (a mano o con el modo captura de datos) y capturar evidencias fotográficas
//   mientras el curso esté abierto.

import { esCoordinadora } from "./auth.js";

export const puedeVer = (yo, actividad) =>
  esCoordinadora(yo) || Boolean(actividad.curso) || actividad.creadaPor === yo.id || actividad.facilitadoraId === yo.id;

/** Compartir una lista de asistencia con otro perfil: quien la ve, salvo cursos (los administra la Coordinadora). */
export const puedeCompartir = (yo, actividad) => !actividad.curso && !actividad.cancelado && puedeVer(yo, actividad);

/** Editar datos, registrar asistentes a mano, programar, cancelar o cerrar. */
export const puedeEditar = (yo, actividad) =>
  actividad.estado !== "cerrada" && (esCoordinadora(yo) || (!actividad.curso && puedeVer(yo, actividad)));

/** Registrar asistentes (a mano o con el modo captura de datos) y evidencias fotográficas: además de quien edita, cualquier perfil en un curso abierto. */
export const puedeCapturar = (yo, actividad) =>
  actividad.estado !== "cerrada" && (puedeEditar(yo, actividad) || (Boolean(actividad.curso) && puedeVer(yo, actividad)));

/** Crear, programar y administrar cursos y capacitaciones. */
export const puedeAdministrarCursos = yo => esCoordinadora(yo);

// Seguimiento de casos confidenciales: cada perfil con casos (Asesora Psicoemocional, Asesora Jurídica) ve y edita solo los suyos;
// la Coordinadora los ve todos, solo para lectura.
export const llevaCasos = yo => yo?.rol === "Psicóloga" || yo?.rol === "Abogada";
export const puedeVerCaso = (yo, caso) => esCoordinadora(yo) || caso.perfilId === yo.id;
export const puedeEditarCaso = (yo, caso) => llevaCasos(yo) && caso.perfilId === yo.id;
/** Abrir casos: Asesora Psicoemocional y Asesora Jurídica los suyos; la Coordinadora también, para referirlos a otro perfil (primer contacto). */
export const puedeCrearCaso = yo => llevaCasos(yo) || esCoordinadora(yo);
export const puedeUsarCasos = yo => llevaCasos(yo) || esCoordinadora(yo);

// Agenda de citas individuales: cada perfil con casos (Asesora Psicoemocional, Asesora Jurídica) ve y gestiona las suyas; la Coordinadora ve todas,
// y puede agendar, reprogramar y cancelar las de cualquier perfil. El contenido (motivo y lugar) va cifrado, como en casos.
export const puedeUsarCitas = yo => llevaCasos(yo) || esCoordinadora(yo);
export const puedeAgendarCita = puedeUsarCitas;
export const puedeVerCita = (yo, cita) => esCoordinadora(yo) || cita.perfilId === yo.id;
export const puedeGestionarCita = puedeVerCita;
