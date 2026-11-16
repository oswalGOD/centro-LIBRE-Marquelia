// Canalizaciones: a qué institución se envió a una usuaria (DIF, Fiscalía, salud…) y qué resultado tuvo.
//
// Dos almacenes:
//  - «instituciones»: catálogo editable por la Coordinadora. Es texto en claro (sin datos de personas).
//  - «canalizaciones»: cada registro es de una usuaria y lo lleva un perfil (el que canaliza). En claro solo viaja la
//    estructura (perfil y usuaria); la institución, el motivo, el estatus, las fechas, el resultado y el caso ligado
//    van cifrados con la clave del perfil (ver expedientes.js), igual que los casos. Funciona sin conexión.

import * as db from "./db.js";
import * as exp from "./expedientes.js";
import { hoy } from "./catalogos.js";

export const ESTATUS = [["enviada", "Enviada"], ["atendida", "Atendida"], ["sin_respuesta", "Sin respuesta"], ["rechazada", "Rechazada"]];
export const etiquetaEstatus = v => ESTATUS.find(e => e[0] === v)?.[1] || "";

/* ---------- Catálogo de instituciones ---------- */

// Identificadores fijos: así dos dispositivos que siembran el catálogo a la vez no crean duplicados.
const BASE = [
  ["inst-dif-municipal", "DIF municipal"],
  ["inst-fiscalia", "Fiscalía (Ministerio Público)"],
  ["inst-centro-salud", "Centro de salud"],
  ["inst-hospital", "Hospital"],
  ["inst-instituto-mujer", "Instituto de la Mujer"],
  ["inst-defensoria", "Defensoría pública"],
  ["inst-derechos-humanos", "Comisión de Derechos Humanos"],
];

/** Crea las instituciones habituales la primera vez. No vuelve a crear una que la Coordinadora haya eliminado. */
export async function sembrarInstituciones() {
  const existentes = new Set((await db.crudos("instituciones")).map(i => i.id));
  for (const [id, nombre] of BASE) if (!existentes.has(id)) await db.guardar("instituciones", { id, nombre, contacto: "", activa: true });
}

export async function listarInstituciones({ soloActivas = false } = {}) {
  const lista = (await db.todos("instituciones")).filter(i => !soloActivas || i.activa !== false);
  return lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export async function guardarInstitucion(inst, { nombre, contacto }) {
  return db.guardar("instituciones", { ...(inst || { id: db.uid(), activa: true }), nombre: nombre.trim(), contacto: (contacto || "").trim() });
}

export const activarInstitucion = (inst, activa) => db.guardar("instituciones", { ...inst, activa });
/** Quita una institución del catálogo; las canalizaciones ya registradas conservan su nombre. */
export const quitarInstitucion = id => db.borrar("instituciones", id);

/* ---------- Canalizaciones ---------- */

async function abrir(r, instituciones) {
  const d = await exp.descifrar(r.sobre, r.perfilId, r.id);
  // El nombre de la institución se guarda también dentro del registro por si después se retira del catálogo
  const nombre = d ? instituciones?.get(d.institucionId)?.nombre || d.institucion || "Institución no disponible" : "";
  return { ...r, d: d ? { ...d, nombre } : null, legible: !!d };
}

/** Canalizaciones que el perfil puede ver: las propias, o todas las que pueda abrir si es la Coordinadora. */
export async function listarCanalizaciones(yo, usuariaId) {
  const lista = usuariaId ? await db.todos("canalizaciones", "usuariaId", usuariaId) : await db.todos("canalizaciones");
  const visibles = lista.filter(c => yo.rol === "Coordinadora" || c.perfilId === yo.id);
  const inst = new Map((await db.todos("instituciones")).map(i => [i.id, i]));
  return Promise.all(visibles.map(c => abrir(c, inst)));
}

export async function unaCanalizacion(id) {
  const r = await db.uno("canalizaciones", id);
  if (!r) return null;
  return abrir(r, new Map((await db.todos("instituciones")).map(i => [i.id, i])));
}

/** Cantidad de canalizaciones de una usuaria que el perfil puede ver (no necesita abrir el cifrado). */
export async function contarCanalizaciones(yo, usuariaId) {
  return (await db.todos("canalizaciones", "usuariaId", usuariaId)).filter(c => yo.rol === "Coordinadora" || c.perfilId === yo.id).length;
}

function normalizar(d, institucion) {
  return {
    institucionId: d.institucionId,
    institucion: institucion?.nombre || d.institucion || "",
    fecha: d.fecha || hoy(),
    motivo: String(d.motivo || "").trim(),
    estatus: ESTATUS.some(e => e[0] === d.estatus) ? d.estatus : "enviada",
    seguimiento: d.estatus === "enviada" || !d.estatus ? d.seguimiento || "" : "",
    resultado: String(d.resultado || "").trim(),
    casoId: d.casoId || "",
    ...(d.registradaPor ? { registradaPor: d.registradaPor } : {}),
  };
}

/**
 * Registra una canalización. La lleva `destino` (por defecto, quien la registra). La Coordinadora no tiene clave
 * propia de expedientes: la registra a nombre de la Psicóloga o la Abogada, igual que al referir un caso.
 */
export async function crearCanalizacion(yo, usuariaId, d, institucion, destino = yo) {
  const id = db.uid();
  const referida = destino.id !== yo.id;
  const datos = normalizar({ ...d, ...(referida ? { registradaPor: yo.nombre } : {}) }, institucion);
  const sobre = await exp.cifrar(datos, destino.id, id, { referir: referida });
  return db.guardar("canalizaciones", { id, perfilId: destino.id, usuariaId, sobre });
}

export async function guardarCanalizacion(c, d, institucion) {
  const sobre = await exp.cifrar(normalizar({ ...c.d, ...d }, institucion), c.perfilId, c.id);
  const { d: _d, legible: _l, ...registro } = c;
  return db.guardar("canalizaciones", { ...registro, sobre });
}

export const borrarCanalizacion = id => db.borrar("canalizaciones", id);

/** Seguimiento pendiente de una canalización enviada: "vencido", "hoy", "proximo" (en 7 días o menos) o "". */
export function estadoSeguimiento(d) {
  if (!d || d.estatus !== "enviada" || !d.seguimiento) return "";
  const h = hoy();
  if (d.seguimiento < h) return "vencido";
  if (d.seguimiento === h) return "hoy";
  const limite = new Date(h + "T12:00");
  limite.setDate(limite.getDate() + 7);
  return d.seguimiento <= limite.toISOString().slice(0, 10) ? "proximo" : "";
}

/**
 * Conteos por institución y estatus del periodo, sin datos personales, para los informes.
 * Devuelve null si los expedientes del perfil no están abiertos en esta sesión (no hay forma de contar lo cifrado).
 */
export async function resumenCanalizaciones(yo, desde, hasta) {
  if (!exp.desbloqueado(yo)) return null;
  await exp.actualizarCopias(yo);
  const todas = (await listarCanalizaciones(yo)).filter(c => c.legible && c.d.fecha >= desde && c.d.fecha <= hasta);
  const porNombre = new Map();
  for (const c of todas) {
    const f = porNombre.get(c.d.nombre) || { nombre: c.d.nombre, enviada: 0, atendida: 0, sin_respuesta: 0, rechazada: 0, total: 0 };
    f[c.d.estatus]++;
    f.total++;
    porNombre.set(c.d.nombre, f);
  }
  const filas = [...porNombre.values()].sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
  return { total: todas.length, filas, porEstatus: ESTATUS.map(([v]) => todas.filter(c => c.d.estatus === v).length) };
}
