// Lectura del código QR de la constancia de CURP con la cámara. Funciona sin internet:
// el QR ya trae los datos y se decodifica en el dispositivo; nada se envía a ningún lado.

import { limpiarCurp, leerCurp } from "./catalogos.js";
import { leerPreferida, guardarPreferida, listarTraseras, abrirFlujo, idDelFlujo, pareceNegra, siguiente } from "./camaras.js";

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
    s.onerror = () => { cargando = null; mal(new Error("No fue posible cargar el lector de códigos.")); };
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
        <div class="sig-head"><h2 id="scanTitulo">Escanear CURP</h2><p class="hint">Apunte la cámara al código QR de la constancia de CURP, impresa o en la pantalla del celular.</p></div>
        <div class="scan-view"><video playsinline muted aria-label="Vista de la cámara"></video><div class="scan-frame" aria-hidden="true"></div><p class="scan-msg" role="status"></p></div>
        <p class="note warn" id="scanAviso" hidden></p>
        <div class="actions">
          <button type="button" class="btn" data-accion="lente" hidden>Cambiar cámara</button>
          <label class="btn" for="scanFoto">Usar una fotografía</label><input type="file" id="scanFoto" accept="image/*" capture="environment" class="visually-hidden">
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
      if (texto !== ultimoAviso) avisar("Ese código no corresponde a una constancia de CURP.");
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
          else avisar("No se encontró el código QR en la fotografía. Tómela de cerca y con buena iluminación.");
        } catch { avisar("No fue posible abrir la fotografía."); }
        ev.target.value = "";
      };

      if (!navigator.mediaDevices?.getUserMedia) { msg.textContent = "Este dispositivo no permite usar la cámara en este contexto. Utilice una fotografía."; return; }
      const botonLente = capa.querySelector("[data-accion=lente]");
      let traseras = [], idActual = leerPreferida(), vuelta = 0;

      // Abre la cámara indicada (o la trasera predeterminada) y empieza a buscar el QR.
      async function iniciar() {
        const mio = ++vuelta;
        flujo?.getTracks().forEach(t => t.stop());
        flujo = null;
        video.srcObject = null;
        msg.textContent = "Abriendo la cámara…";
        try {
          const r = await abrirFlujo({ id: idActual, ancho: 1280, alto: 720 });
          if (!activo || mio !== vuelta) return r.flujo.getTracks().forEach(t => t.stop());
          flujo = r.flujo;
          video.srcObject = flujo;
          await video.play();
          const usada = idDelFlujo(flujo);
          if (r.fallo) { idActual = ""; guardarPreferida(""); }
          else if (usada) idActual = usada;
          traseras = await listarTraseras();
          if (!activo || mio !== vuelta) return;
          const actual = traseras.find(c => c.id === usada);
          botonLente.hidden = traseras.length < 2;
          if (actual) botonLente.textContent = `Cámara: ${actual.nombre}`;
          msg.textContent = r.fallo ? "Esa cámara no respondió; se usa la predeterminada. Pruebe con «Cambiar cámara»." : "";
          // Imagen negra: lente dañado, tapado o sin señal
          setTimeout(() => {
            if (activo && mio === vuelta && pareceNegra(video)) msg.textContent = traseras.length > 1
              ? "Esta cámara no muestra imagen (puede estar tapada o dañada). Toque «Cambiar cámara» para probar otra."
              : "La cámara no muestra imagen. Verifique que no esté tapada o utilice una fotografía.";
          }, 1200);
          const ciclo = () => {
            if (!activo || mio !== vuelta) return;
            if (video.readyState >= 2 && revisar(decodificar(jsQR, video, video.videoWidth, video.videoHeight, lienzo))) return;
            setTimeout(() => requestAnimationFrame(ciclo), 120);
          };
          ciclo();
        } catch (e) {
          if (mio !== vuelta) return;
          msg.textContent = e?.name === "NotAllowedError"
            ? "No se concedió el permiso de la cámara. Verifique la configuración o utilice una fotografía."
            : "No fue posible abrir la cámara. Pruebe con «Cambiar cámara», verifique el permiso o utilice una fotografía.";
        }
      }
      botonLente.onclick = () => {
        const otra = siguiente(traseras, idActual);
        if (!otra) return;
        idActual = otra.id;
        guardarPreferida(idActual);
        iniciar();
      };
      iniciar();
    }).catch(e => { msg.textContent = e.message; });
  });
}
