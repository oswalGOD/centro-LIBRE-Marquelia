// Panel para firmar con el dedo, lápiz o ratón. Devuelve la firma como imagen PNG.

// Opciones:
//   girado(): true cuando el panel se muestra rotado 90° con CSS (celular en vertical)
//   conservar: el trazo existente sigue siendo parte de la firma en curso (al redibujar tras girar)
const GROSOR = 5.5; // grosor del trazo en px (≈0,3 mm sobre el papel, como un bolígrafo)
const PUNTA_INICIO = [10, 0.35]; // largo (px) y grosor relativo de la entrada del trazo
const PUNTA_FINAL = [40, 0.12];  // largo (px) y grosor relativo de la salida: punta marcada de bolígrafo
export const COLOR_FIRMA = "#2747b0"; // azul bolígrafo

/** Puntos filtrados y unidos con curvas (los mismos que se ven mientras se traza), listos para dibujar con punta. */
function curvaSuave(puntos, f) {
  let s = puntos[0];
  const S = [s];
  for (const p of puntos.slice(1)) { s = [s[0] + (p[0] - s[0]) * f, s[1] + (p[1] - s[1]) * f]; S.push(s); }
  S.push(puntos[puntos.length - 1]);
  const salida = [S[0]];
  for (let i = 1; i < S.length - 1; i++) {
    const m = [(S[i][0] + S[i + 1][0]) / 2, (S[i][1] + S[i + 1][1]) / 2], a = salida[salida.length - 1];
    for (let t = 0.125; t <= 1.001; t += 0.125) {
      const u = 1 - t;
      salida.push([u * u * a[0] + 2 * u * t * S[i][0] + t * t * m[0], u * u * a[1] + 2 * u * t * S[i][1] + t * t * m[1]]);
    }
  }
  salida.push(S[S.length - 1]);
  return salida;
}

/** Dibuja un trazo con la entrada y la salida afinadas, como la punta de un bolígrafo. */
function trazoConPuntas(ctx, puntos, grosor, f) {
  const P = curvaSuave(puntos, f), L = [0];
  for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const T = L[L.length - 1];
  const ini = [Math.min(PUNTA_INICIO[0], T * 0.25), PUNTA_INICIO[1]], fin = [Math.min(PUNTA_FINAL[0], T * 0.5), PUNTA_FINAL[1]];
  const suavizar = x => x * x * (3 - 2 * x);
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.strokeStyle = COLOR_FIRMA;
  for (let i = 1; i < P.length; i++) {
    const d = (L[i] + L[i - 1]) / 2, resto = T - d;
    let k = 1;
    if (d < ini[0]) k = Math.min(k, ini[1] + (1 - ini[1]) * suavizar(d / ini[0]));
    if (resto < fin[0]) k = Math.min(k, fin[1] + (1 - fin[1]) * suavizar(resto / fin[0]));
    ctx.lineWidth = grosor * k;
    ctx.beginPath(); ctx.moveTo(...P[i - 1]); ctx.lineTo(...P[i]); ctx.stroke();
  }
}

const recoloreadas = new Map();
/**
 * Devuelve la firma con el color actual (azul bolígrafo), conservando la forma y la transparencia.
 * Sirve para mostrar e imprimir las firmas guardadas con el color anterior; no modifica lo guardado.
 * El grosor no se puede cambiar en una imagen ya trazada, por lo que solo aplica a firmas nuevas.
 */
export function colorearFirma(src) {
  if (!src || !/^data:image\/png;base64,/.test(src)) return Promise.resolve(src);
  if (!recoloreadas.has(src)) {
    recoloreadas.set(src, new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const lienzo = document.createElement("canvas");
          lienzo.width = img.naturalWidth; lienzo.height = img.naturalHeight;
          const cx = lienzo.getContext("2d");
          cx.drawImage(img, 0, 0);
          cx.globalCompositeOperation = "source-in"; // conserva la transparencia y sustituye el color
          cx.fillStyle = COLOR_FIRMA;
          cx.fillRect(0, 0, lienzo.width, lienzo.height);
          resolve(lienzo.toDataURL("image/png"));
        } catch { resolve(src); }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    }));
  }
  return recoloreadas.get(src);
}

