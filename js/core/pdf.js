// PDF sin librerías y sin conexión: cada hoja del formato se dibuja como imagen y se empaqueta en un PDF carta horizontal.
// Se usa porque window.print() no ofrece "Guardar como PDF" en la app instalada de iPad/iPhone.

const PT_ANCHO = 792, PT_ALTO = 612; // carta horizontal en puntos

const codificar = txt => new TextEncoder().encode(txt);

/** Arma un PDF a partir de páginas JPEG: [{ datos: Uint8Array, ancho, alto }]. */
export function armarPDF(paginas) {
  const partes = [];
  const posiciones = [];
  let largo = 0;
  const agregar = p => { const b = typeof p === "string" ? codificar(p) : p; partes.push(b); largo += b.length; };
  const objeto = (n, cuerpo) => { posiciones[n] = largo; agregar(`${n} 0 obj\n`); agregar(cuerpo); agregar("\nendobj\n"); };

  agregar("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const total = paginas.length;
  const idPagina = i => 3 + i * 3, idContenido = i => 4 + i * 3, idImagen = i => 5 + i * 3;
  objeto(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objeto(2, `<< /Type /Pages /Count ${total} /Kids [${paginas.map((_, i) => `${idPagina(i)} 0 R`).join(" ")}] >>`);
  paginas.forEach((p, i) => {
    objeto(idPagina(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PT_ANCHO} ${PT_ALTO}] /Resources << /XObject << /Im0 ${idImagen(i)} 0 R >> >> /Contents ${idContenido(i)} 0 R >>`);
    const flujo = `q ${PT_ANCHO} 0 0 ${PT_ALTO} 0 0 cm /Im0 Do Q`;
    objeto(idContenido(i), `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
    posiciones[idImagen(i)] = largo;
    agregar(`${idImagen(i)} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.ancho} /Height ${p.alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.datos.length} >>\nstream\n`);
    agregar(p.datos);
    agregar("\nendstream\nendobj\n");
  });
  const n = 3 + total * 3;
  const inicioXref = largo;
  let xref = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) xref += `${String(posiciones[i]).padStart(10, "0")} 00000 n \n`;
  agregar(xref + `trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);
  return new Blob(partes, { type: "application/pdf" });
}

const aDataURL = blob => new Promise((ok, mal) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => mal(r.error); r.readAsDataURL(blob); });

async function incrustar(url) {
  if (!url || url.startsWith("data:")) return url;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`No se pudo leer ${url}`);
  return aDataURL(await r.blob());
}

/** CSS de la hoja (reglas de .sheet) y tipografías incrustadas, para dibujarla aislada dentro de una imagen SVG. */
async function estilosHoja() {
  let css = "";
  for (const hoja of document.styleSheets) {
    let reglas;
    try { reglas = hoja.cssRules; } catch { continue; }
    for (const r of reglas) {
      if (r.type === CSSRule.FONT_FACE_RULE) {
        const base = hoja.href || location.href;
        let texto = r.cssText;
        for (const m of [...texto.matchAll(/url\(["']?([^"')]+)["']?\)/g)]) {
          if (m[1].startsWith("data:")) continue;
          texto = texto.replace(m[0], `url(${await incrustar(new URL(m[1], base).href)})`);
        }
        css += texto + "\n";
      } else if (r.type === CSSRule.STYLE_RULE && (r.selectorText === "*" || r.selectorText === "img" || /\.sheet/.test(r.selectorText))) css += r.cssText + "\n";
    }
  }
  return css;
}

function cargarImagen(src) {
  return new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error("No se pudo dibujar la hoja")); i.src = src; });
}

/** Convierte cada .sheet de un contenedor en un PDF carta horizontal. Devuelve un Blob. */
export async function hojasAPDF(contenedor, { escala = 3, calidad = 0.92 } = {}) {
  const hojas = [...contenedor.querySelectorAll(".sheet")];
  if (!hojas.length) throw new Error("No hay hojas para convertir");
  if (document.fonts?.ready) await document.fonts.ready;
  const css = await estilosHoja();
  const vars = getComputedStyle(hojas[0]);
  const variables = ["--paper", "--paper-ink", "--paper-band", "--f-sheet"].map(v => `${v}:${vars.getPropertyValue(v)}`).join(";").replace(/"/g, "&quot;");
  const ancho = 1056, alto = 816;
  const paginas = [];
  // Todas las medidas se toman de una sola vez y antes de cualquier espera: si se midiera hoja por hoja entre esperas
  // (carga de imágenes), un cambio de la pantalla (aviso, desplazamiento) movería firmas y QR de las hojas posteriores.
  await Promise.all([...contenedor.querySelectorAll(".sheet img")].map(i => i.decode?.().catch(() => {})));
  const medidas = hojas.map(hoja => {
    const k = hoja.getBoundingClientRect().width / hoja.offsetWidth || 1, r0 = hoja.getBoundingClientRect();
    return [...hoja.querySelectorAll("img")].map(o => {
      const r = o.getBoundingClientRect(), cs = getComputedStyle(o);
      const bi = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), bd = parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight);
      const bs = parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop), bb = parseFloat(cs.borderBottomWidth) + parseFloat(cs.paddingBottom);
      return {
        src: o.getAttribute("src"), bi, bd, bs, bb, ancho: r.width / k, alto: r.height / k, cajaBorde: cs.boxSizing === "border-box",
        caja: { x: (r.left - r0.left) / k + bi, y: (r.top - r0.top) / k + bs, w: r.width / k - bi - bd, h: r.height / k - bs - bb },
        debajo: cs.position === "absolute", opacidad: parseFloat(cs.opacity) || 1, ajuste: cs.objectFit,
        nitida: cs.imageRendering === "pixelated" || cs.imageRendering === "crisp-edges"
      };
    });
  });
  const VACIA = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
  for (const hoja of hojas) {
    const copia = hoja.cloneNode(true);
    copia.style.transform = "none";
    // Safari (iPad/iPhone) no dibuja las imágenes de una imagen SVG con foreignObject (firmas, QR, fotos).
    // Por eso se dejan huecos del mismo tamaño y las imágenes se pintan después directamente en el lienzo.
    const clones = [...copia.querySelectorAll("img")];
    const pendientes = [];
    copia.style.background = "transparent"; // el blanco de la hoja se pinta en el lienzo, para poder poner la marca de agua debajo
    // Todas las imágenes (logotipos, marca de agua, firmas, QR, fotos) se pintan en el lienzo: una imagen SVG nunca
    // carga archivos externos y Safari tampoco dibuja las incrustadas. La marca de agua va debajo del contenido.
    for (let i = 0; i < clones.length; i++) {
      const m = medidas[hojas.indexOf(hoja)][i], c = clones[i], { caja } = m;
      c.style.width = `${m.ancho - (m.cajaBorde ? 0 : m.bi + m.bd)}px`;
      c.style.height = `${m.alto - (m.cajaBorde ? 0 : m.bs + m.bb)}px`;
      c.style.maxWidth = c.style.maxHeight = "none";
      c.style.objectFit = "fill";
      c.setAttribute("src", VACIA);
      if (!m.src || caja.w <= 0 || caja.h <= 0) continue;
      pendientes.push({ caja, debajo: m.debajo, opacidad: m.opacidad, ajuste: m.ajuste, nitida: m.nitida, img: cargarImagen(await incrustar(m.src)).catch(() => null) });
    }
    const xhtml = new XMLSerializer().serializeToString(copia);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="${variables};width:${ancho}px;height:${alto}px"><style>${css.replace(/</g, "\\3c ")}</style>${xhtml}</div></foreignObject></svg>`;
    const imagen = await cargarImagen("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
    const lienzo = Object.assign(document.createElement("canvas"), { width: ancho * escala, height: alto * escala });
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    const pintar = async ({ caja, ajuste, nitida, opacidad, img: promesa }) => {
      const im = await promesa;
      if (!im || !im.naturalWidth) return;
      let { x, y, w, h } = caja, dx = x, dy = y, dw = w, dh = h;
      if (ajuste === "cover" || ajuste === "contain") {
        const f = (ajuste === "cover" ? Math.max : Math.min)(w / im.naturalWidth, h / im.naturalHeight);
        dw = im.naturalWidth * f; dh = im.naturalHeight * f; dx = x + (w - dw) / 2; dy = y + (h - dh) / 2;
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(x * escala, y * escala, w * escala, h * escala); ctx.clip();
      ctx.globalAlpha = opacidad;
      ctx.imageSmoothingEnabled = !nitida;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(im, dx * escala, dy * escala, dw * escala, dh * escala);
      ctx.restore();
    };
    for (const p of pendientes.filter(p => p.debajo)) await pintar(p);
    ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
    for (const p of pendientes.filter(p => !p.debajo)) await pintar(p);
    const jpeg = await new Promise(ok => lienzo.toBlob(ok, "image/jpeg", calidad));
    if (!jpeg) throw new Error("No se pudo generar la imagen de la hoja");
    paginas.push({ datos: new Uint8Array(await jpeg.arrayBuffer()), ancho: lienzo.width, alto: lienzo.height });
  }
  return armarPDF(paginas);
}
