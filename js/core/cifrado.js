// Cifrado de respaldos con contraseña (AES-GCM de 256 bits; la clave sale de la contraseña con PBKDF2).
// Todo ocurre en el dispositivo con la criptografía del navegador. Sin la contraseña el archivo no se puede abrir.

const ITERACIONES = 310000;
const APP = "centro-libre-marquelia";

const aBase64 = bytes => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const deBase64 = b64 => Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));

async function clave(contrasena, sal, iteraciones) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(contrasena), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: iteraciones, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export const estaCifrado = x => x?.app === APP && x.cifrado === "AES-GCM";

/** Devuelve el objeto que se guarda en el archivo .json del respaldo. */
export async function cifrar(texto, contrasena) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const datos = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await clave(contrasena, sal, ITERACIONES), new TextEncoder().encode(texto));
  return { app: APP, cifrado: "AES-GCM", kdf: "PBKDF2-SHA256", iteraciones: ITERACIONES, sal: aBase64(sal), iv: aBase64(iv), datos: aBase64(new Uint8Array(datos)) };
}

/** Devuelve el texto original. Falla con un mensaje claro si la contraseña no es la correcta. */
export async function descifrar(sobre, contrasena) {
  try {
    const k = await clave(contrasena, deBase64(sobre.sal), sobre.iteraciones);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deBase64(sobre.iv) }, k, deBase64(sobre.datos)));
  } catch {
    throw new Error("La contraseña del respaldo no es correcta.");
  }
}
