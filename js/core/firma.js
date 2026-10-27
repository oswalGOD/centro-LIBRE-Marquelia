// Panel para firmar con el dedo, lápiz o ratón. Devuelve la firma como imagen PNG.

export function panelFirma(canvas, existente = "") {
  const ctx = canvas.getContext("2d");
  let dibujando = false, trazada = false, ultimo = null;

  function preparar() {
    const r = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = ctx.fillStyle = "#1d2b6b";
    if (existente && !trazada) {
      const img = new Image();
      img.onload = () => {
        // La firma guardada está recortada: se dibuja centrada sin deformarla
        const s = Math.min((r.width * 0.8) / img.width, (r.height * 0.7) / img.height);
        const w = img.width * s, h = img.height * s;
        ctx.drawImage(img, (r.width - w) / 2, (r.height - h) / 2 - 10, w, h);
      };
      img.src = existente;
    }
  }
  preparar();

  const punto = e => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    if (!trazada && existente) limpiar();
    dibujando = trazada = true;
    ultimo = punto(e);
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.arc(ultimo[0], ultimo[1], 1.3, 0, Math.PI * 2);
    ctx.fill();
  });
  canvas.addEventListener("pointermove", e => {
    if (!dibujando) return;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(...ultimo);
    ctx.lineTo(...p);
    ctx.stroke();
    ultimo = p;
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => canvas.addEventListener(t, () => (dibujando = false)));

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

/**
 * Abre una ventana para firmar y devuelve la firma aceptada, o null si se canceló.
 * La firma solo se puede trazar dentro de esta ventana: así, desplazarse por el
 * formulario nunca la modifica por accidente.
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
          <button type="button" class="btn" data-accion="borrar">Borrar y volver a firmar</button>
          <button type="button" class="btn ghost push" data-accion="cancelar">Cancelar</button>
        </div>
      </div>`;
    capa.querySelector("#sigTitulo").textContent = titulo;
    document.body.append(capa);
    const desbordePrevio = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden"; // la página de atrás no se mueve mientras se firma
    const panel = panelFirma(capa.querySelector("canvas"), existente);

    function cerrar(valor) {
      document.documentElement.style.overflow = desbordePrevio;
      removeEventListener("keydown", tecla);
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
    capa.querySelector("[data-accion=aceptar]").focus({ preventScroll: true });
  });
}
