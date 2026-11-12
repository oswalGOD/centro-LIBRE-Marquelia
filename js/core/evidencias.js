// Evidencias fotográficas: datos de cada foto (se sincronizan) e imagen (queda en el dispositivo
// y se envía al almacenamiento privado de Supabase cuando hay internet; ver sync.js).

import * as db from "./db.js";

const clave = e => e.orden ?? e.tomadaEn;

/** Evidencias vigentes de una actividad, en el orden definido (por omisión, el orden en que se tomaron). */
export async function de(actividadId) {
  return (await db.todos("evidencias", "actividadId", actividadId)).sort((a, b) => clave(a) - clave(b) || a.tomadaEn - b.tomadaEn || a.id.localeCompare(b.id));
}

/** Mueve una foto una posición (delta -1 o 1) intercambiando su lugar con la vecina. Devuelve false en los extremos. */
export async function mover(actividadId, id, delta) {
  const lista = await de(actividadId);
  const i = lista.findIndex(e => e.id === id), j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return false;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  // Se numera toda la carpeta (solo se guardan las fotos cuyo número cambia): así no hay empates ni saltos
  for (const [n, e] of lista.entries()) if (e.orden !== n) await db.guardar("evidencias", { ...e, orden: n });
  return true;
}

/** Cuántas fotos tiene cada actividad: { actividadId: n }. */
export async function conteos() {
  const c = {};
  for (const e of await db.todos("evidencias")) c[e.actividadId] = (c[e.actividadId] || 0) + 1;
  return c;
}

/** Guarda una foto ya recortada y comprimida (ver camara.js) en la carpeta de la actividad. */
export async function agregar(actividad, yo, { blob, ancho, alto }, tomadaEn = Date.now()) {
  const id = db.uid();
  await db.guardarFoto(id, blob, "subir"); // primero la imagen: así nunca hay un registro sin imagen en este dispositivo
  return db.guardar("evidencias", {
    id, actividadId: actividad.id, ruta: `${id}.jpg`, leyenda: "",
    tomadaEn, tomadaPor: yo.id, tomadaPorNombre: yo.nombre,
    ancho, alto, bytes: blob.size,
  });
}

export async function cambiarLeyenda(id, leyenda) {
  const e = await db.uno("evidencias", id);
  if (e) await db.guardar("evidencias", { ...e, leyenda: leyenda.trim().slice(0, 140) });
}

/** Quita la foto de la carpeta, de este dispositivo y (al sincronizar) de la nube. */
export async function quitar(id) {
  await db.borrar("evidencias", id);
  await db.retirarFoto(id);
}

/* Las imágenes se muestran con direcciones temporales (blob:) que se liberan al cambiar de pantalla. */
const urls = new Map();
export function liberarUrls() {
  for (const u of urls.values()) URL.revokeObjectURL(u);
  urls.clear();
}
/** Dirección para mostrar la foto, o null si esta imagen aún no llega a este dispositivo. */
export async function urlDe(id) {
  if (urls.has(id)) return urls.get(id);
  const f = await db.fotoLocal(id);
  if (!f?.blob) return null;
  const u = URL.createObjectURL(f.blob);
  urls.set(id, u);
  return u;
}
