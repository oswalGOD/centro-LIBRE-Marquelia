// Base de datos local (IndexedDB). Todo se guarda en el dispositivo y funciona sin internet.
// Cada registro lleva `actualizado` y los borrados son lógicos (`borrado: true`)
// para que la sincronización entre dispositivos pueda reconciliar cambios.

import { prefijoFolio } from "./catalogos.js";

const NOMBRE = "centro-libre-marquelia";
const VERSION = 3;

let conexion;

function crearAlmacenUsuarias(d) {
  d.createObjectStore("usuarias", { keyPath: "id" }).createIndex("curp", "curp", { unique: true });
}

/**
 * Versión 1 a 2: lo que se llamaba «usuarias» (integrantes del Centro) pasa a «perfiles»,
 * «personas» pasa a «usuarias» y en las asistencias `personaId` pasa a `usuariaId`.
 */
export function convertirV1(datos) {
  const { usuarias = [], personas = [], asistencias = [], ...resto } = datos;
  return {
    ...resto,
    perfiles: usuarias,
    usuarias: personas,
    asistencias: asistencias.map(({ personaId, ...x }) => ({ ...x, usuariaId: x.usuariaId ?? personaId })),
  };
}

/** Versión 3: índice por fecha de cambio, para que la sincronización lea solo lo que cambió y no toda la base. */
const CON_INDICE_CAMBIO = ["perfiles", "usuarias", "actividades", "asistencias"];
function agregarIndiceCambio(t) {
  for (const a of CON_INDICE_CAMBIO) {
    const s = t.objectStore(a);
    if (!s.indexNames.contains("actualizado")) s.createIndex("actualizado", "actualizado");
  }
}

function migrarV1(d, t, despues) {
  const leer = nombre => new Promise(ok => { t.objectStore(nombre).getAll().onsuccess = e => ok(e.target.result); });
  Promise.all(["usuarias", "personas", "asistencias"].map(leer)).then(([usuarias, personas, asistencias]) => {
    const nuevo = convertirV1({ usuarias, personas, asistencias });
    d.deleteObjectStore("usuarias");
    d.deleteObjectStore("personas");
    d.createObjectStore("perfiles", { keyPath: "id" });
    crearAlmacenUsuarias(d);
    const asis = t.objectStore("asistencias");
    asis.deleteIndex("personaId");
    asis.createIndex("usuariaId", "usuariaId");
    for (const a of ["perfiles", "usuarias", "asistencias"]) for (const r of nuevo[a]) t.objectStore(a).put(r);
    // Todo se vuelve a enviar y recibir con los nombres nuevos
    const meta = t.objectStore("meta");
    meta.put({ clave: "ultimoEnvio", valor: 0, actualizado: Date.now() });
    meta.delete("ultimaRecepcion");
    despues();
  });
}

export function abrir() {
  conexion ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = e => {
      const d = r.result, t = r.transaction;
      if (e.oldVersion === 1) return migrarV1(d, t, () => agregarIndiceCambio(t));
      if (e.oldVersion === 2) return agregarIndiceCambio(t);
      d.createObjectStore("perfiles", { keyPath: "id" });
      crearAlmacenUsuarias(d);
      const actividades = d.createObjectStore("actividades", { keyPath: "id" });
      actividades.createIndex("fecha", "fecha");
      const asistencias = d.createObjectStore("asistencias", { keyPath: "id" });
      asistencias.createIndex("actividadId", "actividadId");
      asistencias.createIndex("usuariaId", "usuariaId");
      d.createObjectStore("meta", { keyPath: "clave" });
      agregarIndiceCambio(t);
    };
    r.onsuccess = () => renombrarMeta(r.result).then(() => resolve(r.result), reject);
    r.onerror = () => reject(r.error);
  });
  return conexion;
}

// Claves de `meta` que cambiaron de nombre en la versión 0.9.1 (la «letra del dispositivo» pasó a ser el «ID de dispositivo»)
const RENOMBRES = [["codigoDispositivo", "idDispositivo"], ["dispositivoId", "uuidDispositivo"], ["avisoLetra", "avisoIdRepetido"]];
function renombrarMeta(d) {
  const t = d.transaction("meta", "readwrite");
  const s = t.objectStore("meta");
  for (const [vieja, nueva] of RENOMBRES) {
    const r = s.get(vieja);
    r.onsuccess = () => {
      if (!r.result) return;
      s.put({ ...r.result, clave: nueva });
      s.delete(vieja);
    };
  }
  return terminar(t);
}

