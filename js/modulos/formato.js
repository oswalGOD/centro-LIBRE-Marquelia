// Formato oficial "Lista de asistencia" en hoja carta horizontal, listo para imprimir o guardar en PDF.
// 10 personas por hoja; cada hoja lleva su propio resumen por grupo, rango de edad y sexo.

import * as db from "../core/db.js";
import { GRUPOS, RANGOS, edad, rangoDe, fechaCorta } from "../core/catalogos.js";
import { puedeVer } from "../core/permisos.js";
import { $, $$, esc, plural } from "../core/ui.js";

export const POR_HOJA = 10;
const ANCHO = 1056, ALTO = 816; // 11 × 8.5 pulgadas a 96 dpi

const mayus = s => esc(String(s || "").toUpperCase());

function resumen(filas, fecha) {
  return GRUPOS.map(([g, nombre]) => {
    const del = filas.filter(x => x.datos.grupo === g);
    const n = (r, s) => del.filter(x => rangoDe(edad(x.datos.fnac, fecha)) === r && x.datos.sexo === s).length || "";
    return `<table><colgroup><col style="width:34%"><col><col><col></colgroup>
      <tr><th class="band" colspan="4">${mayus(nombre)}</th></tr>
      <tr><td>GRUPO ETARIO</td><td>MUJERES</td><td>HOMBRES</td><td>OTROS</td></tr>
      ${RANGOS.map(([r, t]) => `<tr><td>${t}</td><td class="n">${n(r, "M")}</td><td class="n">${n(r, "H")}</td><td class="n">${n(r, "Otro")}</td></tr>`).join("")}
      <tr><td colspan="3" class="l">TOTAL DE PERSONAS ATENDIDAS:</td><td class="n">${del.length || ""}</td></tr></table>`;
  }).join("");
}

const encabezado = act => `
      <img class="logos" src="assets/logos.png" alt="Gobierno de México, Mujeres, PAIBIM, Centro LIBRE para las Mujeres, Gobierno de Guerrero, Secretaría de la Mujer">
      <img class="watermark" src="assets/marca-agua.jpg" alt="">
      <table class="hdr"><colgroup><col style="width:48%"><col style="width:12.5%"><col style="width:26%"><col style="width:13.5%"></colgroup>
        <tr class="h-title"><td>CENTRO LIBRE MARQUELIA</td><td colspan="3">LISTA DE ASISTENCIA</td></tr>
        <tr class="h-row"><td>Nombre de la actividad: <b>${esc(act.nombre)}</b></td><td>Fecha: <b>${fechaCorta(act.fecha)}</b></td><td colspan="2">Lugar de desarrollo: <b>${esc(act.lugar)}</b></td></tr>
        <tr class="h-row"><td>Facilitadora: <b>${esc(act.facilitadora)}</b></td><td colspan="3">Puesto: <b>${esc(act.puesto)}</b></td></tr>
        <tr class="h-row"><td colspan="3">Tipo de actividad: <b>${esc(act.tipo)}</b></td><td>Folio: <b>${esc(act.folio)}</b></td></tr>
      </table>`;

