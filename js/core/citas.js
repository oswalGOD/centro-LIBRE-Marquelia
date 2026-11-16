// Agenda de citas individuales (asesoría psicológica o jurídica).
//
// Cada cita es un registro con una usuaria y el perfil responsable (Psicóloga o Abogada). En claro solo viaja lo
// que la agenda necesita para ordenar y contar (perfil, usuaria, fecha, hora, duración y estado); el motivo breve
// y el lugar o modalidad viajan cifrados con la clave de casos del perfil (ver expedientes.js). Las notas de la
// sesión no van aquí: pertenecen al seguimiento de casos. Funciona sin conexión y se sincroniza como lo demás.
//
// Una cita reprogramada no se modifica: queda marcada «reprogramada» y se crea otra, ligada a la primera, para
// que se pueda contar cuántas veces se movió.

import * as db from "./db.js";
import * as exp from "./expedientes.js";
import { hoy } from "./catalogos.js";

export const ESTADOS = [
  ["programada", "Programada"],
  ["asistio", "Asistió"],
  ["no_asistio", "No asistió"],
  ["reprogramada", "Reprogramada"],
  ["cancelada", "Cancelada"],
];
export const etiquetaEstado = v => ESTADOS.find(e => e[0] === v)?.[1] || "";
export const DURACIONES = [30, 45, 60, 90, 120];
export const MODALIDADES = ["En el Centro", "A domicilio", "Por teléfono", "Por videollamada"];

const aMin = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const aHora = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Hora de término de una cita (sin cruzar la medianoche: se recorta a las 23:59). */
export const horaFin = c => aHora(Math.min(aMin(c.hora) + (Number(c.duracion) || 60), 1439));

/** ¿Dos citas se encimarían en el horario? (mismo día, rangos que se traslapan) */
export const seEncima = (a, b) => a.fecha === b.fecha && aMin(a.hora) < aMin(b.hora) + (Number(b.duracion) || 60) && aMin(b.hora) < aMin(a.hora) + (Number(a.duracion) || 60);

/** Citas que aún bloquean el horario de su perfil. */
const ocupa = c => c.estado === "programada";

/** Una cita programada cuya hora ya pasó y falta registrar si asistió. */
export function porRegistrar(c, ahora = new Date()) {
  if (c.estado !== "programada") return false;
  const fin = new Date(`${c.fecha}T${horaFin(c)}`);
  return fin < ahora;
}

/** Estado de agenda para mostrar: «por_registrar» cuando ya pasó y sigue programada. */
export const estadoVisible = c => (porRegistrar(c) ? "por_registrar" : c.estado);

/** Abre una cita: devuelve el registro con `d` ({ motivo, lugar }) y `legible` (false si no se pudo abrir el cifrado). */
async function abrir(r) {
  const d = await exp.descifrar(r.sobre, r.perfilId, r.id);
  return { ...r, d: d || { motivo: "", lugar: "" }, legible: !!d };
}

/** Citas que el perfil puede ver: las propias, o todas si es la Coordinadora. Opcionalmente de una sola usuaria. */
export async function listarCitas(yo, usuariaId) {
  const lista = usuariaId ? await db.todos("citas", "usuariaId", usuariaId) : await db.todos("citas");
  const visibles = lista.filter(c => yo.rol === "Coordinadora" || c.perfilId === yo.id);
  return Promise.all(visibles.map(abrir));
}

export async function unaCita(id) {
  const r = await db.uno("citas", id);
  return r ? abrir(r) : null;
}

/** Cantidad de citas de una usuaria que el perfil puede ver (no necesita abrir el cifrado). */
export async function contarCitas(yo, usuariaId) {
  return (await db.todos("citas", "usuariaId", usuariaId)).filter(c => yo.rol === "Coordinadora" || c.perfilId === yo.id).length;
}

function normalizar(d) {
  return {
    motivo: String(d.motivo || "").trim().slice(0, 140),
    lugar: String(d.lugar || "").trim().slice(0, 80),
  };
}

