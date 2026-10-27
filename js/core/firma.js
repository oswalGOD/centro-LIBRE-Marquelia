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