export function panelFirma(canvas, existente = "", { girado = () => false, conservar = false } = {}) {
  const ctx = canvas.getContext("2d");
  let dibujando = false, trazada = conservar && !!existente, ultimo = null;

  function preparar() {
    const r = { width: canvas.offsetWidth, height: canvas.offsetHeight }; // tamaño sin la rotación
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = GROSOR;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = ctx.fillStyle = COLOR_FIRMA;
    if (existente) {
      const img = new Image();
      img.onload = () => {
        // La firma guardada está recortada: se dibuja centrada sin deformarla
        const s = Math.min((r.width * 0.8) / img.width, (r.height * 0.7) / img.height);
        const w = img.width * s, h = img.height * s;
        ctx.drawImage(img, (r.width - w) / 2, (r.height - h) / 2 - 10, w, h);
      };
      colorearFirma(existente).then(u => { img.src = u; });
    }
  }
  preparar();

  const punto = e => {
    const r = canvas.getBoundingClientRect();
    // Girado 90° a la derecha: el eje x del panel apunta hacia abajo de la pantalla y el y hacia la izquierda
    return girado() ? [e.clientY - r.top, r.right - e.clientX] : [e.clientX - r.left, e.clientY - r.top];
  };

  // Suavizado: se filtra levemente cada punto y se unen con curvas que pasan por los puntos medios,
  // así no se ven picos y el trazo sigue siendo fiel a la mano (solo afecta a firmas nuevas).
  const SUAVIZADO = 0.5; // 1 = sin filtro; menor = más liso
  let filtrado = null, medio = null, crudo = null, lista = [], base = null;
  const copiar = () => { // imagen del lienzo antes del trazo, para redibujarlo con puntas al terminar
    const c = document.createElement("canvas");
    c.width = canvas.width; c.height = canvas.height;
    c.getContext("2d").drawImage(canvas, 0, 0);
    return c;
  };

  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (!trazada && existente) limpiar();
    dibujando = trazada = true;
    ultimo = crudo = filtrado = medio = punto(e);
    lista = [ultimo];
    base = copiar();
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.arc(ultimo[0], ultimo[1], GROSOR / 2, 0, Math.PI * 2);
    ctx.fill();
  });
  canvas.addEventListener("pointermove", e => {
    if (!dibujando) return;
    const eventos = e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]; // todos los puntos que entrega el dispositivo
    ctx.beginPath();
    ctx.moveTo(...medio);
    for (const ev of eventos) {
      const p = punto(ev);
      if (Math.hypot(p[0] - crudo[0], p[1] - crudo[1]) < 0.75) continue; // ignora temblor mínimo
      crudo = p;
      lista.push(p);
      const f = [filtrado[0] + (p[0] - filtrado[0]) * SUAVIZADO, filtrado[1] + (p[1] - filtrado[1]) * SUAVIZADO];
      const m = [(filtrado[0] + f[0]) / 2, (filtrado[1] + f[1]) / 2];
      ctx.quadraticCurveTo(filtrado[0], filtrado[1], m[0], m[1]);
      filtrado = f; medio = m;
    }
    ctx.stroke();
  });
  function terminar() {
    if (!dibujando) return;
    dibujando = false;
    if (lista.length > 1) { // se redibuja el trazo completo con punta de entrada y de salida
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      ctx.restore();
      trazoConPuntas(ctx, lista, GROSOR, SUAVIZADO);
    }
    filtrado = medio = crudo = base = null;
    lista = [];
  }
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => canvas.addEventListener(t, terminar));

  function limpiar() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    trazada = false;
    existente = "";
  }

  /** Recorta el espacio vacío alrededor del trazo para que la firma llene su celda en el formato. */
  function recortada() {
    const { width: w, height: h } = canvas;
    const px = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3] === 0) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return "";
    const m = 6 * (window.devicePixelRatio || 1);
    x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
    x1 = Math.min(w, x1 + m); y1 = Math.min(h, y1 + m);
    const salida = document.createElement("canvas");
    salida.width = x1 - x0;
    salida.height = y1 - y0;
    salida.getContext("2d").drawImage(canvas, x0, y0, salida.width, salida.height, 0, 0, salida.width, salida.height);
    return salida.toDataURL("image/png");
  }

  return {
    limpiar,
    /** Firma nueva si se trazó, la anterior si no se tocó, o cadena vacía. */
    valor: () => (trazada ? recortada() : existente),
  };
}

