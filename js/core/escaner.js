// Lectura del código QR de la constancia de CURP con la cámara. Funciona sin internet:
// el QR ya trae los datos y se decodifica en el dispositivo; nada se envía a ningún lado.

import { limpiarCurp, leerCurp } from "./catalogos.js";

/**
 * El QR de la constancia trae los campos separados por «|»:
 * CURP | (vacío) | primer apellido | segundo apellido | nombre(s) | HOMBRE/MUJER | dd/mm/aaaa | estado | clave del estado |
 * Devuelve { curp, nombre } o null si el texto no es de una constancia de CURP.
 */
export function leerQrCurp(texto) {
  const c = String(texto || "").split("|").map(x => x.trim());
  const curp = limpiarCurp(c[0]);
  if (c.length < 5 || !leerCurp(curp)) return null;
  const nombre = [c[4], c[2], c[3]].filter(Boolean).join(" ").replace(/\s+/g, " ");
  return { curp, nombre };
}

let cargando;
function cargarLector() {
  cargando ??= new Promise((ok, mal) => {
    if (window.jsQR) return ok(window.jsQR);
    const s = document.createElement("script");
    s.src = new URL("../vendor/jsQR.min.js", import.meta.url).href;
    s.onload = () => ok(window.jsQR);
    s.onerror = () => { cargando = null; mal(new Error("No se pudo cargar el lector de códigos.")); };
    document.head.append(s);
  });
  return cargando;
}

/** Busca un QR en una imagen, video o canvas. */
function decodificar(jsQR, fuente, ancho, alto, lienzo) {
  const escala = Math.min(1, 1000 / Math.max(ancho, alto));
  lienzo.width = Math.round(ancho * escala);
  lienzo.height = Math.round(alto * escala);
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(fuente, 0, 0, lienzo.width, lienzo.height);
  const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data || null;
}

/**
 * Abre la cámara a pantalla completa y devuelve { curp, nombre } al leer una constancia,
 * o null si se cancela. Si la cámara no está disponible, permite usar una foto.
 */
export function escanearCurp() {
  return new Promise(resolve => {
    const previo = document.activeElement;
    const capa = document.createElement("div");
    capa.className = "sig-modal scan-modal";
    capa.innerHTML = `
      <div class="sig-sheet" role="dialog" aria-modal="true" aria-labelledby="scanTitulo">
        <div class="sig-head"><h2 id="scanTitulo">Escanear CURP</h2><p class="hint">Apunta la cámara al código QR de la constancia de CURP, impresa o en la pantalla del celular.</p></div>
        <div class="scan-view"><video playsinline muted aria-label="Vista de la cámara"></video><div class="scan-frame" aria-hidden="true"></div><p class="scan-msg" role="status"></p></div>
        <p class="note warn" id="scanAviso" hidden></p>
        <div class="actions">
          <label class="btn" for="scanFoto">Usar una foto</label><input type="file" id="scanFoto" accept="image/*" capture="environment" class="visually-hidden">
          <button type="button" class="btn ghost push" data-accion="cancelar">Cancelar</button>
        </div>
      </div>`;
    const desbordePrevio = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.append(capa);
    const video = capa.querySelector("video");
    const msg = capa.querySelector(".scan-msg");
    const aviso = capa.querySelector("#scanAviso");
    const lienzo = document.createElement("canvas");
    let flujo = null, activo = true, ultimoAviso = "";

    const avisar = t => { aviso.textContent = t; aviso.hidden = !t; };

    function cerrar(valor) {
      activo = false;
      flujo?.getTracks().forEach(t => t.stop());
      removeEventListener("keydown", tecla);
      document.documentElement.style.overflow = desbordePrevio;
      capa.remove();
      previo?.focus?.({ preventScroll: true });
      resolve(valor);
    }
    const tecla = e => { if (e.key === "Escape") cerrar(null); };
    addEventListener("keydown", tecla);
    capa.querySelector("[data-accion=cancelar]").onclick = () => cerrar(null);

    /** Devuelve true si el texto era una constancia y ya se cerró. */
    function revisar(texto) {
      if (!texto) return false;
      const datos = leerQrCurp(texto);
      if (datos) { navigator.vibrate?.(60); cerrar(datos); return true; }
      if (texto !== ultimoAviso) avisar("Ese código no es de una constancia de CURP.");
      ultimoAviso = texto;
      return false;
    }

    cargarLector().then(jsQR => {
      capa.querySelector("#scanFoto").onchange = async ev => {
        const archivo = ev.target.files[0];
        if (!archivo) return;
        try {
          const foto = await createImageBitmap(archivo);
          const texto = decodificar(jsQR, foto, foto.width, foto.height, lienzo);
          if (texto) revisar(texto);
          else avisar("No se encontró el código QR en la foto. Tómala de cerca y con buena luz.");
        } catch { avisar("No se pudo abrir la foto."); }
        ev.target.value = "";
      };

      if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = "Este dispositivo no permite usar la cámara aquí. Usa una foto."; return; }
      msg.textContent = "Abriendo la cámara…";
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
        .then(f => {
          flujo = f;
          if (!activo) return f.getTracks().forEach(t => t.stop());
          video.srcObject = f;
          return video.play().then(() => {
            msg.textContent = "";
            const ciclo = () => {
              if (!activo) return;
              if (video.readyState >= 2 && revisar(decodificar(jsQR, video, video.videoWidth, video.videoHeight, lienzo))) return;
              setTimeout(() => requestAnimationFrame(ciclo), 120);
            };
            ciclo();
          });
        })
        .catch(() => { msg.textContent = "No se pudo abrir la cámara. Revisa el permiso de cámara o usa una foto."; });
    }).catch(e => { msg.textContent = e.message; });
  });
}
