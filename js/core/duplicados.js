// Duplicados al sincronizar y fusión de fichas de usuarias.
//
// Tres piezas:
//  1. Una sola asistencia por usuaria en cada actividad o curso. Si dos dispositivos sin conexión
//     registraron a la misma persona, al sincronizar se conserva una: la que tiene firma y, si ambas
//     la tienen (o ninguna), la más reciente. La otra queda marcada como «unida».
//  2. Numeración sin empates: si dos dispositivos asignaron el mismo número de línea, se renumera.
//  3. Posibles duplicadas en el padrón (mismo nombre y fecha de nacimiento parecidos, aunque falte la
//     CURP) y fusión asistida de dos fichas, que conserva los datos más recientes.
// Las reglas son iguales en todos los dispositivos, de modo que todos llegan al mismo resultado.

import * as db from "./db.js";
import { normalizar } from "./catalogos.js";

/* ---------- 1 y 2. Asistencias ---------- */

const CON_USUARIA = ["asistencias", "casos", "canalizaciones", "citas"];

/**
 * Calcula qué hacer con las asistencias vigentes (sin borrar):
 *  - unir: [{ id, conId }] filas repetidas (misma usuaria en la misma actividad) y la que se conserva.
 *  - renumerar: [{ id, orden }] cuando quedan dos filas con el mismo número de línea en una actividad.
 */
export function planificarAsistencias(asistencias) {
  const porActividad = new Map();
  for (const x of asistencias) {
    if (!porActividad.has(x.actividadId)) porActividad.set(x.actividadId, []);
    porActividad.get(x.actividadId).push(x);
  }
  const unir = [], renumerar = [];
  for (const filas of porActividad.values()) {
    const porUsuaria = new Map();
    for (const x of filas) {
      if (!porUsuaria.has(x.usuariaId)) porUsuaria.set(x.usuariaId, []);
      porUsuaria.get(x.usuariaId).push(x);
    }
    const quedan = [];
    for (const grupo of porUsuaria.values()) {
      // Primero la que tiene firma, luego la más reciente; el id desempata igual en todos los equipos
      grupo.sort((a, b) => (!!b.firma - !!a.firma) || (b.actualizado - a.actualizado) || (a.id < b.id ? -1 : 1));
      quedan.push(grupo[0]);
      for (const x of grupo.slice(1)) unir.push({ id: x.id, conId: grupo[0].id });
    }
    // Mismo criterio de orden que las pantallas: número de línea y, si empatan, el id
    quedan.sort((a, b) => (a.orden - b.orden) || (a.id < b.id ? -1 : 1));
    if (new Set(quedan.map(x => x.orden)).size !== quedan.length) {
      quedan.forEach((x, i) => { if (x.orden !== i + 1) renumerar.push({ id: x.id, orden: i + 1 }); });
    }
  }
  return { unir, renumerar };
}

/** Las usuarias unidas apuntan a la que quedó (`fusionadaEn`); sigue la cadena hasta la ficha vigente. */
const destinoDe = (fusionadas, id) => {
  let actual = id;
  for (let i = 0; i < 10 && fusionadas.has(actual); i++) actual = fusionadas.get(actual);
  return actual;
};

/** Lo que quedó apuntando a una ficha unida (asistencias, casos, canalizaciones, citas) pasa a la ficha vigente. */
async function repararReferencias() {
  const fusionadas = new Map((await db.crudos("usuarias")).filter(u => u.borrado && u.fusionadaEn).map(u => [u.id, u.fusionadaEn]));
  if (!fusionadas.size) return 0;
  let n = 0;
  for (const almacen of CON_USUARIA) {
    for (const x of await db.crudos(almacen)) {
      if (x.borrado || !fusionadas.has(x.usuariaId)) continue;
      await db.guardar(almacen, { ...x, usuariaId: destinoDe(fusionadas, x.usuariaId) });
      n++;
    }
  }
  return n;
}

