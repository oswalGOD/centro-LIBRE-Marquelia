// Sincronización entre dispositivos a través de Supabase.
//
// Cada dispositivo trabaja sin conexión con su base local. Cuando hay internet:
//   1. Envía los registros que cambiaron desde el último envío.
//   2. Recibe lo que otros dispositivos enviaron desde la última recepción.
// Si dos dispositivos cambiaron el mismo registro, gana el cambio más reciente.
// Si dos dispositivos dieron de alta a la misma usuaria (misma CURP), se fusionan
// en una sola y sus asistencias pasan a la que queda.

import * as db from "./db.js";
import { SUPABASE_URL, SUPABASE_ANON } from "./config.js";

const SINCRONIZADOS = ["perfiles", "usuarias", "actividades", "asistencias"];
const LOTE = 200;
const MARGEN_RECEPCION = 2 * 60 * 1000; // se vuelve a pedir un poco de atrás por si algo llegó tarde
const CADA = 5 * 60 * 1000;

/* ---------- Estado visible para la interfaz ---------- */
export const estado = { conectada: false, cuenta: "", enCurso: false, ultima: null, error: "", pendientes: 0, sinInternet: !navigator.onLine };
export const avisos = new EventTarget();
const publicar = () => avisos.dispatchEvent(new Event("estado"));

/** Lee la respuesta como JSON. Supabase contesta algunos envíos con el cuerpo vacío: eso da null. */
async function leerJson(r) {
  const texto = await r.text().catch(() => "");
  try { return texto ? JSON.parse(texto) : null; } catch { return null; }
}

/* ---------- Cuenta del Centro (Supabase Auth) ---------- */
async function pedirToken(cuerpo, tipo) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${tipo}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const j = (await leerJson(r)) || {};
  if (!r.ok) {
    if (r.status === 400 && tipo === "password") throw new Error("Correo o contraseña incorrectos.");
    throw new Error(j.error_description || j.msg || `El servidor respondió ${r.status}.`);
  }
  const nube = { cuenta: j.user?.email || cuerpo.email, acceso: j.access_token, renovar: j.refresh_token, expira: Date.now() + j.expires_in * 1000 };
  await db.escribirMeta("nube", nube);
  return nube;
}

export async function conectar(email, password) {
  if (!navigator.onLine) throw new Error("Este dispositivo no tiene internet en este momento.");
  await pedirToken({ email: email.trim(), password }, "password");
  await db.escribirMeta("ultimaRecepcion", null);
  await actualizarEstado();
}

export async function desconectar() {
  await db.escribirMeta("nube", null);
  await actualizarEstado();
}

async function token(forzar) {
  let nube = await db.leerMeta("nube");
  if (!nube) throw new Error("Este dispositivo no está conectado a la cuenta del Centro.");
  if (forzar || nube.expira - 60000 < Date.now()) {
    try {
      nube = await pedirToken({ refresh_token: nube.renovar }, "refresh_token");
    } catch (e) {
      if (navigator.onLine) await db.escribirMeta("nube", null);
      throw new Error("La sesión con la cuenta del Centro venció. Vuelve a conectar este dispositivo en Ajustes.");
    }
  }
  return nube.acceso;
}

