// Verificación de constancias. Cada constancia lleva un código aleatorio (12 caracteres, 60 bits: no se puede adivinar)
// y un QR que abre verificar.html. La página pública consulta en Supabase una tabla aparte (supabase/verificacion.sql)
// que solo guarda nombre, curso, fecha, duración y folio: nunca CURP, teléfono ni firma.
// El código se guarda en la asistencia (viaja con la sincronización); el registro público se sube al sincronizar.

import * as db from "./db.js";

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin I ni O (se confunden con 1 y 0)
export const FORMATO_CODIGO = /^[A-HJ-NP-Z2-9]{12}$/;

export function nuevoCodigo() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, x => ALFABETO[x % 32]).join(""); // 256 es múltiplo de 32: sin sesgo
}

/** «ABCD-EFGH-JKLM» para leerlo y teclearlo. */
export const codigoLegible = c => c.replace(/(.{4})(?=.)/g, "$1-");

/** Enlace de la página pública, en la misma dirección de la aplicación. */
export const urlVerificacion = c => new URL(`verificar.html?c=${c}`, document.baseURI).href;

/** Datos públicos de una constancia. Su huella decide si hay que volver a subirla (p. ej. si se corrigió el nombre). */
export function datosPublicos(x, act) {
  return { codigo: x.codigoVerif, nombre: String(x.datos?.nombre || "").trim(), curso: act.nombre, fecha: act.fecha, horas: Number(act.horas) || 0, folio: act.folio };
}
const huellaDe = d => (d.anulada ? "anulada" : [d.nombre, d.curso, d.fecha, d.horas, d.folio].join("|"));

/** Da código a las asistencias que aún no lo tienen. Devuelve las filas ({ x, numero }) con su código. */
export async function asegurarCodigos(filas) {
  const salida = [];
  for (const f of filas) {
    if (f.x.codigoVerif) { salida.push(f); continue; }
    const actual = (await db.uno("asistencias", f.x.id)) || f.x;
    const x = actual.codigoVerif ? actual : await db.guardar("asistencias", { ...actual, codigoVerif: nuevoCodigo() });
    f.x.codigoVerif = x.codigoVerif;
    salida.push({ ...f, x: { ...f.x, codigoVerif: x.codigoVerif } });
  }
  return salida;
}

/** Constancias por registrar en la nube: [{ codigo, nombre, curso, fecha, horas, folio, anulada }] (las anuladas solo llevan el código) y el mapa de huellas ya subidas. */
export async function pendientesDeRegistro() {
  const subidas = (await db.leerMeta("constanciasRegistradas")) || {};
  const acts = new Map((await db.crudos("actividades")).map(a => [a.id, a]));
  const lista = [];
  for (const x of await db.crudos("asistencias")) {
    if (!x.codigoVerif) continue;
    const act = acts.get(x.actividadId);
    const vigente = !x.borrado && act && !act.borrado && act.curso;
    if (!vigente && !subidas[x.codigoVerif]) continue; // nunca se subió: no hay nada que anular
    const d = vigente ? { ...datosPublicos(x, act), anulada: false } : { codigo: x.codigoVerif, anulada: true };
    if (subidas[d.codigo] !== huellaDe(d)) lista.push(d);
  }
  return { lista, subidas };
}

export async function marcarRegistradas(enviadas, subidas) {
  for (const d of enviadas) subidas[d.codigo] = huellaDe(d);
  await db.escribirMeta("constanciasRegistradas", subidas);
}

/** Cuántas de estas constancias ya están registradas en la nube. */
export async function contarRegistradas(filas, act) {
  const subidas = (await db.leerMeta("constanciasRegistradas")) || {};
  return filas.filter(f => f.x.codigoVerif && subidas[f.x.codigoVerif] === huellaDe({ ...datosPublicos(f.x, act), anulada: false })).length;
}