export function hojasHTML(act, asistencias) {
  const hojas = Math.max(1, Math.ceil(asistencias.length / POR_HOJA));
  let html = "";
  for (let h = 0; h < hojas; h++) {
    const filas = asistencias.slice(h * POR_HOJA, (h + 1) * POR_HOJA);
    const renglones = Array.from({ length: POR_HOJA }, (_, i) => {
      const x = filas[i];
      if (!x) return `<tr>${"<td></td>".repeat(11)}</tr>`;
      const p = x.datos;
      return `<tr><td>${h * POR_HOJA + i + 1}</td><td class="curp">${p.curp ? esc(p.curp) : "SIN CURP"}</td><td class="l">${mayus(p.nombre)}</td>
        <td>${fechaCorta(p.fnac)}</td><td>${esc(p.sexo)}</td><td>${mayus(p.lugar)}</td><td>${esc(p.grupo)}</td><td>${rangoDe(edad(p.fnac, act.fecha)) || ""}</td>
        <td>${mayus(p.ocupacion)}</td><td>${esc(p.telefono)}</td><td>${x.firma ? `<img src="${x.firma}" alt="">` : ""}</td></tr>`;
    }).join("");
    html += `<div class="sheet-wrap"><article class="sheet" aria-label="Hoja ${h + 1} de ${hojas}">${encabezado(act)}
      <div class="lead">Su información es muy importante para nosotras/os, favor de escribir todos sus datos completos, sin abreviaturas y con letra legible de molde. No dejar espacios en blanco</div>
      <table class="main"><colgroup><col style="width:2.9%"><col style="width:17.1%"><col style="width:19.7%"><col style="width:7.9%"><col style="width:3.8%"><col style="width:9.3%"><col style="width:8.7%"><col style="width:7.2%"><col style="width:7.4%"><col style="width:7.2%"><col style="width:8.8%"></colgroup>
        <tr><th class="l">No.</th><th>CURP</th><th>Nombre completo</th><th>Fecha de nacimiento</th><th>Sexo<br><br>M<br>H<br>Otro</th><th>Lugar de nacimiento</th>
          <th class="l"><span class="leg">Grupo<br>${GRUPOS.map(g => `${g[0]}) ${g[1]}`).join("<br>")}</span></th>
          <th class="l"><span class="leg">Rango de edad<br>${RANGOS.map(r => `${r[0]}) ${r[1]}`).join("<br>")}</span></th>
          <th>Ocupación</th><th>Teléfono</th><th>Firma</th></tr>
        ${renglones}
      </table>
      <div class="summary">${resumen(filas, act.fecha)}
        <div class="total"><span>Total de participantes</span><span class="big">${filas.length}</span><span>Pág. ${h + 1} de ${hojas}</span></div>
      </div>
      <img class="pie" src="assets/pie.png" alt="Aviso de privacidad simplificado de la Secretaría de la Mujer de Guerrero">
    </article></div>`;
  }
  return html;
}

/** Hoja aparte con las notas de la actividad, con el mismo encabezado que la lista. */
export function hojaNotasHTML(act) {
  if (!act.notas) return "";
  return `<div class="sheet-wrap"><article class="sheet notas-hoja" aria-label="Notas de la actividad">${encabezado(act)}
      <div class="notas-titulo">NOTAS DE LA ACTIVIDAD</div>
      <div class="notas-cuerpo">${esc(act.notas)}</div>
      <img class="pie" src="assets/pie.png" alt="Aviso de privacidad simplificado de la Secretaría de la Mujer de Guerrero">
    </article></div>`;
}

export function ajustarHojas(contenedor) {
  $$(".sheet-wrap", contenedor).forEach(w => {
    const s = Math.min(1, w.clientWidth / ANCHO);
    w.firstElementChild.style.transform = `scale(${s})`;
    w.style.height = `${ALTO * s}px`;
  });
}

export async function formato({ yo, pintar, ir }, id) {
  const act = await db.uno("actividades", id);
  if (!act || !puedeVer(yo, act)) return ir("#/");
  const asis = (await db.todos("asistencias", "actividadId", id)).sort((a, b) => a.orden - b.orden);
  const hojas = Math.max(1, Math.ceil(asis.length / POR_HOJA)) + (act.notas ? 1 : 0);
  const sinFirma = asis.filter(x => !x.firma).length;
  const c = pintar("Formato para imprimir", `
    <div class="toolbar no-print">
      <button class="btn primary" id="imprimir">Imprimir o guardar PDF</button>
      <p class="hint">${plural(hojas, "hoja", "hojas")} · ${plural(asis.length, "asistente", "asistentes")} · carta horizontal${act.notas ? " · incluye la hoja de notas" : ""}${sinFirma ? ` · <span class="chip warn">${sinFirma} sin firma</span>` : ""}</p>
    </div>
    <p class="hint no-print">En el cuadro de impresión elige tamaño <b>Carta</b>, orientación <b>Horizontal</b> y márgenes <b>Ninguno</b>. Para guardar en PDF, elige “Guardar como PDF” como impresora.</p>
    <div class="sheets" id="hojas">${hojasHTML(act, asis)}${hojaNotasHTML(act)}</div>
  `, { atras: `#/actividad/${id}`, ancho: true });
  const hojasEl = $("#hojas", c);
  ajustarHojas(hojasEl);
  const alCambiar = () => (document.contains(hojasEl) ? ajustarHojas(hojasEl) : removeEventListener("resize", alCambiar));
  addEventListener("resize", alCambiar);
  $("#imprimir", c).onclick = () => {
    const titulo = document.title;
    document.title = `Lista de asistencia ${act.folio}`; // nombre sugerido del PDF
    window.print();
    setTimeout(() => (document.title = titulo), 1000);
  };
}
