// «Anexo 2: Formato Lista de Asistencia de Participantes» de un curso, en carta horizontal (Componente C5 A1).
// Reproduce el formato oficial: 8 renglones en la primera hoja (lleva los datos del curso) y 14 en las siguientes.

import * as db from "../core/db.js";
import { botonIcono } from "../core/iconos.js";
import { edad } from "../core/catalogos.js";
import { puedeVer } from "../core/permisos.js";
import { $, esc, plural } from "../core/ui.js";
import { ajustarHojas, conectarExportacion } from "./formato.js";

export const MUNICIPIO = "Marquelia";
export const CENTRO = "Centro LIBRE Marquelia";
export const RENGLONES_PRIMERA = 8, RENGLONES_SIGUIENTES = 14;
const ADULTA_MAYOR = 60; // edad desde la que se considera persona adulta mayor
const sinSimbolos = s => String(s).replace(/[\\/:*?"<>|]+/g, "-");
const mayus = s => esc(String(s || "").toUpperCase());

const FECHA = f => (f ? `${f.slice(8, 10)} / ${f.slice(5, 7)} / ${f.slice(0, 4)}` : "");
const HORAS = h => (h ? `${h} ${Number(h) === 1 ? "hora" : "horas"}` : "");
const HORARIO = a => (a.horaInicio && a.horaFin ? `${a.horaInicio} a ${a.horaFin} h` : "");

/** Valor de la columna «Tipo de población vulnerable»: «Indígena» (grupo B) y/o «Adulta mayor» (60 años o más). */
export function poblacion(datos, fecha) {
  const t = [];
  if (datos.grupo === "B") t.push("Indígena");
  const e = edad(datos.fnac, fecha);
  if (e !== null && e !== undefined && e >= ADULTA_MAYOR) t.push("Adulta mayor");
  return t.join(" y ");
}

/** Reparte las asistencias en hojas: 8 en la primera y 14 en cada una de las siguientes. */
export function repartir(n) {
  const hojas = [[0, RENGLONES_PRIMERA]];
  for (let i = RENGLONES_PRIMERA; i < n; i += RENGLONES_SIGUIENTES) hojas.push([i, i + RENGLONES_SIGUIENTES]);
  return hojas;
}

const encabezadoHoja = () => `
      <img class="a2-banner" src="assets/anexo2-encabezado.png" alt="Gobierno de México, Mujeres, PAIBIM, Centro LIBRE para las Mujeres, Gobierno de Guerrero, Secretaría de la Mujer">
      <p class="a2-prog">Programa de Atención Integral para el Bienestar de las Mujeres 2026</p>`;

const campo = (etiqueta, valor, cls = "") => `<tr${cls ? ` class="${cls}"` : ""}><th>${etiqueta}</th><td>${valor ? esc(valor) : ""}</td></tr>`;

export function anexo2HTML(act, asistencias) {
  const hojas = repartir(asistencias.length);
  return hojas.map(([desde, hasta], h) => {
    const renglones = Array.from({ length: hasta - desde }, (_, i) => {
      const x = asistencias[desde + i], n = desde + i + 1;
      if (!x) return `<tr><td>${n}</td><td></td><td></td><td></td><td></td><td></td></tr>`;
      const p = x.datos, e = edad(p.fnac, act.fecha);
      return `<tr><td>${n}</td><td class="l">${mayus(p.nombre)}</td><td>${e ?? ""}</td><td>${esc(poblacion(p, act.fecha))}</td><td>${esc(p.telefono || "")}</td>
        <td>${x.firma ? `<img src="${esc(x.firma)}" alt="">` : x.sinFirma ? `<span class="sinfirma">${esc(x.sinFirma)}</span>` : ""}</td></tr>`;
    }).join("");
    return `<div class="sheet-wrap"><article class="sheet anexo2" aria-label="Hoja ${h + 1} de ${hojas.length}">
      ${h > 0 ? `<img class="watermark a2-marca" src="assets/anexo2-marca.png" alt="">` : ""}
      ${encabezadoHoja()}
      ${h === 0 ? `<p class="a2-comp">Componente C5 A1 – Actividades Formativas, Culturales, Recreativas y de Capacitación<br>Dirigidas a las Mujeres Usuarias de la EAI</p>
      <div class="a2-datos">
        <table class="a2-campos"><colgroup><col style="width:45%"><col></colgroup>${campo("Municipio:", MUNICIPIO)}${campo("Centro LIBRE:", CENTRO)}${campo("Nombre de la actividad:", act.nombre)}${campo("Fecha:", FECHA(act.fecha))}</table>
        <table class="a2-campos"><colgroup><col style="width:29%"><col></colgroup>${campo("Lugar o sede:", act.lugar)}${campo("Horario:", HORARIO(act))}${campo("Duración:", HORAS(act.horas))}${campo("Facilitador(a) o instructor(a):", act.instructora)}</table>
      </div>` : ""}
      <table class="a2-lista"><colgroup><col style="width:4.2%"><col style="width:30.2%"><col style="width:5.9%"><col style="width:25.8%"><col style="width:15.9%"><col style="width:18%"></colgroup>
        <tr><th>No.</th><th>Nombre Completo de la Participante</th><th>Edad</th><th>Tipo de Población Vulnerable (Indígenas y Adultas Mayores)</th><th>Número Celular</th><th>Firma de Asistencia</th></tr>
        ${renglones}
      </table>
      <div class="a2-pie"><p>“Este programa es público, ajeno a cualquier partido político. Queda prohibido el uso para fines distintos a los establecidos en el programa.”</p>
        <img src="assets/anexo2-pie.png" alt="Aviso de privacidad simplificado de la Secretaría de la Mujer de Guerrero"><span class="a2-pag">${h + 1}</span></div>
    </article></div>`;
  }).join("");
}

export async function anexo2({ yo, pintar, ir }, id) {
  const act = await db.uno("actividades", id);
  if (!act || !act.curso || !puedeVer(yo, act)) return ir(act ? `#/actividad/${id}` : "#/cursos");
  const asis = (await db.todos("asistencias", "actividadId", id)).sort((a, b) => a.orden - b.orden);
  const nombre = sinSimbolos(`Anexo 2 Lista de asistencia ${act.folio}.pdf`);
  const c = pintar("Anexo 2", `
    <section class="panel stack no-print">
      <p class="hint"><b>${esc(act.nombre)}</b> · ${plural(asis.length, "asistente", "asistentes")}. Formato «Anexo 2: Lista de Asistencia de Participantes» (Componente C5 A1), carta horizontal.</p>
      ${act.horaInicio ? "" : `<p class="chip warn">El curso no tiene horario registrado; el campo «Horario» saldrá en blanco. Puede agregarlo al editar el curso.</p>`}
      <p class="hint">La columna «Tipo de población vulnerable» se llena con «Indígena» (grupo registrado de la usuaria) y «Adulta mayor» (60 años o más en la fecha del curso); si no aplica, queda en blanco.</p>
    </section>
    <div class="toolbar no-print">
      <button class="btn primary" id="exportarPDF" disabled>Preparando PDF…</button>
      <a id="bajarPDF" hidden></a>
      ${botonIcono("formato", "Imprimir", { id: "imprimir" })}
      <p class="hint">${plural(repartir(asis.length).length, "hoja", "hojas")} · carta horizontal</p>
    </div>
    <div class="sheets" id="hojas">${anexo2HTML(act, asis)}</div>`, { atras: `#/actividad/${id}`, ancho: true });
  const hojasEl = $("#hojas", c);
  ajustarHojas(hojasEl);
  conectarExportacion(c, hojasEl, nombre, nombre.replace(/\.pdf$/, ""));
  const alCambiar = () => (document.contains(c) ? ajustarHojas(hojasEl) : removeEventListener("resize", alCambiar));
  addEventListener("resize", alCambiar);
}

export default {
  menu: [],
  rutas: [[/^#\/actividad\/([\w-]+)\/anexo2$/, anexo2]],
};
