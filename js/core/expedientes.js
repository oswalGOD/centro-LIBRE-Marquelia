// Cifrado de los expedientes de casos confidenciales.
//
// Todos los dispositivos comparten una sola cuenta de Supabase, así que el servidor no puede separar la
// información de cada perfil. La privacidad se logra cifrando en el dispositivo:
//   - Cada perfil con casos (Asesora Psicoemocional, Asesora Jurídica) tiene una clave AES-256 propia («clave de casos»).
//   - Esa clave se guarda en su perfil protegida con una clave derivada de su PIN (PBKDF2 con otra sal que
//     la de la huella del PIN, para que la huella sincronizada no sirva para abrirla).
//   - La Coordinadora tiene un par de claves RSA-OAEP: su clave privada se guarda protegida con su PIN y su
//     clave pública la usan los demás perfiles para dejar una copia de su clave de casos, de modo que ella
//     pueda leer todos los expedientes (solo lectura).
//   - Las claves abiertas viven únicamente en memoria: se borran al salir, al expirar la sesión o al recargar.
// El contenido (asunto, estatus, fechas de seguimiento y notas) viaja y se respalda siempre cifrado (AES-GCM).

import * as db from "./db.js";
import * as nube from "./sync.js";

const ITERACIONES = 120000;
const ROLES_CON_CASOS = ["Psicóloga", "Abogada"];
export const rolConCasos = p => ROLES_CON_CASOS.includes(p?.rol);
const esCoord = p => p?.rol === "Coordinadora";