async function depurarAsistencias() {
  const { unir, renumerar } = planificarAsistencias((await db.crudos("asistencias")).filter(x => !x.borrado));
  if (!unir.length && !renumerar.length) return 0;
  const crudas = new Map((await db.crudos("asistencias")).map(x => [x.id, x]));
  for (const { id, conId } of unir) await db.guardar("asistencias", { ...crudas.get(id), borrado: true, unidaCon: conId });
  for (const { id, orden } of renumerar) await db.guardar("asistencias", { ...crudas.get(id), orden });
  return unir.length + renumerar.length;
}

/**
 * Se ejecuta después de recibir cambios de otros dispositivos. Devuelve cuántos registros modificó
 * (si es mayor que cero hay que volver a enviar).
 */
export async function reconciliar() {
  return (await repararReferencias()) + (await depurarAsistencias());
}

/* ---------- 3. Posibles duplicadas ---------- */

const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "van", "von"]);
const partes = s => normalizar(s).replace(/[^a-z\s]/g, " ").split(/\s+/).filter(p => p && !PARTICULAS.has(p));

function distancia(a, b, tope = 3) {
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) fila[j] = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previa = fila;
  }
  return previa[b.length];
}

/** "igual" (mismas palabras), "parecido" (faltan palabras o hay faltas de ortografía) o null. */
export function compararNombres(a, b) {
  const ta = partes(a), tb = partes(b);
  if (ta.length < 2 || tb.length < 2) return null;
  const sa = [...ta].sort().join(" "), sb = [...tb].sort().join(" ");
  if (sa === sb) return "igual";
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // Cada palabra del nombre más corto aparece (casi igual) en el más largo: p. ej. falta el segundo nombre
  const casi = (p, q) => p === q || (p.length >= 4 && q.length >= 4 && distancia(p, q, 1) <= 1);
  const usadas = new Set();
  const todas = corto.every(p => {
    const i = largo.findIndex((q, k) => !usadas.has(k) && casi(p, q));
    if (i < 0) return false;
    usadas.add(i);
    return true;
  });
  if (todas) return "parecido";
  const lim = sa.length > 20 ? 3 : 2;
  return distancia(sa, sb, lim) <= lim ? "parecido" : null;
}

/** Fechas AAAA-MM-DD que difieren en un solo carácter o con día y mes cambiados de lugar. */
export function fechasCasiIguales(a, b) {
  if (!a || !b || a === b) return false;
  if (distancia(a, b, 1) <= 1) return true;
  const [ya, ma, da] = a.split("-"), [yb, mb, db_] = b.split("-");
  return ya === yb && ma === db_ && da === mb;
}

const CLAVE_PAR = (a, b) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);
const marcadasDistintas = (a, b) => (a.distintas || []).includes(b.id) || (b.distintas || []).includes(a.id);

/**
 * Parejas de fichas que podrían ser la misma persona. No se sugieren las que ya se marcaron como
 * distintas ni las que tienen CURP diferente (con CURP distinta son personas distintas).
 * Devuelve [{ a, b, motivo }].
 */
export function buscarDuplicadas(usuarias) {
  const vivas = usuarias.filter(u => !u.borrado && u.nombre);
  const porFecha = new Map(), porNombre = new Map();
  for (const u of vivas) {
    if (u.fnac) (porFecha.get(u.fnac) || porFecha.set(u.fnac, []).get(u.fnac)).push(u);
    const clave = partes(u.nombre).sort().join(" ");
    if (clave) (porNombre.get(clave) || porNombre.set(clave, []).get(clave)).push(u);
  }
  const pares = new Map();
  const probar = (a, b, motivo) => {
    if (a.id === b.id || marcadasDistintas(a, b)) return;
    if (a.curp && b.curp && a.curp !== b.curp) return;
    const k = CLAVE_PAR(a, b);
    if (!pares.has(k)) pares.set(k, { a, b, motivo });
  };
  for (const grupo of porFecha.values()) {
    for (let i = 0; i < grupo.length; i++) for (let j = i + 1; j < grupo.length; j++) {
      const r = compararNombres(grupo[i].nombre, grupo[j].nombre);
      if (r) probar(grupo[i], grupo[j], r === "igual" ? "Mismo nombre y misma fecha de nacimiento" : "Nombre parecido y misma fecha de nacimiento");
    }
  }
  for (const grupo of porNombre.values()) {
    for (let i = 0; i < grupo.length; i++) for (let j = i + 1; j < grupo.length; j++) {
      if (fechasCasiIguales(grupo[i].fnac, grupo[j].fnac)) probar(grupo[i], grupo[j], "Mismo nombre y fecha de nacimiento casi igual");
    }
  }
  return [...pares.values()].sort((x, y) => x.a.nombre.localeCompare(y.a.nombre, "es"));
}

