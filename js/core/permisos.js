// Reglas de acceso por perfil.
// - Actividades (listas de asistencia): cada perfil, incluida la Coordinadora, ve y administra solo las que creó o facilita.
//   La Agenda de actividades es común: todas ven qué se realizó y cada perfil puede obtener su propia copia.
// - Cursos y capacitaciones (curso: true): son colectivos. Todos los perfiles los ven, crean, programan, editan,
//   cancelan y cierran; todos son facilitadores (el formato impreso lleva el nombre de quien lo imprime).
//   Eliminar un curso y reabrirlo queda a cargo de la Coordinadora.

import { esCoordinadora } from "./auth.js";

export const puedeVer = (yo, actividad) =>
  Boolean(actividad.curso) || actividad.creadaPor === yo.id || actividad.facilitadoraId === yo.id;

/** Compartir una lista de asistencia con otro perfil: quien la ve, salvo cursos (son colectivos). */
export const puedeCompartir = (yo, actividad) => !actividad.curso && !actividad.cancelado && puedeVer(yo, actividad);

/** Editar datos, registrar asistentes a mano, programar, cancelar o cerrar. */
export const puedeEditar = (yo, actividad) => actividad.estado !== "cerrada" && puedeVer(yo, actividad);

/** Registrar asistentes (a mano o con el modo captura de datos) y evidencias fotográficas. */
export const puedeCapturar = puedeEditar;

/** Crear, programar y administrar cursos y capacitaciones: todos los perfiles. */
export const puedeAdministrarCursos = () => true;

/** Reabrir una actividad cerrada o eliminarla: quien la administra; los cursos, solo la Coordinadora. */
export const puedeEliminar = (yo, actividad) => (actividad.curso ? esCoordinadora(yo) : puedeVer(yo, actividad));

/** Obtener una copia propia desde la Agenda: actividades ya realizadas, originales y de otro perfil. */
export const puedeObtenerCopia = (yo, actividad) =>
  !actividad.curso && !actividad.programado && !actividad.cancelado && !actividad.compartidas?.length && !puedeVer(yo, actividad);

/** La Agenda la ven todos los perfiles: actividades originales (no cursos ni copias). */
export const esDeAgenda = actividad => !actividad.curso && !actividad.compartidas?.length;

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