/** Borra la base de datos completa de este dispositivo (Desarrollo → Restablecer). */
export async function eliminarTodo() {
  if (conexion) (await conexion).close();
  conexion = null;
  await new Promise((ok, mal) => {
    const r = indexedDB.deleteDatabase(NOMBRE);
    r.onsuccess = ok;
    r.onerror = () => mal(r.error);
    r.onblocked = ok; // otra pestaña la tiene abierta: se borra en cuanto la cierre
  });
}

export const ALMACENES = ["perfiles", "usuarias", "actividades", "asistencias", "meta"];

const pedir = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const terminar = t => new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = t.onabort = () => reject(t.error); });

/** Avisa cuando cambia cualquier registro, para que la sincronización lo envíe. */
export const cambios = new EventTarget();
const avisarCambio = almacen => cambios.dispatchEvent(new CustomEvent("cambio", { detail: { almacen } }));

/** Claves de `meta` que pertenecen a este dispositivo y no viajan en respaldos. */
export const META_LOCAL = ["uuidDispositivo", "configuradoEn", "idDispositivo", "nube", "ultimoEnvio", "ultimaRecepcion", "ultimaSincronizacion", "avisoIdRepetido", "ultimoRespaldo", "desfaseReloj"];

/**
 * Revisa que un registro que llega de la nube o de un respaldo tenga lo mínimo para que la app no falle al mostrarlo.
 * Los borrados solo necesitan su id.
 */
export function registroValido(almacen, r) {
  if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id || typeof r.actualizado !== "number") return false;
  if (r.borrado) return true;
  const texto = v => typeof v === "string";
  switch (almacen) {
    case "perfiles": return texto(r.nombre) && texto(r.rol) && texto(r.sal) && texto(r.pin);
    case "usuarias": return texto(r.nombre);
    case "actividades": return texto(r.nombre) && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha) && texto(r.folio);
    case "asistencias": return texto(r.actividadId) && texto(r.usuariaId) && !!r.datos && typeof r.datos === "object" && (!r.firma || /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.firma));
    default: return true;
  }
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

/** Todos los registros vigentes (sin borrados) de un almacén, opcionalmente filtrados por índice. */
export async function todos(almacen, indice, valor) {
  const s = (await abrir()).transaction(almacen).objectStore(almacen);
  const lista = await pedir(indice ? s.index(indice).getAll(valor) : s.getAll());
  return lista.filter(x => !x.borrado);
}

export async function uno(almacen, id) {
  const x = await pedir((await abrir()).transaction(almacen).objectStore(almacen).get(id));
  return x && !x.borrado ? x : null;
}

export async function porIndice(almacen, indice, valor) {
  const x = await pedir((await abrir()).transaction(almacen).objectStore(almacen).index(indice).get(valor));
  return x && !x.borrado ? x : null;
}

export async function guardar(almacen, registro) {
  const t = (await abrir()).transaction(almacen, "readwrite");
  registro.actualizado = Date.now();
  registro.creado ??= registro.actualizado;
  t.objectStore(almacen).put(registro);
  await terminar(t);
  avisarCambio(almacen);
  return registro;
}

/** Todos los registros, incluidos los borrados (para sincronizar y respaldar). */
export async function crudos(almacen) {
  return pedir((await abrir()).transaction(almacen).objectStore(almacen).getAll());
}

/** Registros (incluidos los borrados) cambiados después de `desde` (ms), usando el índice por fecha de cambio. */
export async function cambiadosDesde(almacen, desde) {
  const s = (await abrir()).transaction(almacen).objectStore(almacen);
  return pedir(desde ? s.index("actualizado").getAll(IDBKeyRange.lowerBound(desde, true)) : s.getAll());
}

