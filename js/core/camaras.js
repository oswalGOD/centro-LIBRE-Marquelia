// Elección de la cámara trasera. Muchos iPhone tienen varios lentes traseros (principal, ultra gran angular, teleobjetivo);
// si uno está dañado o sucio, el usuario puede cambiar a otro. La elección se recuerda solo en este dispositivo.
// Limitaciones de Safari/iOS: los nombres de las cámaras solo están disponibles después de conceder el permiso,
// y algunos modelos exponen además una cámara «virtual» (doble/triple) que cambia de lente sola y no se puede separar.

const CLAVE = "clm-camara-trasera";

export function leerPreferida() {
  try { return localStorage.getItem(CLAVE) || ""; } catch { return ""; }
}
export function guardarPreferida(id) {
  try { if (id) localStorage.setItem(CLAVE, id); else localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento: no se recuerda */ }
}

const ES_FRONTAL = /front|frontal|delantera|user|selfie|facetime/i;

/** Nombre corto en español a partir de la etiqueta que da el navegador («Back Ultra Wide Camera», «Cámara trasera con teleobjetivo»…). */
export function nombreLente(etiqueta, posicion) {
  const e = String(etiqueta || "");
  if (/ultra|0[.,]5\s*x/i.test(e)) return "Ultra gran angular";
  if (/tele|zoom|[2-5]\s*x/i.test(e)) return "Teleobjetivo";
  if (/triple|dual|doble|double/i.test(e)) return "Automática (varios lentes)";
  if (/back|trasera|rear|environment|wide|gran angular/i.test(e)) return "Principal";
  return `Cámara ${posicion + 1}`;
}

/** Cámaras traseras disponibles. Sin permiso previo la lista viene sin nombres; en ese caso devuelve []. */
export async function listarTraseras() {
  const todas = (await navigator.mediaDevices?.enumerateDevices?.().catch(() => []) || []).filter(d => d.kind === "videoinput" && d.deviceId);
  if (!todas.length || todas.every(d => !d.label)) return [];
  const traseras = todas.filter(d => !ES_FRONTAL.test(d.label));
  return traseras.map((d, i) => ({ id: d.deviceId, etiqueta: d.label, nombre: nombreLente(d.label, i) }));
}

/**
 * Abre la cámara pedida. `id` vacío = la trasera que elija el navegador.
 * Devuelve { flujo, fallo } donde `fallo` indica que la cámara pedida no abrió y se usó la predeterminada.
 */
export async function abrirFlujo({ id = "", modo = "environment", ancho, alto }) {
  const medidas = { width: { ideal: ancho }, height: { ideal: alto } };
  const pedir = video => navigator.mediaDevices.getUserMedia({ audio: false, video });
  let fallo = false;
  if (id) {
    try { return { flujo: await pedir({ ...medidas, deviceId: { exact: id } }), fallo }; }
    catch (e) { if (e?.name === "NotAllowedError" || e?.name === "SecurityError") throw e; fallo = true; }
  }
  return { flujo: await pedir({ ...medidas, facingMode: { ideal: modo } }), fallo };
}

/** Identificador de la cámara que está usando el flujo. */
export const idDelFlujo = flujo => flujo?.getVideoTracks?.()[0]?.getSettings?.().deviceId || "";

/** true si el cuadro actual es prácticamente negro (lente dañado, tapado o sin señal). */
export function pareceNegra(video) {
  if (!video.videoWidth) return true;
  try {
    const c = document.createElement("canvas");
    c.width = 32; c.height = 24;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(video, 0, 0, 32, 24);
    const d = g.getImageData(0, 0, 32, 24).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
    return max < 14;
  } catch { return false; }
}

/** Siguiente cámara de la lista (da la vuelta al final). */
export function siguiente(lista, idActual) {
  if (!lista.length) return null;
  const i = lista.findIndex(c => c.id === idActual);
  return lista[(i + 1) % lista.length];
}