/* ---------- Fusión de dos fichas ---------- */

export const CAMPOS_FICHA = ["curp", "nombre", "fnac", "lugar", "sexo", "grupo", "ocupacion", "telefono"];
const vacio = v => v === undefined || v === null || String(v).trim() === "";

/**
 * Qué ficha se conserva y con qué datos. Cada dato sale de la ficha modificada más recientemente;
 * si ahí está vacío se toma el de la otra (y un nombre más completo no se cambia por uno abreviado). `visitas(id)` = asistencias de cada ficha.
 */
export function planificarFusion(a, b, visitas = () => 0) {
  const [nueva, vieja] = (a.actualizado || 0) >= (b.actualizado || 0) ? [a, b] : [b, a];
  const datos = {};
  for (const c of CAMPOS_FICHA) {
    let v = !vacio(nueva[c]) ? nueva[c] : vieja[c];
    // Un nombre más completo (p. ej. con segundo nombre) no se sustituye por uno abreviado, aunque este sea más reciente
    if (c === "nombre" && !vacio(nueva[c]) && !vacio(vieja[c]) && partes(vieja[c]).length > partes(nueva[c]).length && compararNombres(nueva[c], vieja[c])) v = vieja[c];
    if (!vacio(v)) datos[c] = v;
  }
  // La ficha que se conserva: la que tiene más asistencias; si empatan, la más antigua (y el id desempata)
  const orden = [a, b].sort((x, y) => (visitas(y.id) - visitas(x.id)) || ((x.creado || 0) - (y.creado || 0)) || (x.id < y.id ? -1 : 1));
  const [queda, sale] = orden;
  const diferencias = CAMPOS_FICHA.filter(c => !vacio(a[c]) && !vacio(b[c]) && String(a[c]).trim() !== String(b[c]).trim());
  return { queda, sale, datos, diferencias, deLaNueva: id => id === nueva.id };
}

/** Une dos fichas: `sale` queda marcada como unida a `queda`, y todo lo que apuntaba a ella pasa a `queda`. */
export async function unirUsuarias(idA, idB) {
  const [a, b] = [await db.uno("usuarias", idA), await db.uno("usuarias", idB)];
  if (!a || !b || a.id === b.id) throw new Error("No se encontró alguna de las fichas.");
  if (a.curp && b.curp && a.curp !== b.curp) throw new Error("Las fichas tienen CURP distinta: no se pueden unir.");
  const asis = await db.todos("asistencias");
  const visitas = id => asis.filter(x => x.usuariaId === id).length;
  const { queda, sale, datos } = planificarFusion(a, b, visitas);
  // Primero se libera la CURP de la que sale (el índice de CURP no admite repetidas)
  const unida = { ...sale, fusionadaEn: queda.id, borrado: true };
  delete unida.curp;
  await db.guardar("usuarias", unida);
  const nueva = { ...queda };
  for (const c of CAMPOS_FICHA) delete nueva[c];
  await db.guardar("usuarias", { ...nueva, ...datos, distintas: [...new Set([...(queda.distintas || []), ...(sale.distintas || [])])].filter(x => x !== sale.id && x !== queda.id) });
  const cambios = await reconciliar();
  return { queda: queda.id, cambios };
}

/** Marca dos fichas como personas distintas para que no se vuelvan a sugerir. */
export async function marcarDistintas(idA, idB) {
  const [a, b] = [await db.uno("usuarias", idA), await db.uno("usuarias", idB)];
  if (!a || !b) return;
  const [primera] = a.id < b.id ? [a, b] : [b, a];
  const otra = primera === a ? b : a;
  await db.guardar("usuarias", { ...primera, distintas: [...new Set([...(primera.distintas || []), otra.id])] });
}
