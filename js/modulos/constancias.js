// Constancias de participación de un curso: una hoja carta horizontal por usuaria, con el mismo encabezado que el formato de asistencia.
// Se emiten a quienes quedaron registradas en el curso (curso de una sola sesión); se puede exportar una sola o todas en un PDF.

import * as db from "../core/db.js";
import { puedeVer } from "../core/permisos.js";
import { $, $$, esc, plural } from "../core/ui.js";
import { ajustarHojas, conectarExportacion } from "./formato.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = f => `${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]} de ${f.slice(0, 4)}`;
const mayus = s => esc(String(s || "").toUpperCase());
const sinSimbolos = s => String(s).replace(/[\\/:*?"<>|]+/g, "-");

export const folioConstancia = (act, numero) => `${act.folio}-${String(numero).padStart(2, "0")}`;

/** Una hoja de constancia por cada asistente de `filas` ({ x, numero }). */
export function constanciasHTML(act, filas, coordinadora) {
  const horas = `${act.horas} ${Number(act.horas) === 1 ? "hora" : "horas"}`;
  return filas.map(({ x, numero }) => `<div class="sheet-wrap"><article class="sheet constancia" aria-label="Constancia de ${esc(x.datos.nombre)}">
      <img class="logos" src="assets/logos.png" alt="Gobierno de México, Mujeres, PAIBIM, Centro LIBRE para las Mujeres, Gobierno de Guerrero, Secretaría de la Mujer">
      <img class="watermark" src="assets/marca-agua.jpg" alt="">
      <div class="cons-marco">
        <p class="cons-centro">CENTRO LIBRE MARQUELIA</p>
        <h1 class="cons-titulo">CONSTANCIA</h1>
        <p class="cons-texto">Se otorga la presente a</p>
        <p class="cons-nombre">${mayus(x.datos.nombre)}</p>
        ${x.datos.curp ? `<p class="cons-curp">CURP: ${esc(x.datos.curp)}</p>` : ""}
        <p class="cons-texto">por su participación en el curso</p>
        <p class="cons-curso">«${esc(act.nombre)}»</p>
        <p class="cons-texto">con una duración de <b>${esc(horas)}</b>, impartido el ${esc(fechaLarga(act.fecha))} en ${esc(String(act.lugar).replace(/\.+$/, ""))}.</p>
        <div class="cons-firmas">
          <div><span class="linea"></span><b>${mayus(coordinadora)}</b><span>Coordinadora del Centro LIBRE Marquelia</span></div>
          <div><span class="linea"></span><b>${mayus(act.instructora)}</b><span>Instructora</span></div>
        </div>
        <p class="cons-folio">Folio: ${esc(folioConstancia(act, numero))}</p>
      </div>
    </article></div>`).join("");
}

export async function constancias({ yo, pintar, ir }, id) {
  const act = await db.uno("actividades", id);
  if (!act || !act.curso || !puedeVer(yo, act)) return ir(act ? `#/actividad/${id}` : "#/cursos");
  const asis = (await db.todos("asistencias", "actividadId", id)).sort((a, b) => a.orden - b.orden);
  const todas = asis.map((x, i) => ({ x, numero: i + 1 }));
  const coordinadora = (await db.todos("perfiles")).find(u => u.rol === "Coordinadora" && u.activa)?.nombre || "";
  const elegidas = new Set(asis.map(x => x.id));
  const nombreArchivo = sel => sinSimbolos(sel.length === 1 ? `Constancia ${folioConstancia(act, sel[0].numero)} ${sel[0].x.datos.nombre}.pdf` : `Constancias ${act.folio}.pdf`);

  const c = pintar("Constancias", `
    <section class="panel stack">
      <p class="hint"><b>${esc(act.nombre)}</b> · ${esc(act.horas)} h · ${fechaLarga(act.fecha)}. Se emite una constancia a cada persona registrada en el curso. Seleccione a quiénes desea emitirla.</p>
      ${coordinadora ? "" : `<p class="chip warn">No hay una Coordinadora activa en Perfiles; la firma quedará sin nombre.</p>`}
    </section>
    ${asis.length ? `<div class="toolbar"><button class="btn" id="todas">Seleccionar todas</button><button class="btn" id="ninguna">Quitar selección</button></div>
    <div class="list" id="elegir">${todas.map(({ x, numero }) => `
      <label class="row person"><input type="checkbox" data-id="${esc(x.id)}" checked aria-label="Emitir constancia a ${esc(x.datos.nombre)}">
        <span class="num">${numero}</span>
        <span class="body"><span class="name">${esc(x.datos.nombre)}</span><span class="meta"><span class="mono">${esc(x.datos.curp || "Sin CURP")}</span>${x.firma || x.sinFirma ? "" : `<span class="chip warn">Falta firma</span>`}</span></span>
        <button type="button" class="btn" data-sola="${esc(x.id)}">Solo esta</button></label>`).join("")}</div>
    <div id="vista"></div>`
    : `<div class="empty"><b>Aún no hay asistentes.</b><p>Registre a las asistentes del curso para poder emitir sus constancias.</p></div>`}
  `, { atras: `#/actividad/${id}`, ancho: true });
  if (!asis.length) return;

  function vista() {
    const sel = todas.filter(f => elegidas.has(f.x.id));
    const cont = $("#vista", c);
    $$("[data-id]", c).forEach(k => (k.checked = elegidas.has(k.dataset.id)));
    if (!sel.length) { cont.innerHTML = `<p class="hint">Seleccione al menos una persona.</p>`; return; }
    cont.innerHTML = `
      <div class="toolbar no-print">
        <button class="btn primary" id="exportarPDF" disabled>Preparando PDF…</button>
        <a id="bajarPDF" hidden></a>
        <button class="btn" id="imprimir">Imprimir</button>
        <p class="hint">${plural(sel.length, "constancia", "constancias")} · carta horizontal</p>
      </div>
      <div class="sheets" id="hojas">${constanciasHTML(act, sel, coordinadora)}</div>`;
    const hojasEl = $("#hojas", c);
    ajustarHojas(hojasEl);
    conectarExportacion(cont, hojasEl, nombreArchivo(sel), nombreArchivo(sel).replace(/\.pdf$/, ""));
  }
  const alCambiar = () => (document.contains(c) ? $("#hojas", c) && ajustarHojas($("#hojas", c)) : removeEventListener("resize", alCambiar));
  addEventListener("resize", alCambiar);

  $("#elegir", c).addEventListener("change", e => {
    const k = e.target.closest("[data-id]");
    if (!k) return;
    k.checked ? elegidas.add(k.dataset.id) : elegidas.delete(k.dataset.id);
    vista();
  });
  $("#elegir", c).addEventListener("click", e => {
    const b = e.target.closest("[data-sola]");
    if (!b) return;
    e.preventDefault();
    elegidas.clear();
    elegidas.add(b.dataset.sola);
    vista();
    $("#vista", c).scrollIntoView({ block: "start" });
  });
  $("#todas", c).onclick = () => { asis.forEach(x => elegidas.add(x.id)); vista(); };
  $("#ninguna", c).onclick = () => { elegidas.clear(); vista(); };
  vista();
}

export default {
  menu: [],
  rutas: [[/^#\/actividad\/([\w-]+)\/constancias$/, constancias]],
};