const esCelular = () => Math.min(screen.width, screen.height) < 600 && matchMedia("(pointer: coarse)").matches;
const vertical = () => innerHeight > innerWidth;

/** En celular intenta poner pantalla completa y girarla a horizontal. Donde el sistema no lo permite (iPhone), se gira con CSS. */
function girarPantalla() {
  if (!esCelular() || !document.documentElement.requestFullscreen || !screen.orientation?.lock) return Promise.resolve(false);
  return document.documentElement.requestFullscreen({ navigationUI: "hide" })
    .then(() => screen.orientation.lock("landscape"))
    .then(() => true)
    .catch(() => false);
}

function restaurarPantalla() {
  try { screen.orientation?.unlock?.(); } catch {}
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

/**
 * Abre la firma a pantalla completa y devuelve la firma aceptada, o null si se canceló.
 * La firma solo se puede trazar aquí: así, desplazarse por el formulario nunca la modifica
 * por accidente. En celular la pantalla se pone horizontal para tener más espacio.
 */
export function pedirFirma({ titulo = "Firma", existente = "" } = {}) {
  return new Promise(resolve => {
    const previo = document.activeElement;
    const capa = document.createElement("div");
    capa.className = "sig-modal";
    capa.innerHTML = `
      <div class="sig-sheet" role="dialog" aria-modal="true" aria-labelledby="sigTitulo">
        <div class="sig-head"><h2 id="sigTitulo"></h2><p class="hint">Firme con el dedo o el lápiz dentro del recuadro.</p></div>
        <div class="sigpad big"><canvas aria-label="Área para firmar"></canvas><div class="baseline"></div><div class="ph">Firma</div></div>
        <p class="note warn" id="sigAviso" hidden>Firme dentro del recuadro antes de aceptar.</p>
        <div class="actions">
          <button type="button" class="btn primary" data-accion="aceptar">Aceptar firma</button>
          <button type="button" class="btn" data-accion="borrar">Borrar</button>
          <button type="button" class="btn ghost push" data-accion="cancelar">Cancelar</button>
        </div>
      </div>`;
    capa.querySelector("#sigTitulo").textContent = titulo;
    const desbordePrevio = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden"; // la página de atrás no se mueve mientras se firma
    const girar = esCelular();
    capa.classList.toggle("girada", girar && vertical());
    document.body.append(capa);
    const girada = () => capa.classList.contains("girada");

    let panel = panelFirma(capa.querySelector("canvas"), existente, { girado: girada });
    let modo = `${girada()}-${innerWidth}x${innerHeight}`;

    // Si cambia el tamaño o la orientación, se rehace el lienzo conservando lo que ya se trazó
    let espera;
    function alCambiar() {
      clearTimeout(espera);
      espera = setTimeout(() => {
        capa.classList.toggle("girada", girar && vertical());
        const nuevo = `${girada()}-${innerWidth}x${innerHeight}`;
        if (nuevo === modo) return;
        modo = nuevo;
        const valor = panel.valor();
        const viejo = capa.querySelector("canvas");
        const lienzo = viejo.cloneNode(false);
        viejo.replaceWith(lienzo);
        panel = panelFirma(lienzo, valor, { girado: girada, conservar: valor !== existente });
      }, 150);
    }
    addEventListener("resize", alCambiar);
    if (girar) girarPantalla().then(alCambiar);

    function cerrar(valor) {
      clearTimeout(espera);
      removeEventListener("resize", alCambiar);
      removeEventListener("keydown", tecla);
      restaurarPantalla();
      document.documentElement.style.overflow = desbordePrevio;
      capa.remove();
      previo?.focus?.({ preventScroll: true });
      resolve(valor);
    }
    const tecla = e => { if (e.key === "Escape") cerrar(null); };
    addEventListener("keydown", tecla);

    capa.addEventListener("click", e => {
      const accion = e.target.closest("[data-accion]")?.dataset.accion;
      if (accion === "cancelar") cerrar(null);
      if (accion === "borrar") { panel.limpiar(); capa.querySelector("#sigAviso").hidden = true; }
      if (accion === "aceptar") {
        const valor = panel.valor();
        if (!valor) { capa.querySelector("#sigAviso").hidden = false; return; }
        cerrar(valor);
      }
    });
  });
}
