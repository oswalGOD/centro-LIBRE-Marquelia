// Cámara para las evidencias fotográficas.
// Todas las fotos salen con la misma proporción (4:3 horizontal) y el mismo tamaño máximo (1600 × 1200 px),
// sin importar el dispositivo, para que al imprimirlas queden ordenadas y parejas.
// La vista previa muestra exactamente el encuadre que se guardará.

import { esc } from "./ui.js";

export const ANCHO = 1600;
export const ALTO = 1200;
export const CALIDAD = 0.78; // JPEG: unos 150 a 300 KB por foto

/** Recorta al centro con proporción 4:3, reduce a 1600 × 1200 como máximo y comprime. Nunca amplía. */
export function recortar43(fuente, w, h) {
  let sw = w, sh = (w * 3) / 4;
  if (sh > h) { sh = h; sw = (h * 4) / 3; }
  const sx = (w - sw) / 2, sy = (h - sh) / 2;
  const ancho = Math.min(ANCHO, Math.round(sw));
  const alto = Math.round((ancho * 3) / 4);
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const g = lienzo.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(fuente, sx, sy, sw, sh, 0, 0, ancho, alto);
  return new Promise((ok, mal) => lienzo.toBlob(blob => (blob ? ok({ blob, ancho, alto }) : mal(new Error("No fue posible procesar la fotografía."))), "image/jpeg", CALIDAD));
}

/** Procesa una fotografía de un archivo (cámara del sistema), respetando su orientación. */
export async function desdeArchivo(archivo) {
  let imagen;
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    imagen = await new Promise((ok, mal) => {
      const url = URL.createObjectURL(archivo);
      const i = new Image();
      i.onload = () => { URL.revokeObjectURL(url); ok(i); };
      i.onerror = () => { URL.revokeObjectURL(url); mal(new Error("No fue posible abrir la fotografía.")); };
      i.src = url;
    });
  }
  const w = imagen.width || imagen.naturalWidth, h = imagen.height || imagen.naturalHeight;
  const r = await recortar43(imagen, w, h);
  imagen.close?.();
  return r;
}

/**
 * Abre la cámara a pantalla completa. `alTomar({ blob, ancho, alto })` guarda cada foto;
 * la cámara sigue abierta para tomar varias seguidas. Devuelve cuántas fotos se tomaron al tocar «Listo».
 */
export function abrirCamara(alTomar, titulo = "Tomar fotografías") {
  return new Promise(terminar => {
    const capa = document.createElement("div");
    capa.className = "camara";
    capa.setAttribute("role", "dialog");
    capa.setAttribute("aria-modal", "true");
    capa.setAttribute("aria-label", titulo);
    capa.innerHTML = `
      <div class="camara-caja">
        <h2 class="h3">${esc(titulo)}</h2>
        <div class="camara-visor">
          <video playsinline muted autoplay></video>
          <div class="camara-destello" hidden></div>
        </div>
        <p class="hint camara-aviso" role="status">Sostenga el dispositivo en horizontal. Se guardará el encuadre mostrado, en proporción 4:3.</p>
        <p class="camara-cuenta" aria-live="polite"></p>
        <div class="camara-botones">
          <button type="button" class="btn primary" data-tomar>Tomar foto</button>
          <button type="button" class="btn" data-girar hidden>Cambiar cámara</button>
          <label class="btn" data-sistema hidden>Usar la cámara del sistema<input type="file" accept="image/*" capture="environment" hidden></label>
          <button type="button" class="btn ghost" data-listo>Listo</button>
        </div>
      </div>`;
    document.body.append(capa);
    document.body.classList.add("con-camara");
    const q = s => capa.querySelector(s);
    const video = q("video"), tomar = q("[data-tomar]"), aviso = q(".camara-aviso"), cuenta = q(".camara-cuenta");
    let flujo = null, modo = "environment", n = 0, ocupada = false;

    const detener = () => { flujo?.getTracks().forEach(t => t.stop()); flujo = null; video.srcObject = null; };
    const mostrarSistema = mensaje => {
      detener();
      q(".camara-visor").hidden = true;
      tomar.hidden = true;
      q("[data-girar]").hidden = true;
      q("[data-sistema]").hidden = false;
      aviso.textContent = mensaje;
    };
    async function iniciar() {
      detener();
      if (!navigator.mediaDevices?.getUserMedia) return mostrarSistema("Este navegador no permite usar la cámara dentro de la aplicación. Utilice la cámara del sistema.");
      try {
        flujo = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: modo }, width: { ideal: ANCHO }, height: { ideal: ALTO } } });
        video.srcObject = flujo;
        await video.play().catch(() => {});
        const camaras = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(d => d.kind === "videoinput");
        q("[data-girar]").hidden = camaras.length < 2;
      } catch (e) {
        mostrarSistema(e?.name === "NotAllowedError"
          ? "No se concedió el permiso de la cámara. Puede permitirlo en la configuración del navegador o utilizar la cámara del sistema."
          : "No fue posible iniciar la cámara. Utilice la cámara del sistema.");
      }
    }

    async function guardar(promesaFoto) {
      if (ocupada) return;
      ocupada = true;
      tomar.disabled = true;
      try {
        await alTomar(await promesaFoto());
        n++;
        cuenta.textContent = `${n} ${n === 1 ? "foto guardada" : "fotos guardadas"} en esta carpeta.`;
        const d = q(".camara-destello");
        d.hidden = false;
        setTimeout(() => (d.hidden = true), 150);
      } catch (e) {
        aviso.textContent = e?.message || "No fue posible guardar la fotografía.";
      } finally {
        ocupada = false;
        tomar.disabled = false;
      }
    }

    tomar.onclick = () => guardar(() => {
      if (!video.videoWidth) throw new Error("La cámara aún no está lista. Espere un momento e intente de nuevo.");
      return recortar43(video, video.videoWidth, video.videoHeight);
    });
    q("input[type=file]").onchange = e => {
      const archivo = e.target.files[0];
      e.target.value = "";
      if (archivo) guardar(() => desdeArchivo(archivo));
    };
    q("[data-girar]").onclick = () => { modo = modo === "environment" ? "user" : "environment"; iniciar(); };

    const cerrar = () => {
      document.removeEventListener("keydown", tecla);
      detener();
      capa.remove();
      document.body.classList.remove("con-camara");
      terminar(n);
    };
    const tecla = e => e.key === "Escape" && cerrar();
    document.addEventListener("keydown", tecla);
    q("[data-listo]").onclick = cerrar;
    iniciar();
    tomar.focus();
  });
}
