// Base de datos local (IndexedDB). Todo se guarda en el dispositivo y funciona sin internet.
// Cada registro lleva `actualizado` y los borrados son lógicos (`borrado: true`)
// para que la sincronización entre dispositivos pueda reconciliar cambios.

const NOMBRE = "centro-libre-marquelia";
const VERSION = 1;

let conexion;

export function abrir() {
  conexion ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(NOMBRE, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("usuarias", { keyPath: "id" });
      const personas = d.createObjectStore("personas", { keyPath: "id" });
      personas.createIndex("curp", "curp", { unique: true });
      const actividades = d.createObjectStore("actividades", { keyPath: "id" });
      actividades.createIndex("fecha", "fecha");
      const asistencias = d.createObjectStore("asistencias", { keyPath: "id" });
      asistencias.createIndex("actividadId", "actividadId");
      asistencias.createIndex("personaId", "personaId");
      d.createObjectStore("meta", { keyPath: "clave" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return conexion;
}

export const ALMACENES = ["usuarias", "personas", "actividades", "asistencias", "meta"];

const pedir = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const terminar = t => new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = t.onabort = () => reject(t.error); });

/** Avisa cuando cambia cualquier registro, para que la sincronización lo envíe. */
export const cambios = new EventTarget();
const avisarCambio = almacen => cambios.dispatchEvent(new CustomEvent("cambio", { detail: { almacen } }));

/** Claves de `meta` que pertenecen a este dispositivo y no viajan en respaldos. */
export const META_LOCAL = ["dispositivoId", "codigoDispositivo", "nube", "ultimoEnvio", "ultimaRecepcion", "ultimaSincronizacion", "avisoLetra", "ultimoRespaldo"];

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

/** Borrado lógico: el registro queda marcado para que otros dispositivos también lo eliminen. */
export async function borrar(almacen, id) {
  const t = (await abrir()).transaction(almacen, "readwrite");
  const s = t.objectStore(almacen);
  const x = await pedir(s.get(id));
  if (x) {
    x.borrado = true;
    x.actualizado = Date.now();
    if (almacen === "personas") delete x.curp; // libera la CURP para un registro nuevo
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

/** Folio consecutivo por año y dispositivo, p. ej. MAR-2026-A001. Se asigna dentro de una transacción. */
export async function siguienteFolio(fecha) {
  const anio = (fecha || new Date().toISOString()).slice(0, 4);
  const prefijo = await leerMeta("prefijoFolio", "MAR");
  const letra = await leerMeta("codigoDispositivo", "A");
  const t = (await abrir()).transaction("meta", "readwrite");
  const s = t.objectStore("meta");
  const clave = `folio-${anio}-${letra}`;
  const actual = (await pedir(s.get(clave)))?.valor || 0;
  s.put({ clave, valor: actual + 1, actualizado: Date.now() });
  await terminar(t);
  return `${prefijo}-${anio}-${letra}${String(actual + 1).padStart(3, "0")}`;
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
  const d = await abrir();
  const locales = (await pedir(d.transaction("meta").objectStore("meta").getAll())).filter(m => META_LOCAL.includes(m.clave));
  const t = d.transaction(ALMACENES, "readwrite");
  for (const a of ALMACENES) {
    const s = t.objectStore(a);
    s.clear();
    for (const r of respaldo.datos[a] || []) if (a !== "meta" || !META_LOCAL.includes(r.clave)) s.put(r);
  }
  for (const m of locales) t.objectStore("meta").put(m);
  // Lo restaurado se envía completo en la próxima sincronización
  t.objectStore("meta").put({ clave: "ultimoEnvio", valor: 0, actualizado: Date.now() });
  await terminar(t);
  avisarCambio("todos");
}

export async function idDispositivo() {
  let id = await leerMeta("dispositivoId");
  if (!id) await escribirMeta("dispositivoId", (id = uid()));
  return id;
}
