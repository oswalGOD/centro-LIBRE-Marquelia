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

/** Procesa una fotografía de la galería con los mismos criterios que la cámara: orientación corregida, recorte 4:3 y 1600 × 1200 JPEG. */
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
  try { return await recortar43(imagen, w, h); } finally { imagen.close?.(); }
}

const svg = (d, t = 28) => `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// Iconos de Lucide (licencia ISC)
const ICONO_GIRAR = svg('<path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3"/><path d="m6 2 3 3-3 3"/>', 30);
const ICONO_LISTO = svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', 32);
const ICONO_FOTO = svg('<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>', 30);

/**
 * Abre la cámara a pantalla completa. `alTomar({ blob, ancho, alto })` guarda cada foto;
 * la cámara sigue abierta para tomar varias seguidas. Devuelve cuántas fotos se tomaron al tocar «Listo».
 * Abajo: cambiar cámara (izquierda), obturador (centro) y listo (derecha), todos como iconos.
 *  */
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
        <button type="button" class="camara-obturador" data-tomar aria-label="Tomar foto" title="Tomar foto"><span>${ICONO_FOTO}</span></button>
        <button type="button" class="camara-icono" data-listo aria-label="Listo" title="Listo">${ICONO_LISTO}</button>
      </div>`;
    document.body.append(capa);
    document.body.classList.add("con-camara");
    const q = s => capa.querySelector(s);
    const video = q("video"), tomar = q("[data-tomar]"), girar = q("[data-girar]"), aviso = q(".camara-aviso"), cuenta = q(".camara-cuenta");
    girar.style.visibility = "hidden";
    let flujo = null, modo = "environment", n = 0, ocupada = false, intento = 0;

    // Con el giro automático activo, el orden de los botones sigue a la mano: al girar a la izquierda, el de la izquierda queda abajo
    // En iPhone/iPad (Safari) el signo del ángulo es el contrario al de Android
    const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const ordenar = () => {
      const angulo = esIOS && typeof window.orientation === "number" ? window.orientation : screen.orientation?.angle ?? window.orientation;
      const izquierda = esIOS ? angulo === -90 || angulo === 270 : angulo === 90;
      capa.classList.toggle("gira-izquierda", izquierda);
    };
    ordenar();
    screen.orientation?.addEventListener("change", ordenar);
    addEventListener("resize", ordenar);

    const detener = () => { flujo?.getTracks().forEach(t => t.stop()); flujo = null; video.srcObject = null; };
    const mostrarError = mensaje => {
      detener();
      q(".camara-visor").hidden = true;
      tomar.hidden = true;
      girar.hidden = true;
      aviso.textContent = mensaje;
    };
    async function iniciar() {
      const mio = ++intento;
      detener();
      if (!navigator.mediaDevices?.getUserMedia) return mostrarError("Este navegador no permite usar la cámara dentro de la aplicación.");
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
        mostrarError(e?.name === "NotAllowedError"
          ? "No se concedió el permiso de la cámara. Puede permitirlo en la configuración del navegador."
          : "No fue posible iniciar la cámara.");
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
    girar.onclick = () => { modo = modo === "environment" ? "user" : "environment"; iniciar(); };

    const cerrar = () => {
      intento++;
      document.removeEventListener("keydown", tecla);
      screen.orientation?.removeEventListener("change", ordenar);
      removeEventListener("resize", ordenar);
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
