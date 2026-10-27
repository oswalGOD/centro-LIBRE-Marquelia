// Perfiles y sesión. Cada perfil entra con su nombre y un PIN de 4 a 6 dígitos.
// El PIN se guarda derivado con PBKDF2, nunca en texto plano.

import * as db from "./db.js";

const CLAVE_SESION = "clm-sesion";
const DURACION_SESION = 12 * 60 * 60 * 1000; // 12 horas

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

export async function derivarPin(pin, sal) {
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(sal), iterations: 120000, hash: "SHA-256" }, clave, 256);
  return hex(bits);
}

export const pinValido = pin => /^\d{4,6}$/.test(pin);

export async function crearPerfil({ nombre, rol, pin }) {
  const sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  return db.guardar("usuarias", { id: db.uid(), nombre: nombre.trim(), rol, sal, pin: await derivarPin(pin, sal), activa: true });
}

export async function cambiarPin(perfil, pin) {
  perfil.sal = hex(crypto.getRandomValues(new Uint8Array(16)));
  perfil.pin = await derivarPin(pin, perfil.sal);
  return db.guardar("usuarias", perfil);
}

export async function verificarPin(perfil, pin) {
  return (await derivarPin(pin, perfil.sal)) === perfil.pin;
}

export function iniciarSesion(perfil) {
  try { localStorage.setItem(CLAVE_SESION, JSON.stringify({ id: perfil.id, expira: Date.now() + DURACION_SESION })); } catch (e) {}
}

export function cerrarSesion() {
  try { localStorage.removeItem(CLAVE_SESION); } catch (e) {}
}

/** Perfil con sesión vigente, o null. */
export async function sesionActual() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(CLAVE_SESION)); } catch (e) {}
  if (!s || s.expira < Date.now()) return null;
  const u = await db.uno("usuarias", s.id);
  return u && u.activa ? u : null;
}

export const esCoordinadora = u => u?.rol === "Coordinadora";