/** Errores de captura de una cita (lista vacía si es válida). `existentes`: citas del mismo perfil a revisar; `ignorar`: id de la cita que se edita. */
export function validar(d, existentes = [], ignorar = "") {
  const e = [];
  if (!d.usuariaId) e.push("Seleccione a la usuaria.");
  if (!d.perfilId) e.push("Seleccione el perfil que dará la cita.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha || "")) e.push("Seleccione la fecha de la cita.");
  if (!/^\d{2}:\d{2}$/.test(d.hora || "")) e.push("Seleccione la hora de la cita.");
  if (!(Number(d.duracion) >= 15 && Number(d.duracion) <= 240)) e.push("Indique una duración de entre 15 minutos y 4 horas.");
  if (!e.length) {
    const otra = existentes.find(c => c.id !== ignorar && c.perfilId === d.perfilId && ocupa(c) && seEncima(c, { fecha: d.fecha, hora: d.hora, duracion: Number(d.duracion) }));
    if (otra) e.push(`Ese horario se encima con otra cita programada de ese perfil (${otra.hora} a ${horaFin(otra)} h).`);
  }
  return e;
}

/**
 * Agenda una cita. La responsable es `destino` (por defecto, quien la agenda). La Coordinadora puede agendar para
 * la Psicóloga o la Abogada (necesita que ese perfil ya haya ingresado con su PIN para poder cifrar el contenido).
 */
export async function crearCita(yo, destino, d) {
  const id = db.uid();
  const sobre = await exp.cifrar(normalizar(d), destino.id, id, { referir: destino.id !== yo.id });
  return db.guardar("citas", {
    id, perfilId: destino.id, usuariaId: d.usuariaId, fecha: d.fecha, hora: d.hora, duracion: Number(d.duracion) || 60,
    estado: "programada", ...(d.casoId ? { casoId: d.casoId } : {}), ...(d.reprogramadaDe ? { reprogramadaDe: d.reprogramadaDe } : {}),
    agendadaPor: yo.id, sobre,
  });
}

/** Cambia fecha, hora, duración, caso, motivo y lugar de una cita programada (no modifica el estado). */
export async function guardarCita(yo, cita, d) {
  const sobre = await exp.cifrar(normalizar(d), cita.perfilId, cita.id, { referir: yo.id !== cita.perfilId });
  const { d: _d, legible: _l, ...registro } = cita;
  const nuevo = { ...registro, fecha: d.fecha, hora: d.hora, duracion: Number(d.duracion) || 60, sobre };
  if (d.casoId) nuevo.casoId = d.casoId; else delete nuevo.casoId;
  return db.guardar("citas", nuevo);
}

/** Registra el resultado: «asistio», «no_asistio» o «cancelada», o vuelve a «programada». No toca el contenido cifrado. */
export async function cambiarEstado(cita, estado) {
  if (!ESTADOS.some(e => e[0] === estado)) throw new Error("Estado inválido");
  const { d: _d, legible: _l, ...registro } = cita;
  return db.guardar("citas", { ...registro, estado });
}

/** Reprogramar: la cita original queda «reprogramada» y se agenda otra con el mismo motivo y lugar. Devuelve la nueva. */
export async function reprogramar(yo, cita, { fecha, hora, duracion }) {
  const destino = { id: cita.perfilId };
  const nueva = await crearCita(yo, destino, {
    usuariaId: cita.usuariaId, fecha, hora, duracion: duracion || cita.duracion, casoId: cita.casoId,
    motivo: cita.d?.motivo, lugar: cita.d?.lugar, reprogramadaDe: cita.id,
  });
  const { d: _d, legible: _l, ...registro } = cita;
  await db.guardar("citas", { ...registro, estado: "reprogramada", reprogramadaA: nueva.id });
  return nueva;
}

export const borrarCita = id => db.borrar("citas", id);

/** Conteos para informes y resúmenes. Solo cifras: no incluye nombres ni motivos. */
export function contar(citas) {
  const n = estado => citas.filter(c => c.estado === estado).length;
  const asistio = n("asistio"), noAsistio = n("no_asistio");
  const atendibles = asistio + noAsistio;
  return {
    total: citas.length,
    programadas: n("programada"),
    asistio, noAsistio,
    reprogramadas: n("reprogramada"),
    canceladas: n("cancelada"),
    unicas: new Set(citas.filter(c => c.estado === "asistio").map(c => c.usuariaId)).size,
    asistencia: atendibles ? Math.round((asistio / atendibles) * 100) : null,
  };
}

/** Citas del periodo (fechas aaaa-mm-dd, ambos incluidos) que el perfil puede ver, solo con sus datos en claro. */
export async function citasDelPeriodo(yo, desde, hasta) {
  return (await db.todos("citas")).filter(c => c.fecha >= desde && c.fecha <= hasta && (yo.rol === "Coordinadora" || c.perfilId === yo.id));
}

/** Datos para el archivo de calendario (sin nombre de la usuaria ni motivo, para proteger su privacidad). */
export function paraCalendario(c) {
  return {
    id: `cita-${c.id}`, folio: "cita", nombre: "Cita programada (Centro LIBRE)",
    fecha: c.fecha, horaInicio: c.hora, horaFin: horaFin(c),
    lugar: c.d?.lugar || "",
    descripcion: "Cita programada en la aplicación del Centro LIBRE Marquelia.",
  };
}

export const esVigente = c => c.estado === "programada" && !porRegistrar(c);
export { hoy };
