// Formato de evidencias fotográficas: hojas carta horizontal con el encabezado oficial y 6 fotografías 4:3 por hoja
// (3 columnas × 2 filas), cada una con su número y su leyenda. Se puede imprimir o exportar a PDF.

import * as db from "../core/db.js";
import * as ev from "../core/evidencias.js";
import { descargarFoto } from "../core/sync.js";
import { puedeVer } from "../core/permisos.js";
import { $, esc, plural, aviso } from "../core/ui.js";
import { encabezado, ajustarHojas, conectarExportacion } from "./formato.js";

export const FOTOS_POR_HOJA = 6;

/** Reduce la foto a 640 × 480 (el doble de su tamaño en la hoja) para que la hoja y el PDF no pesen de más. */
async function miniatura(blob) {
  const imagen = await createImageBitmap(blob);
  const lienzo = Object.assign(document.createElement("canvas"), { width: 640, height: 480 });
  lienzo.getContext("2d").drawImage(imagen, 0, 0, 640, 480);
  imagen.close?.();
  return lienzo.toDataURL("image/jpeg", 0.85);
}

export function hojasEvidenciasHTML(act, items) {
  const hojas = Math.max(1, Math.ceil(items.length / FOTOS_POR_HOJA));
  let html = "";
  for (let h = 0; h < hojas; h++) {
    const fotos = items.slice(h * FOTOS_POR_HOJA, (h + 1) * FOTOS_POR_HOJA);
    html += `<div class="sheet-wrap"><article class="sheet evid-hoja" aria-label="Hoja ${h + 1} de ${hojas}">${encabezado(act, "EVIDENCIAS FOTOGRÁFICAS")}
      <div class="evid-rejilla">${fotos.map(({ f, src }, i) => `
        <figure class="evid-foto">
          ${src ? `<img src="${src}" alt="Fotografía ${h * FOTOS_POR_HOJA + i + 1}">` : `<div class="sin-foto">Fotografía no disponible en este dispositivo</div>`}
          <figcaption><b>${h * FOTOS_POR_HOJA + i + 1}.</b> ${esc(f.leyenda || "")}</figcaption>
        </figure>`).join("")}</div>
      <div class="evid-pagina">Hoja ${h + 1} de ${hojas} · ${plural(items.length, "fotografía", "fotografías")}</div>
      <img class="pie" src="assets/pie.png" alt="Aviso de privacidad simplificado de la Secretaría de la Mujer de Guerrero">
    </article></div>`;
  }
  return html;
}

export async function formatoEvidencias({ yo, pintar, ir }, id) {
  ev.liberarUrls();
  const act = await db.uno("actividades", id);
  if (!act || !puedeVer(yo, act)) return ir("#/evidencias");
  const fotos = await ev.de(id);
  if (!fotos.length) return ir(`#/actividad/${id}/evidencias`);
  aviso("Preparando fotografías…");
  const items = [];
  for (const f of fotos) {
    let registro = await db.fotoLocal(f.id);
    if (!registro?.blob && (await descargarFoto(f))) registro = await db.fotoLocal(f.id);
    let src = null;
    try { src = registro?.blob ? await miniatura(registro.blob) : null; } catch { src = null; }
    items.push({ f, src });
  }
  const faltan = items.filter(x => !x.src).length;
  const hojas = Math.max(1, Math.ceil(items.length / FOTOS_POR_HOJA));
  const c = pintar("Evidencias para imprimir", `
    <div class="toolbar no-print">
      <button class="btn primary" id="exportarPDF" disabled>Preparando PDF…</button>
      <a id="bajarPDF" hidden></a>
      <button class="btn" id="imprimir">Imprimir</button>
      <p class="hint">${plural(hojas, "hoja", "hojas")} · ${plural(items.length, "fotografía", "fotografías")} · carta horizontal${faltan ? ` · <span class="chip warn">${plural(faltan, "foto sin descargar", "fotos sin descargar")}</span>` : ""}</p>
    </div>
    ${faltan ? `<p class="hint no-print">Algunas fotografías fueron tomadas en otro dispositivo y aún no se descargan aquí. Conéctese a internet y vuelva a abrir esta pantalla para incluirlas.</p>` : ""}
    <p class="hint no-print">En el cuadro de impresión, seleccione tamaño <b>Carta</b>, orientación <b>Horizontal</b> y márgenes <b>Ninguno</b>. Toque “Exportar PDF” cuando esté listo: en iPad, iPhone y Android se abre el menú para guardarlo o compartirlo; en computadora se descarga el archivo.</p>
    <div class="sheets" id="hojas">${hojasEvidenciasHTML(act, items)}</div>
  `, { atras: `#/actividad/${id}/evidencias`, ancho: true });
  const hojasEl = $("#hojas", c);
  ajustarHojas(hojasEl);
  const alCambiar = () => (document.contains(hojasEl) ? ajustarHojas(hojasEl) : removeEventListener("resize", alCambiar));
  addEventListener("resize", alCambiar);
  const nombrePDF = `Evidencias fotográficas ${act.folio}.pdf`.replace(/[\\/:*?"<>|]+/g, "-");
  conectarExportacion(c, hojasEl, nombrePDF, `Evidencias fotográficas ${act.folio}`);
}
