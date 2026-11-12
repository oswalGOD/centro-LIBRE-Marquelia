// Módulo «Evidencias fotográficas»: lista de actividades con su carpeta de fotos,
// carpeta de una actividad y visor de cada foto con su leyenda.

import * as db from "../core/db.js";
import * as ev from "../core/evidencias.js";
import { descargarFoto } from "../core/sync.js";
import { formatoEvidencias } from "./evidencias-formato.js";
import { abrirCamara, desdeArchivo } from "../core/camara.js";
import { fechaLarga, mesCorto, normalizar } from "../core/catalogos.js";
import { puedeVer, puedeEditar } from "../core/permisos.js";
import { $, $$, esc, aviso, dobleToque, plural } from "../core/ui.js";

const ID = "([\\w-]+)";
const hora = t => new Date(t).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

/** Abre la cámara para tomar fotos de una actividad. Devuelve cuántas se tomaron. */
export async function tomarFotos(yo, actividad) {
  const n = await abrirCamara(foto => ev.agregar(actividad, yo, foto), `Evidencias · ${actividad.nombre}`);
  if (n) aviso(`${plural(n, "fotografía guardada", "fotografías guardadas")}`);
  return n;
}

/**
 * Agrega fotografías de la galería. Se procesan igual que las de la cámara (4:3, 1600 × 1200, JPEG).
 * Debe llamarse directamente desde un toque. Devuelve una promesa con cuántas se agregaron.
 */
export function agregarDeGaleria(yo, actividad) {
  return new Promise(terminar => {
    const entrada = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", multiple: true });
    entrada.style.display = "none";
    document.body.append(entrada);
    const fin = n => { entrada.remove(); terminar(n); };
    entrada.addEventListener("cancel", () => fin(0));
    entrada.addEventListener("change", async () => {
      const archivos = [...entrada.files].filter(f => f.type.startsWith("image/") || !f.type);
      let n = 0, fallidas = 0;
      for (const [i, archivo] of archivos.entries()) {
        aviso(`Procesando fotografía ${i + 1} de ${archivos.length}…`);
        try {
          const modificada = archivo.lastModified > 0 && archivo.lastModified <= Date.now() ? archivo.lastModified + i : Date.now() + i; // conserva el orden de la selección
          await ev.agregar(actividad, yo, await desdeArchivo(archivo), modificada);
          n++;
        } catch { fallidas++; }
      }
      if (n || fallidas) aviso(`${plural(n, "fotografía agregada", "fotografías agregadas")}${fallidas ? ` · ${plural(fallidas, "no se pudo procesar", "no se pudieron procesar")}` : ""}`);
      fin(n);
    });
    entrada.click();
  });
}

/** Sección que se muestra dentro de una actividad abierta: botón para tomar fotos y vista previa de la carpeta. */
export async function seccionActividad(yo, a) {
  const fotos = await ev.de(a.id);
  const editable = puedeEditar(yo, a);
  const mini = await Promise.all(fotos.slice(-4).map(async f => ({ f, url: await ev.urlDe(f.id) })));
  return `
    <section class="panel stack">
      <div class="section-head"><h2 class="h3">Evidencias fotográficas</h2>
        <div class="stats"><span><b>${fotos.length}</b> ${fotos.length === 1 ? "fotografía" : "fotografías"}</span></div></div>
      ${mini.length ? `<a class="evid-mini" href="#/actividad/${esc(a.id)}/evidencias" aria-label="Abrir la carpeta de evidencias">${mini.map(m => m.url ? `<img src="${m.url}" alt="">` : `<span class="evid-falta" aria-hidden="true"></span>`).join("")}</a>` : `<p class="hint">Aún no hay fotografías en esta actividad.${editable ? "" : " La actividad está cerrada."}</p>`}
      <div class="actions">
        ${editable ? `<button class="btn primary" id="tomarFotos">Tomar fotografías</button><button class="btn" id="desdeGaleria">Agregar de la galería</button>` : ""}
        <a class="btn" href="#/actividad/${esc(a.id)}/evidencias">Abrir carpeta de evidencias</a>
      </div>
    </section>`;
}

