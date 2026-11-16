// Seguimiento de casos confidenciales (Psicóloga y Abogada).
//
// Cada caso es un expediente de una usuaria con un perfil; cada nota de sesión es un registro aparte
// (así dos dispositivos pueden agregar notas a la vez sin pisarse). Lo único que se guarda en claro es la
// estructura (quién lo lleva y de quién es); el asunto, el estatus, las fechas de seguimiento y las notas
// viajan siempre cifrados (ver expedientes.js). Funciona sin conexión y se sincroniza como lo demás.

import * as db from "./db.js";
import * as exp from "./expedientes.js";
import { hoy } from "./catalogos.js";

export const ESTATUS = [["abierto", "Abierto"], ["en_proceso", "En proceso"], ["cerrado", "Cerrado"]];
export const etiquetaEstatus = v => ESTATUS.find(e => e[0] === v)?.[1] || "";

/** Abre un caso: devuelve el registro con su contenido en `d` y `legible` (false si no se pudo abrir). */
async function abrirCaso(r) {
  const d = await exp.descifrar(r.sobre, r.perfilId, r.id);
  return { ...r, d: d || null, legible: !!d };
}

/** Casos que el perfil puede ver: los propios, o todos si es la Coordinadora. Opcionalmente de una sola usuaria. */
export async function listarCasos(yo, usuariaId) {
  const lista = usuariaId ? await db.todos("casos", "usuariaId", usuariaId) : await db.todos("casos");
  const visibles = lista.filter(c => yo.rol === "Coordinadora" || c.perfilId === yo.id);
  return Promise.all(visibles.map(abrirCaso));
}

export async function uncaso(id) {
  const r = await db.uno("casos", id);
  return r ? abrirCaso(r) : null;
}

/** Cantidad de casos de una usuaria que el perfil puede ver (no necesita abrir el cifrado). */
export async function contarCasos(yo, usuariaId) {
  return (await db.todos("casos", "usuariaId", usuariaId)).filter(c => yo.rol === "Coordinadora" || c.perfilId === yo.id).length;
}

/**
 * Abre un caso. Lo lleva `destino` (por defecto, quien lo abre). La Coordinadora puede abrirlo y referirlo a la
 * Psicóloga o la Abogada, con una nota opcional de primer contacto; a partir de ahí solo lo edita quien lo lleva.
 */
export async function crearCaso(yo, usuariaId, d, destino = yo, notaInicial = "") {
  const id = db.uid();
  const referido = destino.id !== yo.id;
  const datos = normalizarCaso(d);
  if (referido) datos.referidoPor = yo.nombre;
  const sobre = await exp.cifrar(datos, destino.id, id, { referir: referido });
  const caso = await db.guardar("casos", { id, perfilId: destino.id, usuariaId, sobre });
  if (notaInicial.trim()) {
    const idNota = db.uid();
    const sobreNota = await exp.cifrar({ fecha: hoy(), texto: notaInicial.trim(), autora: yo.nombre }, destino.id, idNota, { referir: referido });
    await db.guardar("notasCaso", { id: idNota, casoId: id, perfilId: destino.id, sobre: sobreNota });
  }
  return caso;
}

export async function guardarCaso(caso, d) {
  const sobre = await exp.cifrar(normalizarCaso(d), caso.perfilId, caso.id);
  const { d: _d, legible: _l, ...registro } = caso;
  return db.guardar("casos", { ...registro, sobre });
}

function normalizarCaso(d) {
  return {
    asunto: String(d.asunto || "").trim(),
    estatus: ESTATUS.some(e => e[0] === d.estatus) ? d.estatus : "abierto",
    proximo: d.proximo || "",
    hora: d.proximo ? d.hora || "" : "",
    ...(d.referidoPor ? { referidoPor: d.referidoPor } : {}),
  };
}

/** Notas de un caso, de la más reciente a la más antigua. */
export async function listarNotas(caso) {
  const lista = await db.todos("notasCaso", "casoId", caso.id);
  const abiertas = await Promise.all(lista.map(async r => ({ ...r, d: await exp.descifrar(r.sobre, r.perfilId, r.id) })));
  return abiertas.sort((a, b) => ((b.d?.fecha || "").localeCompare(a.d?.fecha || "")) || (b.creado - a.creado));
}

export async function guardarNota(caso, nota, { fecha, texto }) {
  const id = nota?.id || db.uid();
  const sobre = await exp.cifrar({ fecha, texto: String(texto).trim() }, caso.perfilId, id);
  const { d: _d, ...resto } = nota || {};
  return db.guardar("notasCaso", { ...resto, id, casoId: caso.id, perfilId: caso.perfilId, sobre });
}

export const borrarNota = id => db.borrar("notasCaso", id);

/** Estado del seguimiento de un caso abierto: "vencido", "hoy", "proximo" (en 7 días o menos) o "". */
export function estadoSeguimiento(d) {
  if (!d || d.estatus === "cerrado" || !d.proximo) return "";
  const h = hoy();
  if (d.proximo < h) return "vencido";
  if (d.proximo === h) return "hoy";
  const limite = new Date(h + "T12:00");
  limite.setDate(limite.getDate() + 7);
  return d.proximo <= limite.toISOString().slice(0, 10) ? "proximo" : "";
}