/** Borrado lógico: el registro queda marcado para que otros dispositivos también lo eliminen. */
export async function borrar(almacen, id) {
  const t = (await abrir()).transaction(almacen, "readwrite");
  const s = t.objectStore(almacen);
  const x = await pedir(s.get(id));
  if (x) {
    x.borrado = true;
    x.actualizado = Date.now();
    if (almacen === "usuarias") delete x.curp; // libera la CURP para un registro nuevo
    s.put(x);
  }
  await terminar(t);
  avisarCambio(almacen);
}

export async function leerMeta(clave, porDefecto = null) {
  const x = await pedir((await abrir()).transaction("meta").objectStore("meta").get(clave));
  return x ? x.valor : porDefecto;
}

export async function escribirMeta(clave, valor) {
  const t = (await abrir()).transaction("meta", "readwrite");
  t.objectStore("meta").put({ clave, valor, actualizado: Date.now() });
  await terminar(t);
}

/** Folio consecutivo por mes y por ID de dispositivo, p. ej. OCT-2026-A001, según la fecha de la actividad. Se asigna dentro de una transacción. */
export async function siguienteFolio(fecha) {
  const f = fecha || new Date().toISOString().slice(0, 10);
  const prefijo = prefijoFolio(f);
  const id = await leerMeta("idDispositivo", "A");
  // El contador vive solo en este dispositivo: tras restablecerlo o reinstalarlo empezaría de nuevo en 001.
  // Por eso también se toma en cuenta el folio más alto que ya existe con el mismo prefijo e ID.
  const patron = new RegExp(`^${prefijo}-${id}(\\d+)$`);
  const existentes = (await crudos("actividades")).reduce((m, a) => Math.max(m, Number(patron.exec(a.folio || "")?.[1] || 0)), 0);
  const t = (await abrir()).transaction("meta", "readwrite");
  const s = t.objectStore("meta");
  const clave = `folio-${f.slice(0, 7)}-${id}`;
  const actual = Math.max((await pedir(s.get(clave)))?.valor || 0, existentes);
  s.put({ clave, valor: actual + 1, actualizado: Date.now() });
  await terminar(t);
  return `${prefijo}-${id}${String(actual + 1).padStart(3, "0")}`;
}

/** Copia completa de la base de datos, incluidos los borrados, para respaldos. */
export async function exportar() {
  const d = await abrir();
  const datos = {};
  for (const a of ALMACENES) datos[a] = await pedir(d.transaction(a).objectStore(a).getAll());
  datos.meta = datos.meta.filter(m => !META_LOCAL.includes(m.clave));
  return { app: NOMBRE, version: VERSION, exportado: new Date().toISOString(), datos };
}

/** Reemplaza todo el contenido con un respaldo. Conserva los ajustes propios de este dispositivo. */
export async function importar(respaldo) {
  if (respaldo?.app !== NOMBRE || !respaldo.datos) throw new Error("El archivo no es un respaldo de esta app.");
  if ((respaldo.version || 1) < 2) respaldo = { ...respaldo, datos: convertirV1(respaldo.datos) };
  const d = await abrir();
  const locales = (await pedir(d.transaction("meta").objectStore("meta").getAll())).filter(m => META_LOCAL.includes(m.clave));
  const t = d.transaction(ALMACENES, "readwrite");
  for (const a of ALMACENES) {
    const s = t.objectStore(a);
    s.clear();
    for (const r of respaldo.datos[a] || []) {
      if (a === "meta" ? META_LOCAL.includes(r?.clave) : !registroValido(a, r)) continue;
      s.put(r);
    }
  }
  for (const m of locales) t.objectStore("meta").put(m);
  // Lo restaurado se envía completo en la próxima sincronización, y se vuelve a recibir todo de la nube
  // para recuperar lo que sea más nuevo que el respaldo (si no, este dispositivo quedaría desfasado).
  t.objectStore("meta").put({ clave: "ultimoEnvio", valor: 0, actualizado: Date.now() });
  t.objectStore("meta").delete("ultimaRecepcion");
  await terminar(t);
  avisarCambio("todos");
}

/** Identificador interno y único de este dispositivo (UUID); distinto del ID de dispositivo que va en los folios. */
export async function uuidDispositivo() {
  let id = await leerMeta("uuidDispositivo");
  if (!id) {
    await escribirMeta("uuidDispositivo", (id = uid()));
    await escribirMeta("configuradoEn", Date.now());
  }
  return id;
}