async function lista({ yo, pintar }) {
  const acts = (await db.todos("actividades")).filter(a => puedeVer(yo, a)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
  const cuenta = await ev.conteos();
  const total = acts.reduce((s, a) => s + (cuenta[a.id] || 0), 0);
  const c = pintar("Evidencias fotográficas", `
    <p class="hint">Cada actividad tiene su carpeta de fotografías. Se toman en proporción 4:3 en cualquier dispositivo, para que después se impriman ordenadas. ${plural(total, "fotografía en total", "fotografías en total")}.</p>
    ${acts.length > 6 ? `<input type="search" id="buscar" class="search" placeholder="Buscar por nombre, folio o lugar" aria-label="Buscar actividad">` : ""}
    ${acts.length ? `<div class="list" id="lista">${acts.map(a => `
      <a class="row" href="#/actividad/${esc(a.id)}/evidencias" data-buscar="${esc(normalizar(`${a.nombre} ${a.folio} ${a.lugar} ${a.tipo}`))}">
        <span class="date"><b>${Number(a.fecha.slice(8, 10))}</b><small>${mesCorto(a.fecha)}</small></span>
        <span class="body"><span class="name">${esc(a.nombre)}</span><span class="meta"><span>${esc(a.folio)}</span><span>${esc(a.tipo)}</span><span>${esc(a.lugar)}</span></span></span>
        <span class="end"><span class="big">${cuenta[a.id] || 0}</span><small>fotografías</small></span>
      </a>`).join("")}</div>`
    : `<div class="empty"><b>Aún no hay actividades.</b><p>Las evidencias se guardan dentro de una actividad. Cree primero la actividad en “Listas de asistencia”.</p></div>`}`);
  $("#buscar", c)?.addEventListener("input", e => {
    const q = normalizar(e.target.value);
    $$("#lista .row", c).forEach(r => (r.hidden = !r.dataset.buscar.includes(q)));
  });
}

async function carpeta({ yo, pintar, ir }, id, ordenando = false) {
  ev.liberarUrls();
  const a = await db.uno("actividades", id);
  if (!a || !puedeVer(yo, a)) return ir("#/evidencias");
  const editable = puedeEditar(yo, a);
  const fotos = await ev.de(id);
  ordenando = ordenando && editable && fotos.length > 1;
  const items = await Promise.all(fotos.map(async f => ({ f, url: await ev.urlDe(f.id) })));
  const c = pintar(`Evidencias ·${a.nombre}`, `
    <section class="panel"><dl class="facts">
      <div><dt>Folio</dt><dd class="mono">${esc(a.folio)}</dd></div>
      <div><dt>Fecha</dt><dd>${fechaLarga(a.fecha)}</dd></div>
      <div><dt>Lugar</dt><dd>${esc(a.lugar)}</dd></div>
      <div><dt>Fotografías</dt><dd>${fotos.length}</dd></div></dl></section>
    <div class="toolbar">
      ${editable ? `<button class="btn primary" id="tomar">Tomar fotografías</button><button class="btn" id="desdeGaleria">Agregar de la galería</button>` : ""}
      ${editable && fotos.length > 1 ? `<button class="btn" id="reordenar">${ordenando ? "Terminar de reordenar" : "Reordenar"}</button>` : ""}
      ${fotos.length ? `<a class="btn" href="#/actividad/${esc(a.id)}/evidencias/formato">Imprimir o exportar PDF</a>` : ""}
      <a class="btn ghost" href="#/actividad/${esc(a.id)}">Ver actividad</a>
    </div>
    ${ordenando ? `<p class="hint">Use las flechas para mover cada fotografía. Este es el orden en que saldrán en el PDF.</p>` : ""}
    ${fotos.length ? `<div class="evid-grid">${items.map(({ f, url }, i) => {
      const cuerpo = `${url ? `<img src="${url}" alt="">` : `<span class="evid-falta">${navigator.onLine ? "Descargando…" : "Sin descargar<br><small>Se descargará al abrir con internet</small>"}</span>`}
        <span class="evid-pie"><b>${i + 1}.</b> ${esc(f.leyenda) || "<i>Sin leyenda</i>"}</span>`;
      return ordenando
        ? `<div class="evid ordenando" data-i="${i}">${cuerpo}
          <span class="evid-mover">
            <button type="button" class="btn" data-mover="-1" data-id="${esc(f.id)}" aria-label="Mover la fotografía ${i + 1} antes" ${i === 0 ? "disabled" : ""}>◀</button>
            <button type="button" class="btn" data-mover="1" data-id="${esc(f.id)}" aria-label="Mover la fotografía ${i + 1} después" ${i === fotos.length - 1 ? "disabled" : ""}>▶</button>
          </span></div>`
        : `<button type="button" class="evid" data-i="${i}" aria-label="Fotografía ${i + 1}${f.leyenda ? `: ${esc(f.leyenda)}` : ""}">${cuerpo}</button>`;
    }).join("")}</div>`
    : `<div class="empty"><b>Esta carpeta aún no tiene fotografías.</b><p>${editable ? "Seleccione “Tomar fotografías” (puede tomar varias seguidas) o “Agregar de la galería”." : "La actividad está cerrada."}</p></div>`}`, { atras: "#/evidencias" });

  $("#tomar", c)?.addEventListener("click", async () => { if (await tomarFotos(yo, a)) carpeta({ yo, pintar, ir }, id); });
  $("#desdeGaleria", c)?.addEventListener("click", async () => { if (await agregarDeGaleria(yo, a)) carpeta({ yo, pintar, ir }, id); });
  // Las fotos tomadas en otros dispositivos se descargan al abrir la carpeta, una por una
  (async () => {
    for (const [i, it] of items.entries()) {
      if (it.url || !(await descargarFoto(it.f))) continue;
      it.url = await ev.urlDe(it.f.id);
      const hueco = $(`.evid[data-i="${i}"] .evid-falta`, c);
      if (it.url && hueco) hueco.outerHTML = `<img src="${it.url}" alt="">`;
    }
  })();
  $("#reordenar", c)?.addEventListener("click", () => carpeta({ yo, pintar, ir }, id, !ordenando));
  $$("[data-mover]", c).forEach(b => b.addEventListener("click", async () => {
    const y = window.scrollY;
    await ev.mover(id, b.dataset.id, Number(b.dataset.mover));
    await carpeta({ yo, pintar, ir }, id, true);
    window.scrollTo(0, y);
  }));
  $$("button.evid", c).forEach(b => (b.onclick = () => visor(items, Number(b.dataset.i), { editable, recargar: () => carpeta({ yo, pintar, ir }, id) })));
}

/** Foto en grande, con su leyenda, quién la tomó y cuándo. Permite recorrer la carpeta. */
function visor(items, i, { editable, recargar }) {
  let cambios = false;
  const capa = document.createElement("div");
  capa.className = "camara visor";
  capa.setAttribute("role", "dialog");
  capa.setAttribute("aria-modal", "true");
  capa.setAttribute("aria-label", "Fotografía");
  document.body.append(capa);
  document.body.classList.add("con-camara");

  function pintarFoto() {
    const { f, url } = items[i];
    capa.innerHTML = `
      <div class="camara-caja">
        <h2 class="h3">Fotografía ${i + 1} de ${items.length}</h2>
        <div class="camara-visor">${url ? `<img src="${url}" alt="${esc(f.leyenda || `Fotografía ${i + 1}`)}">` : `<span class="evid-falta">Foto sin descargar en este dispositivo</span>`}</div>
        <p class="hint">Tomada por ${esc(f.tomadaPorNombre || "—")} · ${hora(f.tomadaEn)}</p>
        <div class="field"><label for="leyenda">Leyenda (opcional, aparecerá bajo la foto al imprimir)</label>
          <input id="leyenda" maxlength="140" value="${esc(f.leyenda || "")}" ${editable ? "" : "disabled"}></div>
        <div class="camara-botones">
          <button type="button" class="btn" data-ant ${i === 0 ? "disabled" : ""}>← Anterior</button>
          <button type="button" class="btn" data-sig ${i === items.length - 1 ? "disabled" : ""}>Siguiente →</button>
          ${editable ? `<button type="button" class="btn primary" data-guardar>Guardar leyenda</button><button type="button" class="btn danger" data-quitar>Eliminar foto</button>` : ""}
          <button type="button" class="btn ghost" data-cerrar>Cerrar</button>
        </div>
      </div>`;
    const q = s => capa.querySelector(s);
    q("[data-ant]").onclick = () => { i--; pintarFoto(); };
    q("[data-sig]").onclick = () => { i++; pintarFoto(); };
    q("[data-cerrar]").onclick = cerrar;
    q("[data-guardar]")?.addEventListener("click", async () => {
      await ev.cambiarLeyenda(f.id, q("#leyenda").value);
      cambios = true;
      aviso("Leyenda guardada");
      cerrar();
    });
    const quitar = q("[data-quitar]");
    if (quitar) dobleToque(quitar, "Toque nuevamente para eliminar la foto", async () => {
      await ev.quitar(f.id);
      cambios = true;
      aviso("Fotografía eliminada");
      cerrar();
    });
  }
  const tecla = e => e.key === "Escape" && cerrar();
  function cerrar() {
    document.removeEventListener("keydown", tecla);
    capa.remove();
    document.body.classList.remove("con-camara");
    if (cambios) recargar();
  }
  document.addEventListener("keydown", tecla);
  pintarFoto();
}

export default {
  menu: [],
  rutas: [
    [/^#\/evidencias$/, lista],
    [new RegExp(`^#/actividad/${ID}/evidencias$`), carpeta],
    [new RegExp(`^#/actividad/${ID}/evidencias/formato$`), formatoEvidencias],
  ],
};
