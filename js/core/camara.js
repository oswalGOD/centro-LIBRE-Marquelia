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

const ICONO_GIRAR = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l1.6-2.5h6.8L17 8h3v11H4z"/><path d="M9.5 13.5a2.7 2.7 0 0 1 4.6-1.5M14.5 13.5a2.7 2.7 0 0 1-4.6 1.5M14.2 10.8V12.2h-1.4M9.8 16.2v-1.4h1.4"/></svg>`;
const ICONO_LISTO = `<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

/**
 * Abre la cámara a pantalla completa. `alTomar({ blob, ancho, alto })` guarda cada foto;
 * la cámara sigue abierta para tomar varias seguidas. Devuelve cuántas fotos se tomaron al tocar «Listo».
 * Abajo: cambiar cámara (izquierda), obturador (centro) y listo (derecha), todos como símbolos.
 * Al girar el dispositivo se reinicia la cámara, para que la imagen y el recorte coincidan con la nueva orientación.
 */
export function abrirCamara(alTomar, titulo = "Tomar fotografías") {
  return new Promise(terminar => {
    const capa = document.createElement("div");
    capa.className = "camara en-vivo";
    capa.setAttribute("role", "dialog");
    capa.setAttribute("aria-modal", "true");
    capa.setAttribute("aria-label", titulo);
    capa.innerHTML = `
      <div class="camara-zona">
        <div class="camara-visor">
          <video playsinline muted autoplay></video>
          <div class="camara-destello" hidden></div>
        </div>
        <div class="camara-info">
          <p class="camara-cuenta" aria-live="polite"></p>
          <p class="camara-aviso" role="status">Encuadre 4:3. Se guarda lo que se ve en el recuadro.</p>
        </div>
      </div>
      <div class="camara-barra">
        <button type="button" class="camara-icono" data-girar aria-label="Cambiar cámara" title="Cambiar cámara">${ICONO_GIRAR}</button>
        <button type="button" class="camara-obturador" data-tomar aria-label="Tomar foto" title="Tomar foto"><span></span></button>
        <button type="button" class="camara-icono" data-listo aria-label="Listo" title="Listo">${ICONO_LISTO}</button>
      </div>
      <label class="btn camara-sistema" data-sistema hidden>Usar la cámara del sistema<input type="file" accept="image/*" capture="environment" hidden></label>`;
    document.body.append(capa);
    document.body.classList.add("con-camara");
    const q = s => capa.querySelector(s);
    const video = q("video"), tomar = q("[data-tomar]"), girar = q("[data-girar]"), aviso = q(".camara-aviso"), cuenta = q(".camara-cuenta");
    girar.style.visibility = "hidden";
    let flujo = null, modo = "environment", n = 0, ocupada = false, intento = 0;

    const detener = () => { flujo?.getTracks().forEach(t => t.stop()); flujo = null; video.srcObject = null; };
    const mostrarSistema = mensaje => {
      detener();
      q(".camara-visor").hidden = true;
      tomar.hidden = true;
      girar.hidden = true;
      q("[data-sistema]").hidden = false;
      aviso.textContent = mensaje;
    };
    async function iniciar() {
      const mio = ++intento;
      detener();
      if (!navigator.mediaDevices?.getUserMedia) return mostrarSistema("Este navegador no permite usar la cámara dentro de la aplicación. Utilice la cámara del sistema.");
      try {
        const f = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: modo }, width: { ideal: ANCHO }, height: { ideal: ALTO } } });
        if (mio !== intento) { f.getTracks().forEach(t => t.stop()); return; } // llegó otro reinicio (p. ej. al girar el equipo)
        flujo = f;
        video.srcObject = flujo;
        await video.play().catch(() => {});
        const camaras = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(d => d.kind === "videoinput");
        girar.style.visibility = camaras.length < 2 ? "hidden" : "visible";
      } catch (e) {
        if (mio !== intento) return;
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
        cuenta.textContent = `${n} ${n === 1 ? "foto guardada" : "fotos guardadas"}`;
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
    girar.onclick = () => { modo = modo === "environment" ? "user" : "environment"; iniciar(); };

    // Al girar el equipo, algunos navegadores (sobre todo Safari) siguen entregando la imagen con la orientación anterior
    let espera;
    const alGirar = () => {
      clearTimeout(espera);
      if (!flujo) return;
      espera = setTimeout(iniciar, 350);
    };
    screen.orientation?.addEventListener("change", alGirar);
    addEventListener("orientationchange", alGirar);

    const cerrar = () => {
      clearTimeout(espera);
      intento++;
      document.removeEventListener("keydown", tecla);
      screen.orientation?.removeEventListener("change", alGirar);
      removeEventListener("orientationchange", alGirar);
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
