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
import { anotar } from "./bitacora.js";

const SINCRONIZADOS = ["perfiles", "usuarias", "actividades", "asistencias"];
const LOTE = 200;
const MARGEN_RECEPCION = 2 * 60 * 1000; // se vuelve a pedir un poco de atrás por si algo llegó tarde
const CADA = 5 * 60 * 1000;

/* ---------- Estado visible para la interfaz ---------- */
export const estado = { conectada: false, cuenta: "", enCurso: false, ultima: null, error: "", pendientes: 0, sinInternet: !navigator.onLine, desfase: 0 };

/* ---------- Reloj del dispositivo ----------
   «Gana el cambio más reciente» usa la hora de cada dispositivo. Si un equipo tiene la fecha mal
   (p. ej. tras agotarse la pila), sus cambios ganan o pierden siempre. Cada vez que Supabase entrega
   un token se compara la hora del servidor (campo iat) con la del dispositivo. */
export const DESFASE_TOLERADO = 5 * 60 * 1000;
/** Aviso para la persona si el reloj está desfasado, o "" si está bien. */
export function avisoReloj(desfase = estado.desfase) {
  if (Math.abs(desfase) < DESFASE_TOLERADO) return "";
  const min = Math.round(Math.abs(desfase) / 60000);
  const cuanto = min >= 2880 ? `${Math.round(min / 1440)} días` : min >= 120 ? `${Math.round(min / 60)} horas` : `${min} minutos`;
  return `La fecha u hora de este dispositivo va ${desfase > 0 ? "adelantada" : "atrasada"} unos ${cuanto}. Corrígela en la configuración del equipo (fecha y hora automáticas): si no, al sincronizar se pueden quedar datos viejos.`;
}
function horaDelServidor(token) {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(b64 + "===".slice((b64.length + 3) % 4))).iat * 1000 || null;
  } catch { return null; }
}
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
    throw Object.assign(new Error(j.error_description || j.msg || `El servidor respondió ${r.status}.`), { status: r.status });
  }
  const nube = { cuenta: j.user?.email || cuerpo.email, acceso: j.access_token, renovar: j.refresh_token, expira: Date.now() + j.expires_in * 1000 };
  const servidor = horaDelServidor(j.access_token);
  if (servidor) await db.escribirMeta("desfaseReloj", Date.now() - servidor); // positivo: el dispositivo va adelantado
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
  // Cierra también la sesión en Supabase para que el token guardado deje de servir (si no hay internet, solo se olvida aquí)
  const nube = await db.leerMeta("nube");
  if (nube?.acceso && navigator.onLine) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${nube.acceso}` } }).catch(() => {});
  }
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
      // Solo se olvida la sesión si Supabase dice que ya no sirve. Una falla de red o del servidor
      // (señal débil, Wi-Fi con página de acceso) no desconecta el dispositivo: se reintenta después.
      if (e.status === 400 || e.status === 401) {
        await db.escribirMeta("nube", null);
        throw new Error("La sesión con la cuenta del Centro venció. Vuelve a conectar este dispositivo en Ajustes.");
      }
      throw new Error("No se pudo conectar con la cuenta del Centro. Se volverá a intentar.");
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
// Lo que llegó de otro dispositivo se guarda con `_recibido` igual a su `actualizado`: así no se vuelve
// a enviar (y no aparece como «por enviar»). Si aquí se cambia, `actualizado` cambia y sí se envía.
// Con ultimoEnvio en 0 («Volver a enviar todo» o tras restaurar un respaldo) se envía todo.
async function porEnviar() {
  const desde = (await db.leerMeta("ultimoEnvio")) || 0;
  const lista = [];
  for (const a of SINCRONIZADOS) for (const r of await db.cambiadosDesde(a, desde)) if (r.actualizado > desde && (!desde || r._recibido !== r.actualizado)) lista.push([a, r]);
  return lista;
}

async function enviar() {
  const inicio = Date.now();
  const dispositivo = await db.uuidDispositivo();
  const lista = await porEnviar();
  for (let i = 0; i < lista.length; i += LOTE) {
    const filas = lista.slice(i, i + LOTE).map(([almacen, { _recibido, ...r }]) => ({ almacen, id: r.id, datos: r, actualizado: r.actualizado, borrado: !!r.borrado, dispositivo }));
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
  remoto = { ...remoto, _recibido: remoto.actualizado };
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
      const { _recibido, ...resto } = sale;
      const fusionada = { ...resto, borrado: true, fusionadaEn: queda.id, actualizado: ahora };
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
    if (p?.fusionadaEn) { const { _recibido, ...resto } = remoto; remoto = { ...resto, usuariaId: p.fusionadaEn, actualizado: ahora }; fusion = true; }
  }
  s.put(remoto);
  await fin(t);
  return fusion;
}

async function recibir() {
  const cursor = await db.leerMeta("ultimaRecepcion");
  const desde = cursor ? new Date(new Date(cursor).getTime() - MARGEN_RECEPCION).toISOString() : "1970-01-01T00:00:00Z";
  const yo = await db.uuidDispositivo();
  const idDisp = await db.leerMeta("idDispositivo", "A");
  // Actividades creadas antes de configurar este dispositivo (p. ej. las suyas de antes de restablecerlo) no cuentan como ID repetido
  const configurado = (await db.leerMeta("configuradoEn")) || 0;
  let maximo = cursor, recibidos = 0, fusiones = 0, idRepetido = false;
  for (let pagina = 0; ; pagina++) {
    const filas = await api(`registros?select=almacen,id,datos,dispositivo,recibido&recibido=gte.${encodeURIComponent(desde)}&order=recibido.asc,almacen.asc,id.asc&limit=${LOTE}&offset=${pagina * LOTE}`);
    for (const f of filas) {
      if (!SINCRONIZADOS.includes(f.almacen)) continue;
      if ((f.almacen === "usuarias" && "pin" in f.datos) || (f.almacen === "asistencias" && !f.datos.usuariaId)) continue; // nombres anteriores a la versión 0.5
      if (f.dispositivo !== yo && !db.registroValido(f.almacen, f.datos)) {
        anotar(`Registro inválido ignorado (${f.almacen} ${String(f.id).slice(0, 8)})`, "sincronización");
      } else if (f.dispositivo !== yo) {
        if (await aplicar(f.almacen, f.datos)) fusiones++;
        recibidos++;
        if (f.almacen === "actividades" && (f.datos.creado || 0) > configurado && new RegExp(`-${idDisp}\\d+$`).test(f.datos.folio || "")) idRepetido = true;
      }
      if (!maximo || f.recibido > maximo) maximo = f.recibido;
    }
    if (filas.length < LOTE) break;
  }
  if (maximo) await db.escribirMeta("ultimaRecepcion", maximo);
  if (idRepetido) await db.escribirMeta("avisoIdRepetido", true);
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
  estado.desfase = nube ? (await db.leerMeta("desfaseReloj")) || 0 : 0;
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
      if (navigator.onLine) anotar(e.message, "sincronización");
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
