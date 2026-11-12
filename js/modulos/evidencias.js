// Módulo «Evidencias fotográficas»: lista de actividades con su carpeta de fotos,
// carpeta de una actividad y visor de cada foto con su leyenda.

import * as db from "../core/db.js";
import * as ev from "../core/evidencias.js";
import { descargarFoto } from "../core/sync.js";
import { formatoEvidencias } from "./evidencias-formato.js";
import { abrirCamara } from "../core/camara.js";
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
        ${editable ? `<button class="btn primary" id="tomarFotos">Tomar fotografías</button>` : ""}
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

async function carpeta({ yo, pintar, ir }, id) {
  ev.liberarUrls();
  const a = await db.uno("actividades", id);
  if (!a || !puedeVer(yo, a)) return ir("#/evidencias");
  const editable = puedeEditar(yo, a);
  const fotos = await ev.de(id);
  const items = await Promise.all(fotos.map(async f => ({ f, url: await ev.urlDe(f.id) })));
  const c = pintar(`Evidencias · ${a.nombre}`, `
    <section class="panel"><dl class="facts">
      <div><dt>Folio</dt><dd class="mono">${esc(a.folio)}</dd></div>
      <div><dt>Fecha</dt><dd>${fechaLarga(a.fecha)}</dd></div>
      <div><dt>Lugar</dt><dd>${esc(a.lugar)}</dd></div>
      <div><dt>Fotografías</dt><dd>${fotos.length}</dd></div></dl></section>
    <div class="toolbar">
      ${editable ? `<button class="btn primary" id="tomar">Tomar fotografías</button>` : ""}
      ${fotos.length ? `<a class="btn" href="#/actividad/${esc(a.id)}/evidencias/formato">Imprimir o exportar PDF</a>` : ""}
      <a class="btn ghost" href="#/actividad/${esc(a.id)}">Ver actividad</a>
    </div>
    ${fotos.length ? `<div class="evid-grid">${items.map(({ f, url }, i) => `
      <button type="button" class="evid" data-i="${i}" aria-label="Fotografía ${i + 1}${f.leyenda ? `: ${esc(f.leyenda)}` : ""}">
        ${url ? `<img src="${url}" alt="">` : `<span class="evid-falta">${navigator.onLine ? "Descargando…" : "Sin descargar<br><small>Se descargará al abrir con internet</small>"}</span>`}
        <span class="evid-pie"><b>${i + 1}.</b> ${esc(f.leyenda) || "<i>Sin leyenda</i>"}</span>
      </button>`).join("")}</div>`
    : `<div class="empty"><b>Esta carpeta aún no tiene fotografías.</b><p>${editable ? "Seleccione “Tomar fotografías”. Puede tomar varias seguidas." : "La actividad está cerrada."}</p></div>`}`, { atras: "#/evidencias" });

  $("#tomar", c)?.addEventListener("click", async () => { if (await tomarFotos(yo, a)) carpeta({ yo, pintar, ir }, id); });
  // Las fotos tomadas en otros dispositivos se descargan al abrir la carpeta, una por una
  (async () => {
    for (const [i, it] of items.entries()) {
      if (it.url || !(await descargarFoto(it.f))) continue;
      it.url = await ev.urlDe(it.f.id);
      const hueco = $(`.evid[data-i="${i}"] .evid-falta`, c);
      if (it.url && hueco) hueco.outerHTML = `<img src="${it.url}" alt="">`;
    }
  })();
  $$(".evid", c).forEach(b => (b.onclick = () => visor(items, Number(b.dataset.i), { editable, recargar: () => carpeta({ yo, pintar, ir }, id) })));
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
