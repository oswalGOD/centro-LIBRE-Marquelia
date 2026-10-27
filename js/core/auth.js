// Perfiles y sesión. Cada perfil entra con su nombre y un PIN de 4 a 6 dígitos.
// El PIN se guarda derivado con PBKDF2, nunca en texto plano.

import * as db from "./db.js";

const CLAVE_SESION = "clm-sesion";
const DURACION_SESION = 12 * 60 * 60 * 1000; // máximo 12 horas seguidas
export const INACTIVIDAD = 30 * 60 * 1000; // se pide el PIN otra vez tras 30 minutos sin usarla
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

export async function cambiarPin(perfil, pin) {
  perfil.sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  perfil.pin = await derivarPin(pin, perfil.sal);
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
export function tocarSesion() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION));
    if (s && Date.now() - s.ultimo > 15000) localStorage.setItem(CLAVE_SESION, JSON.stringify({ ...s, ultimo: Date.now() }));
  } catch (e) {}
}

export function sesionVigente() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION));
    return !!s && s.expira > Date.now() && Date.now() - (s.ultimo || 0) < INACTIVIDAD;
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
