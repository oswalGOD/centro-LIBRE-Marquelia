// Bitácora de errores de este dispositivo, para revisar fallas desde Ajustes → Desarrollo.
// Guarda solo los últimos errores (mensaje, lugar y hora) en el navegador; nunca datos de usuarias.

const CLAVE = "clm-errores";
const MAXIMO = 30;

export function leer() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch { return []; }
}

export function anotar(mensaje, lugar = "") {
  try {
    const lista = leer();
    lista.unshift({ hora: new Date().toISOString(), mensaje: String(mensaje).slice(0, 500), lugar: String(lugar).slice(0, 200), ruta: location.hash });
    localStorage.setItem(CLAVE, JSON.stringify(lista.slice(0, MAXIMO)));
  } catch {}
}

export function vaciar() {
  try { localStorage.removeItem(CLAVE); } catch {}
}

addEventListener("error", e => anotar(e.message, e.filename ? `${e.filename.split("/").pop()}:${e.lineno}` : ""));
addEventListener("unhandledrejection", e => anotar(e.reason?.message || e.reason, "promesa"));