async function api(ruta, opciones = {}, reintento = false) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${await token(reintento)}`, "Content-Type": "application/json", ...opciones.headers },
  });
  if (r.status === 401 && !reintento) return api(ruta, opciones, true);
  const j = await leerJson(r);
  if (!r.ok) {
    if (j?.code === "42P01" || r.status === 404) throw new Error("Falta crear la tabla en Supabase (supabase/esquema.sql).");
    throw new Error(j?.message || `El servidor respondió ${r.status}.`);
  }
  return j;
}

/* ---------- Envío ---------- */
async function porEnviar() {
  const desde = (await db.leerMeta("ultimoEnvio")) || 0;
  const lista = [];
  for (const a of SINCRONIZADOS) for (const r of await db.crudos(a)) if (r.actualizado > desde) lista.push([a, r]);
  return lista;
}

async function enviar() {
  const inicio = Date.now();
  const dispositivo = await db.idDispositivo();
  const lista = await porEnviar();
  for (let i = 0; i < lista.length; i += LOTE) {
    const filas = lista.slice(i, i + LOTE).map(([almacen, r]) => ({ almacen, id: r.id, datos: r, actualizado: r.actualizado, borrado: !!r.borrado, dispositivo }));
    await api("registros?on_conflict=almacen,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(filas) });
  }
  await db.escribirMeta("ultimoEnvio", inicio);
  return lista.length;
}

/* ---------- Recepción ---------- */
const pedirIdb = r => new Promise((ok, mal) => { r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
const fin = t => new Promise((ok, mal) => { t.oncomplete = ok; t.onerror = t.onabort = () => mal(t.error); });

/** Guarda un registro recibido si es más nuevo que el local. Devuelve true si hubo que fusionar usuarias. */
async function aplicar(almacen, remoto) {
  const d = await db.abrir();
  const t = d.transaction(["usuarias", "asistencias"].includes(almacen) ? ["usuarias", "asistencias"] : [almacen], "readwrite");
  const s = t.objectStore(almacen);
  const local = await pedirIdb(s.get(remoto.id));
  if (local && local.actualizado >= remoto.actualizado) { await fin(t); return false; }
  let fusion = false;
  const ahora = Date.now();

  if (almacen === "usuarias" && remoto.curp && !remoto.borrado) {
    const otra = await pedirIdb(s.index("curp").get(remoto.curp));
    if (otra && otra.id !== remoto.id) {
      // Misma CURP con dos ids: se queda el id menor en todos los dispositivos
      fusion = true;
      const [queda, sale] = otra.id < remoto.id ? [otra, remoto] : [remoto, otra];
      const fusionada = { ...sale, borrado: true, fusionadaEn: queda.id, actualizado: ahora };
      delete fusionada.curp;
      s.put(fusionada);
      if (queda === remoto) s.put(remoto);
      const asis = t.objectStore("asistencias");
      for (const x of await pedirIdb(asis.index("usuariaId").getAll(sale.id))) asis.put({ ...x, usuariaId: queda.id, actualizado: ahora });
      await fin(t);
      return fusion;
    }
  }

  if (almacen === "asistencias") {
    const p = await pedirIdb(t.objectStore("usuarias").get(remoto.usuariaId));
    if (p?.fusionadaEn) { remoto = { ...remoto, usuariaId: p.fusionadaEn, actualizado: ahora }; fusion = true; }
  }
  s.put(remoto);
  await fin(t);
  return fusion;
}

async function recibir() {
  const cursor = await db.leerMeta("ultimaRecepcion");
  const desde = cursor ? new Date(new Date(cursor).getTime() - MARGEN_RECEPCION).toISOString() : "1970-01-01T00:00:00Z";
  const yo = await db.idDispositivo();
  const letra = await db.leerMeta("codigoDispositivo", "A");
  let maximo = cursor, recibidos = 0, fusiones = 0, letraRepetida = false;
  for (let pagina = 0; ; pagina++) {
    const filas = await api(`registros?select=almacen,id,datos,dispositivo,recibido&recibido=gte.${encodeURIComponent(desde)}&order=recibido.asc,almacen.asc,id.asc&limit=${LOTE}&offset=${pagina * LOTE}`);
    for (const f of filas) {
      if (!SINCRONIZADOS.includes(f.almacen)) continue;
      if ((f.almacen === "usuarias" && "pin" in f.datos) || (f.almacen === "asistencias" && !f.datos.usuariaId)) continue; // nombres anteriores a la versión 0.5
      if (f.dispositivo !== yo) {
        if (await aplicar(f.almacen, f.datos)) fusiones++;
        recibidos++;
        if (f.almacen === "actividades" && new RegExp(`-${letra}\\d+$`).test(f.datos.folio || "")) letraRepetida = true;
      }
      if (!maximo || f.recibido > maximo) maximo = f.recibido;
    }
    if (filas.length < LOTE) break;
  }
  if (maximo) await db.escribirMeta("ultimaRecepcion", maximo);
  if (letraRepetida) await db.escribirMeta("avisoLetra", true);
  return { recibidos, fusiones };
}

/* ---------- Ciclo completo ---------- */
export async function actualizarEstado() {
  const nube = await db.leerMeta("nube");
  estado.conectada = !!nube;
  estado.cuenta = nube?.cuenta || "";
  estado.ultima = await db.leerMeta("ultimaSincronizacion");
  estado.pendientes = nube ? (await porEnviar()).length : 0;
  estado.sinInternet = !navigator.onLine;
  publicar();
}

let promesa = null;
/** Envía y recibe cambios. Devuelve cuántos registros llegaron de otros dispositivos. */
export function sincronizar() {
  promesa ??= (async () => {
    estado.enCurso = true;
    estado.error = "";
    publicar();
    try {
      if (!(await db.leerMeta("nube"))) return { recibidos: 0 };
      if (!navigator.onLine) throw new Error("Sin internet. Los cambios se enviarán cuando vuelva la conexión.");
      await enviar();
      const r = await recibir();
      if (r.fusiones) await enviar(); // las fusiones generan cambios que los demás deben recibir
      await db.escribirMeta("ultimaSincronizacion", Date.now());
      return r;
    } catch (e) {
      estado.error = e.message;
      throw e;
    } finally {
      estado.enCurso = false;
      promesa = null;
      await actualizarEstado();
    }
  })();
  return promesa;
}

/** Sincroniza al abrir, al volver la conexión, poco después de cada cambio y cada 5 minutos. */
export function iniciarAutomatica(alRecibir) {
  const intentar = () => sincronizar().then(r => r?.recibidos && alRecibir?.()).catch(() => {});
  let espera;
  db.cambios.addEventListener("cambio", () => {
    actualizarEstado();
    clearTimeout(espera);
    espera = setTimeout(intentar, 4000);
  });
  addEventListener("online", intentar);
  addEventListener("offline", actualizarEstado);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && intentar());
  setInterval(intentar, CADA);
  actualizarEstado().then(intentar);
}
