// Perfiles y sesión. Cada perfil entra con su nombre y un PIN de 4 a 6 dígitos.
// El PIN se guarda derivado con PBKDF2, nunca en texto plano.

import * as db from "./db.js";
import * as expedientes from "./expedientes.js";

const CLAVE_SESION = "clm-sesion";
const DURACION_SESION = 12 * 60 * 60 * 1000; // máximo 12 horas seguidas
const CLAVE_INACTIVIDAD = "clm-inactividad";
export const OPCIONES_INACTIVIDAD = [5, 10, 15, 30, 60]; // minutos
export const INACTIVIDAD_PREDETERMINADA = 15;
export const AVISO_PREVIO = 60 * 1000; // se avisa un minuto antes de cerrar

/** Minutos sin usar la app tras los cuales se pide el PIN otra vez (ajuste propio de cada dispositivo). */
export function minutosInactividad() {
  try {
    const m = Number(localStorage.getItem(CLAVE_INACTIVIDAD));
    return OPCIONES_INACTIVIDAD.includes(m) ? m : INACTIVIDAD_PREDETERMINADA;
  } catch (e) { return INACTIVIDAD_PREDETERMINADA; }
}
export function fijarMinutosInactividad(m) {
  if (!OPCIONES_INACTIVIDAD.includes(m)) return;
  try { localStorage.setItem(CLAVE_INACTIVIDAD, String(m)); } catch (e) {}
}
const inactividadMs = () => minutosInactividad() * 60 * 1000;
const CLAVE_INTENTOS = "clm-intentos";

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

export async function derivarPin(pin, sal) {
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(sal), iterations: 120000, hash: "SHA-256" }, clave, 256);
  return hex(bits);
}

export const pinValido = pin => /^\d{4,6}$/.test(pin);

export async function crearPerfil({ nombre, rol, pin }) {
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  return db.guardar("perfiles", { id: db.uid(), nombre: nombre.trim(), rol, sal, pin: await derivarPin(pin, sal), activa: true });
}

/**
 * Cambia el PIN. Si el perfil tiene expedientes cifrados, sus claves se vuelven a proteger con el PIN nuevo;
 * si eso no es posible lanza un error con `codigo: "BLOQUEADOS"` sin cambiar nada (ver expedientes.reenvolver).
 */
export async function cambiarPin(perfil, pin, { forzar = false } = {}) {
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  const nuevo = { ...perfil };
  await expedientes.reenvolver(nuevo, pin, sal, forzar);
  nuevo.sal = sal;
  nuevo.pin = await derivarPin(pin, sal);
  Object.assign(perfil, nuevo);
  return db.guardar("perfiles", perfil);
}

export async function verificarPin(perfil, pin) {
  return (await derivarPin(pin, perfil.sal)) === perfil.pin;
}

export function iniciarSesion(perfil) {
  const ahora = Date.now();
  try { localStorage.setItem(CLAVE_SESION, JSON.stringify({ id: perfil.id, expira: ahora + DURACION_SESION, ultimo: ahora })); } catch (e) {}
}

/** Marca actividad para que la sesión no se cierre mientras se usa la app. */
export function tocarSesion(forzar = false) {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION));
    if (s && (forzar || Date.now() - s.ultimo > 15000)) localStorage.setItem(CLAVE_SESION, JSON.stringify({ ...s, ultimo: Date.now() }));
  } catch (e) {}
}

/** Milisegundos que faltan para cerrar la sesión por inactividad (0 si ya no hay sesión). */
export function restoInactividad() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION));
    if (!s) return 0;
    return Math.max(0, Math.min(s.expira - Date.now(), (s.ultimo || 0) + inactividadMs() - Date.now()));
  } catch (e) { return 0; }
}

export function sesionVigente() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION));
    return !!s && s.expira > Date.now() && Date.now() - (s.ultimo || 0) < inactividadMs();
  } catch (e) { return false; }
}

export function cerrarSesion() {
  try { localStorage.removeItem(CLAVE_SESION); } catch (e) {}
}

/** Perfil con sesión vigente, o null. */
export async function sesionActual() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(CLAVE_SESION)); } catch (e) {}
  if (!sesionVigente()) return cerrarSesion(), null;
  const u = await db.uno("perfiles", s.id);
  return u && u.activa ? u : null;
}

/* Intentos de PIN fallidos en este dispositivo. Cada 5 fallos se bloquea un rato,
   y el bloqueo se duplica cada vez (30 s, 1 min, 2 min… hasta 15 min). Sobrevive a recargar. */
function leerIntentos() {
  try { return JSON.parse(localStorage.getItem(CLAVE_INTENTOS)) || { fallos: 0, nivel: 0, hasta: 0 }; } catch (e) { return { fallos: 0, nivel: 0, hasta: 0 }; }
}
const guardarIntentos = x => { try { localStorage.setItem(CLAVE_INTENTOS, JSON.stringify(x)); } catch (e) {} };

/** Milisegundos que faltan para poder intentar de nuevo (0 si no hay bloqueo). */
export const esperaPin = () => Math.max(0, leerIntentos().hasta - Date.now());

export function pinFallido() {
  const x = leerIntentos();
  x.fallos++;
  if (x.fallos >= 5) {
    x.hasta = Date.now() + Math.min(30000 * 2 ** x.nivel, 15 * 60 * 1000);
    x.nivel++;
    x.fallos = 0;
  }
  guardarIntentos(x);
}

export const pinCorrecto = () => guardarIntentos({ fallos: 0, nivel: 0, hasta: 0 });

export const esCoordinadora = u => u?.rol === "Coordinadora";