const aB64 = buf => {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const deB64 = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
const aleatorio = n => crypto.getRandomValues(new Uint8Array(n));
const texto = new TextEncoder();

/** Claves abiertas de esta sesión: perfilId → { clave, kid, soloLectura }. */
const llaves = new Map();
/** Clave privada de la Coordinadora con sesión, o null. */
let par = null;

export function bloquear() {
  llaves.clear();
  par = null;
}

/** ¿Ya están abiertos los expedientes de este perfil en esta sesión? */
export function desbloqueado(perfil) {
  if (esCoord(perfil)) return par?.id === perfil.id;
  return rolConCasos(perfil) && llaves.has(perfil.id);
}

/** ¿Se pueden leer los registros de este perfil con las claves abiertas? */
export const puedeLeer = perfilId => llaves.has(perfilId);

async function clavePin(pin, sal) {
  const base = await crypto.subtle.importKey("raw", texto.encode(pin), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: texto.encode(`casos|${sal}`), iterations: ITERACIONES, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
}

const huellaPublica = async jwk => hex((await crypto.subtle.digest("SHA-256", texto.encode(jwk.n))).slice(0, 8));
const importarPublica = jwk => crypto.subtle.importKey("jwk", jwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["wrapKey"]);

/* ---------- Coordinadora: par de claves ---------- */
async function abrirPar(perfil, kPin) {
  if (perfil.casosPar) {
    const priv = await crypto.subtle.unwrapKey("pkcs8", deB64(perfil.casosPar.priv), kPin, { name: "AES-GCM", iv: deB64(perfil.casosPar.iv) }, { name: "RSA-OAEP", hash: "SHA-256" }, true, ["unwrapKey"]);
    par = { id: perfil.id, priv };
    return;
  }
  const p = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["wrapKey", "unwrapKey"]);
  const pub = await crypto.subtle.exportKey("jwk", p.publicKey);
  const iv = aleatorio(12);
  const privEnv = await crypto.subtle.wrapKey("pkcs8", p.privateKey, kPin, { name: "AES-GCM", iv });
  await db.guardar("perfiles", { ...perfil, casosPar: { pub: { kty: pub.kty, n: pub.n, e: pub.e, alg: pub.alg }, huella: await huellaPublica(pub), iv: aB64(iv), priv: aB64(privEnv) } });
  par = { id: perfil.id, priv: p.privateKey };
}

/** La Coordinadora abre la copia de la clave de casos que cada perfil dejó para ella. */
async function abrirCopiasDeCoordinadora(perfil) {
  for (const otro of await db.todos("perfiles")) {
    const copia = otro.casosCoord?.[perfil.id];
    if (!copia || !otro.casos || copia.kid !== otro.casos.kid || llaves.has(otro.id)) continue;
    try {
      const clave = await crypto.subtle.unwrapKey("raw", deB64(copia.datos), par.priv, { name: "RSA-OAEP" }, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
      llaves.set(otro.id, { clave, kid: otro.casos.kid, soloLectura: true });
    } catch { /* copia dañada: ese expediente no se podrá abrir */ }
  }
}

/* ---------- Perfiles con casos: clave de casos ---------- */
async function copiasParaCoordinadoras(perfil, clave, kid) {
  const copias = {};
  for (const c of (await db.todos("perfiles")).filter(p => esCoord(p) && p.activa && p.casosPar)) {
    const previa = perfil.casosCoord?.[c.id];
    if (previa && previa.kid === kid && previa.huella === c.casosPar.huella) { copias[c.id] = previa; continue; }
    const env = await crypto.subtle.wrapKey("raw", clave, await importarPublica(c.casosPar.pub), { name: "RSA-OAEP" });
    copias[c.id] = { kid, huella: c.casosPar.huella, datos: aB64(env) };
  }
  return copias;
}

async function abrirClaveDeCasos(perfil, kPin) {
  let actual = perfil;
  let clave, kid;
  if (actual.casos) {
    clave = await crypto.subtle.unwrapKey("raw", deB64(actual.casos.datos), kPin, { name: "AES-GCM", iv: deB64(actual.casos.iv) }, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    kid = actual.casos.kid;
  } else {
    // Antes de crear la clave se intenta recibir lo que haya en la nube: si otro dispositivo ya la creó, se usa esa
    // (dos claves distintas dejarían notas ilegibles).
    if (nube.estado.conectada && navigator.onLine) {
      await Promise.race([nube.sincronizar().catch(() => {}), new Promise(ok => setTimeout(ok, 5000))]);
      actual = (await db.uno("perfiles", perfil.id)) || perfil;
      if (actual.casos) return abrirClaveDeCasos(actual, kPin);
    }
    clave = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    kid = db.uid();
    const iv = aleatorio(12);
    const env = await crypto.subtle.wrapKey("raw", clave, kPin, { name: "AES-GCM", iv });
    actual = { ...actual, casos: { kid, iv: aB64(iv), datos: aB64(env) } };
  }
  const copias = await copiasParaCoordinadoras(actual, clave, kid);
  if (actual !== perfil || JSON.stringify(copias) !== JSON.stringify(actual.casosCoord || {})) {
    await db.guardar("perfiles", { ...actual, casosCoord: copias });
  }
  llaves.set(perfil.id, { clave, kid, soloLectura: false });
}

/**
 * Abre los expedientes del perfil con su PIN (que ya se verificó). Si es la primera vez, crea las claves.
 * Devuelve true si quedaron abiertos. Nunca lanza: si algo falla, el resto de la app sigue funcionando.
 */
export async function desbloquear(perfil, pin) {
  try {
    if (!esCoord(perfil) && !rolConCasos(perfil)) return false;
    const reciente = (await db.uno("perfiles", perfil.id)) || perfil;
    const kPin = await clavePin(pin, reciente.sal);
    if (esCoord(reciente)) {
      await abrirPar(reciente, kPin);
      await abrirCopiasDeCoordinadora((await db.uno("perfiles", reciente.id)) || reciente);
    } else {
      await abrirClaveDeCasos(reciente, kPin);
    }
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

/** Vuelve a leer las copias que otros perfiles dejaron para la Coordinadora (p. ej. tras recibir datos nuevos). */
export async function actualizarCopias(perfil) {
  if (esCoord(perfil) && par?.id === perfil.id) await abrirCopiasDeCoordinadora(perfil);
}

/* ---------- Cambio de PIN ---------- */
/**
 * Al cambiar el PIN de un perfil hay que volver a proteger sus claves con el PIN nuevo. Se necesita tener abiertos los
 * expedientes de esa persona (la propia Coordinadora, o la copia de la Coordinadora en el caso de los demás perfiles).
 * Si no es posible y no se pide `forzar`, lanza un error con código "BLOQUEADOS" y no cambia nada.
 * Con `forzar`, el perfil pierde el acceso a sus expedientes anteriores (se crea una clave nueva en su próximo ingreso).
 */
export async function reenvolver(perfil, pin, sal, forzar = false) {
  const kNueva = await clavePin(pin, sal);
  if (esCoord(perfil) && perfil.casosPar) {
    if (par?.id !== perfil.id) {
      if (!forzar) throw Object.assign(new Error("Abra primero los expedientes para cambiar este PIN."), { codigo: "BLOQUEADOS" });
      delete perfil.casosPar; // nuevo par en el próximo ingreso; los demás perfiles dejarán copia nueva
      return;
    }
    const original = perfil.casosPar;
    const iv = aleatorio(12);
    const env = await crypto.subtle.wrapKey("pkcs8", par.priv, kNueva, { name: "AES-GCM", iv });
    perfil.casosPar = { ...original, iv: aB64(iv), priv: aB64(env) };
    return;
  }
  if (rolConCasos(perfil) && perfil.casos) {
    const k = llaves.get(perfil.id);
    if (!k) {
      if (!forzar) throw Object.assign(new Error("Esta persona perdería el acceso a sus expedientes."), { codigo: "BLOQUEADOS" });
      delete perfil.casos;
      delete perfil.casosCoord;
      return;
    }
    const iv = aleatorio(12);
    const env = await crypto.subtle.wrapKey("raw", k.clave, kNueva, { name: "AES-GCM", iv });
    perfil.casos = { ...perfil.casos, iv: aB64(iv), datos: aB64(env) };
  }
}

/* ---------- Cifrar y descifrar registros ---------- */
/** Devuelve el sobre cifrado `{ kid, iv, datos }` de un objeto, ligado al identificador del registro. */
export async function cifrar(objeto, perfilId, idRegistro, { referir = false } = {}) {
  const k = llaves.get(perfilId);
  // `referir`: la Coordinadora crea un caso (y su primera nota) dirigido a otro perfil con la copia de su clave
  if (!k || (k.soloLectura && !referir)) throw new Error("Los expedientes están bloqueados.");
  const iv = aleatorio(12);
  const datos = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: texto.encode(idRegistro) }, k.clave, texto.encode(JSON.stringify(objeto)));
  return { kid: k.kid, iv: aB64(iv), datos: aB64(datos) };
}

/** Devuelve el objeto original, o null si no se puede abrir (sin clave, clave de otro dispositivo o registro alterado). */
export async function descifrar(sobre, perfilId, idRegistro) {
  const k = llaves.get(perfilId);
  if (!k || !sobre || sobre.kid !== k.kid) return null;
  try {
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(sobre.iv), additionalData: texto.encode(idRegistro) }, k.clave, deB64(sobre.datos));
    return JSON.parse(new TextDecoder().decode(claro));
  } catch { return null; }
}
