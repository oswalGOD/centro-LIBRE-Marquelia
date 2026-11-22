// Módulo «Informes»: informe mensual, trimestral o por periodo.
// Solo contiene datos agregados (sin nombres, CURP, teléfonos ni firmas). Se entrega en PDF (hojas carta horizontal)
// y en Excel (.xlsx), y puede incluir fotografías de evidencias elegidas. Funciona sin conexión.

import * as db from "../core/db.js";
import * as ev from "../core/evidencias.js";
import { descargarFoto } from "../core/sync.js";
import { GRUPOS, RANGOS, hoy, fechaCorta, duracion } from "../core/catalogos.js";
import { calcularInforme, cruzar, evidenciasDelPeriodo, periodo, MESES, SEXOS_INFORME } from "../core/informe.js";
import { ESTATUS as ESTATUS_CANAL } from "../core/canalizaciones.js";
import { libroXlsx } from "../core/xlsx.js";
import { botonIcono } from "../core/iconos.js";
import { $, $$, esc, aviso, plural, descargar, puedeCompartir } from "../core/ui.js";
import { ajustarHojas, conectarExportacion } from "./formato.js";
import { miniatura } from "./evidencias-formato.js";

export const MAX_FOTOS = 30;
const POR_HOJA_FOTOS = 6, FILAS_ACTIVIDADES = 17;

const ahora = hoy();
const filtros = {
  modo: "mes", anio: Number(ahora.slice(0, 4)), mes: Number(ahora.slice(5, 7)), trimestre: Math.ceil(Number(ahora.slice(5, 7)) / 3),
  desde: ahora.slice(0, 4) + "-01-01", hasta: ahora, alcance: "todo", ambito: "individual",
};
let seleccion = []; // ids de las fotografías elegidas, en el orden en que se presentan

const sinSimbolos = s => String(s).replace(/[\\/:*?"<>|]+/g, "-");
const opciones = (lista, actual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(actual) ? "selected" : ""}>${esc(t)}</option>`).join("");
const capital = s => s[0].toUpperCase() + s.slice(1);
const horasTexto = min => (min ? duracion(min) : "—");
const AMBITOS = { individual: "Individual (sus actividades y los cursos)", global: "Global (todo el Centro)" };
const ALCANCES = { todo: "Todas las actividades y cursos", actividades: "Solo actividades", cursos: "Solo cursos y capacitaciones" };

function anios() {
  const y = Number(hoy().slice(0, 4));
  return Array.from({ length: 7 }, (_, i) => y - i).map(a => [a, a]);
}

function nombreArchivo(per) {
  const base = filtros.modo === "mes" ? `${filtros.anio}-${String(filtros.mes).padStart(2, "0")}` : filtros.modo === "trimestre" ? `${filtros.anio}-T${filtros.trimestre}` : `${per.desde}-a-${per.hasta}`;
  return sinSimbolos(`Informe ${filtros.ambito === "global" ? "global " : ""}${base} Centro LIBRE Marquelia`);
}

/* ---------- Excel ---------- */

export function libroDeInforme(inf, per) {
  const t = inf.totales;
  const tablaSexo = (titulo, filas, primera) => [
    [{ v: titulo, e: "sub" }],
    [{ v: primera, e: "enc" }, ...SEXOS_INFORME.map(([, x]) => ({ v: x, e: "enc" })), { v: "Total", e: "enc" }],
    ...filas.map(f => [f.texto, ...f.sexo, f.total]),
    [{ v: "Total", e: "tot" }, ...SEXOS_INFORME.map((_, i) => ({ v: filas.reduce((s, f) => s + f.sexo[i], 0), e: "tot" })), { v: filas.reduce((s, f) => s + f.total, 0), e: "tot" }],
    [],
  ];
  const resumen = {
    nombre: "Resumen", anchos: [44, 16, 16, 16, 16],
    filas: [
      [{ v: "Centro LIBRE Marquelia", e: "titulo" }],
      [{ v: `${per.tipo}: ${per.titulo}`, e: "sub" }],
      [{ v: `${AMBITOS[inf.ambito]} · ${ALCANCES[inf.alcance]} · Generado el ${fechaCorta(inf.generado)}`, e: "nota" }],
      [{ v: "Datos agregados: no incluye nombres, CURP, teléfonos ni firmas de las usuarias.", e: "nota" }],
      [],
      [{ v: "Indicador", e: "enc" }, { v: "Valor", e: "enc" }],
      ["Actividades realizadas", t.actividades],
      ["Cursos y capacitaciones realizados", t.cursos],
      ["Asistencias registradas", t.asistencias],
      ["Usuarias distintas atendidas", t.unicas],
      ["Usuarias nuevas (primera vez en el periodo)", t.nuevas],
      ["Usuarias recurrentes (2 o más asistencias en el periodo)", t.recurrentes],
      ["Horas de actividad", Math.round((t.minutos / 60) * 100) / 100],
      ["Actividades sin horario registrado", t.sinHorario],
      ...(inf.citas?.total ? [
        [],
        [{ v: "Citas individuales (conteos, sin datos personales)", e: "sub" }],
        ["Citas en el periodo", inf.citas.total],
        ["Asistieron", inf.citas.asistio],
        ["No asistieron", inf.citas.noAsistio],
        ["Reprogramadas", inf.citas.reprogramadas],
        ["Canceladas", inf.citas.canceladas],
        ["Aún programadas", inf.citas.programadas],
        ["Porcentaje de asistencia (asistieron entre asistieron y no asistieron)", inf.citas.asistencia == null ? "" : `${inf.citas.asistencia} %`],
        ["Usuarias distintas que asistieron a cita", inf.citas.unicas],
      ] : []),
      [],
      [{ v: "Por sexo", e: "sub" }],
      [{ v: "Concepto", e: "enc" }, ...SEXOS_INFORME.map(([, x]) => ({ v: x, e: "enc" })), { v: "Total", e: "enc" }],
      ["Asistencias", ...inf.sexoAsistencias, t.asistencias],
      ["Usuarias distintas", ...inf.sexoUnicas, t.unicas],
    ],
  };
  const edades = {
    nombre: "Edad, grupo y sexo", anchos: [34, 14, 14, 14, 14],
    filas: [
      [{ v: "Usuarias distintas", e: "titulo" }],
      [],
      ...tablaSexo("Por rango de edad y sexo", cruzar(inf.unicas, "rango", RANGOS), "Rango de edad"),
      ...tablaSexo("Por grupo y sexo", cruzar(inf.unicas, "grupo", GRUPOS), "Grupo"),
      [{ v: "Asistencias registradas", e: "titulo" }],
      [],
      ...tablaSexo("Por rango de edad y sexo", cruzar(inf.registros, "rango", RANGOS), "Rango de edad"),
      ...tablaSexo("Por grupo y sexo", cruzar(inf.registros, "grupo", GRUPOS), "Grupo"),
    ],
  };
  const tipos = {
    nombre: "Por tipo y mes", anchos: [34, 14, 14, 14, 14, 14, 14, 14],
    filas: [
      [{ v: "Por tipo de actividad", e: "sub" }],
      [...["Tipo", "Actividades", "Asistencias", "Usuarias distintas", ...SEXOS_INFORME.map(([, x]) => x), "Horas"].map(v => ({ v, e: "enc" }))],
      ...inf.porTipo.map(p => [p.tipo, p.actividades, p.asistencias, p.unicas, ...p.sexo, Math.round((p.minutos / 60) * 100) / 100]),
      [],
      [{ v: "Por mes", e: "sub" }],
      [...["Mes", "Actividades", "Asistencias", "Usuarias distintas"].map(v => ({ v, e: "enc" }))],
      ...inf.meses.map(m => [m.etiqueta, m.actividades, m.asistencias, m.unicas]),
      [],
      [{ v: "En «Usuarias distintas» de cada fila una misma usuaria cuenta una vez; la suma de las filas puede ser mayor al total del periodo.", e: "nota" }],
    ],
  };
  const lista = {
    nombre: "Actividades", anchos: [12, 16, 44, 26, 10, 11, 11, 9, 9],
    filas: [
      [...["Fecha", "Folio", "Actividad o curso", "Tipo", "Horas", ...SEXOS_INFORME.map(([, x]) => x), "Total"].map(v => ({ v, e: "enc" }))],
      ...inf.actividades.map(a => [fechaCorta(a.fecha), a.folio, a.nombre, a.tipo, a.minutos == null ? "" : Math.round((a.minutos / 60) * 100) / 100, ...a.sexo, a.total]),
      [{ v: "Total", e: "tot" }, { v: "", e: "tot" }, { v: "", e: "tot" }, { v: "", e: "tot" }, { v: Math.round((t.minutos / 60) * 100) / 100, e: "tot" },
        ...SEXOS_INFORME.map((_, i) => ({ v: inf.actividades.reduce((s, a) => s + a.sexo[i], 0), e: "tot" })), { v: t.asistencias, e: "tot" }],
    ],
  };
  const hojas = [resumen, edades, tipos, lista];
  if (inf.canalizaciones?.total) {
    const c = inf.canalizaciones;
    hojas.push({
      nombre: "Canalizaciones", anchos: [40, 12, 12, 14, 12, 10],
      filas: [
        [{ v: "Canalizaciones a instituciones", e: "titulo" }],
        [{ v: "Solo conteos por institución y estatus: no incluye nombres ni motivos.", e: "nota" }],
        [],
        [{ v: "Institución", e: "enc" }, ...ESTATUS_CANAL.map(([, t]) => ({ v: t, e: "enc" })), { v: "Total", e: "enc" }],
        ...c.filas.map(f => [f.nombre, ...ESTATUS_CANAL.map(([v]) => f[v]), f.total]),
        [{ v: "Total", e: "tot" }, ...c.porEstatus.map(n => ({ v: n, e: "tot" })), { v: c.total, e: "tot" }],
      ],
    });
  }
  return libroXlsx(hojas);
}

/** Comparte el archivo con el menú del dispositivo (iPad, iPhone, Android) o lo descarga (computadora). */
async function entregar(blob, nombre) {
  const archivo = new File([blob], nombre, { type: blob.type });
  if (puedeCompartir(archivo)) {
    try { await navigator.share({ files: [archivo] }); return; }
    catch (e) { if (e?.name === "AbortError") return; }
  }
  descargar(nombre, blob, blob.type);
}

/* ---------- Hojas del PDF ---------- */

function encabezadoInforme(per, inf) {
  return `
      <img class="logos" src="assets/logos.png" alt="Gobierno de México, Mujeres, PAIBIM, Centro LIBRE para las Mujeres, Gobierno de Guerrero, Secretaría de la Mujer">
      <img class="watermark" src="assets/marca-agua.jpg" alt="">
      <table class="hdr"><colgroup><col style="width:48%"><col style="width:52%"></colgroup>
        <tr class="h-title"><td>CENTRO LIBRE MARQUELIA</td><td>INFORME DE ACTIVIDADES</td></tr>
        <tr class="h-row"><td>Periodo: <b>${esc(per.titulo)}</b></td><td>${esc(per.tipo)} · del <b>${fechaCorta(per.desde)}</b> al <b>${fechaCorta(per.hasta)}</b></td></tr>
        <tr class="h-row"><td>Informe: <b>${esc(inf.ambito === "global" ? "Global" : "Individual")}</b> · Alcance: <b>${esc(ALCANCES[inf.alcance])}</b></td><td>Fecha de elaboración: <b>${fechaCorta(inf.generado)}</b></td></tr>
      </table>`;
}

function tablaCruzadaHoja(titulo, primera, filas) {
  const col = i => filas.reduce((s, f) => s + f.sexo[i], 0);
  return `<table class="inf-tabla"><caption>${esc(titulo)}</caption>
    <thead><tr><th class="l">${esc(primera)}</th>${SEXOS_INFORME.map(([, x]) => `<th>${x}</th>`).join("")}<th>Total</th></tr></thead>
    <tbody>${filas.map(f => `<tr><td class="l">${esc(f.texto)}</td>${f.sexo.map(n => `<td>${n}</td>`).join("")}<td><b>${f.total}</b></td></tr>`).join("")}</tbody>
    <tfoot><tr><td class="l">Total</td>${SEXOS_INFORME.map((_, i) => `<td>${col(i)}</td>`).join("")}<td>${filas.reduce((s, f) => s + f.total, 0)}</td></tr></tfoot></table>`;
}

/** Contenido (sin marco) de cada hoja del informe; el marco y el número de hoja se agregan después. */
function paginasInforme(inf, per, fotos) {
  const t = inf.totales;
  const paginas = [];
  const tile = (n, et, sub = "") => `<div class="inf-tile"><span class="v">${n}</span><span class="e">${esc(et)}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ""}</div>`;
  paginas.push(`
      <div class="inf-tiles">
        ${tile(t.actividades, "Actividades")}${tile(t.cursos, "Cursos y capacitaciones")}${tile(t.asistencias, "Asistencias")}
        ${tile(t.unicas, "Usuarias distintas")}${tile(t.nuevas, "Usuarias nuevas", "primera vez en el periodo")}${tile(t.recurrentes, "Usuarias recurrentes", "2 o más asistencias")}
        ${tile(horasTexto(t.minutos), "Horas de actividad", t.sinHorario ? `${plural(t.sinHorario, "actividad", "actividades")} sin horario` : "")}
        ${inf.citas?.total ? `${tile(inf.citas.total, "Citas individuales", `${inf.citas.asistio} asistieron · ${inf.citas.noAsistio} no asistieron`)}${tile(inf.citas.asistencia == null ? "—" : `${inf.citas.asistencia} %`, "Asistencia a citas", `${plural(inf.citas.reprogramadas, "reprogramada", "reprogramadas")} · ${plural(inf.citas.canceladas, "cancelada", "canceladas")}`)}` : ""}
      </div>
      <div class="inf-cols">
        ${tablaCruzadaHoja("Usuarias distintas por rango de edad y sexo", "Rango de edad", cruzar(inf.unicas, "rango", RANGOS))}
        <div class="inf-pila">
          ${tablaCruzadaHoja("Usuarias distintas por grupo y sexo", "Grupo", cruzar(inf.unicas, "grupo", GRUPOS))}
          <table class="inf-tabla"><caption>Por sexo</caption>
            <thead><tr><th class="l">Concepto</th>${SEXOS_INFORME.map(([, x]) => `<th>${x}</th>`).join("")}<th>Total</th></tr></thead>
            <tbody><tr><td class="l">Asistencias</td>${inf.sexoAsistencias.map(n => `<td>${n}</td>`).join("")}<td><b>${t.asistencias}</b></td></tr>
            <tr><td class="l">Usuarias distintas</td>${inf.sexoUnicas.map(n => `<td>${n}</td>`).join("")}<td><b>${t.unicas}</b></td></tr></tbody></table>
        </div>
      </div>
      <p class="inf-nota">Cada usuaria cuenta una vez en las tablas por edad y grupo, con los datos de la última actividad del periodo a la que asistió. Las asistencias cuentan cada firma registrada en una lista.</p>`);

  // Por tipo y por mes: junto al resumen cuando caben; si no, en una hoja aparte
  if (inf.porTipo.length) {
    const tipos = inf.porTipo.slice(0, 18);
    const html = `
      <div class="inf-cols inf-tipos">
        <table class="inf-tabla"><caption>Por tipo de actividad</caption>
          <colgroup><col style="width:27%"><col style="width:11%"><col style="width:11%"><col style="width:12%"><col style="width:10%"><col style="width:10%"><col style="width:8%"><col style="width:11%"></colgroup>
          <thead><tr><th class="l">Tipo</th><th>Actividades</th><th>Asistencias</th><th>Usuarias distintas</th>${SEXOS_INFORME.map(([, x]) => `<th>${x}</th>`).join("")}<th>Horas</th></tr></thead>
          <tbody>${tipos.map(p => `<tr><td class="l">${esc(p.tipo)}</td><td>${p.actividades}</td><td>${p.asistencias}</td><td>${p.unicas}</td>${p.sexo.map(n => `<td>${n}</td>`).join("")}<td>${horasTexto(p.minutos)}</td></tr>`).join("")}</tbody>
          <tfoot><tr><td class="l">Total</td><td>${t.actividades + t.cursos}</td><td>${t.asistencias}</td><td>${t.unicas}</td>${inf.sexoAsistencias.map(n => `<td>${n}</td>`).join("")}<td>${horasTexto(t.minutos)}</td></tr></tfoot></table>
        ${inf.meses.length > 1 && inf.meses.length <= 12 ? `<table class="inf-tabla"><caption>Por mes</caption>
          <thead><tr><th class="l">Mes</th><th>Actividades</th><th>Asistencias</th><th>Usuarias distintas</th></tr></thead>
          <tbody>${inf.meses.map(m => `<tr><td class="l">${esc(m.etiqueta)}</td><td>${m.actividades}</td><td>${m.asistencias}</td><td>${m.unicas}</td></tr>`).join("")}</tbody></table>` : ""}
      </div>
      <p class="inf-nota">En «Usuarias distintas» de cada fila una misma usuaria cuenta una vez; la suma de las filas puede ser mayor al total del periodo.</p>`;
    if (tipos.length <= 5 && inf.meses.length <= 4) paginas[0] += html;
    else paginas.push(html);
  }

  const total = Math.max(1, Math.ceil(inf.actividades.length / FILAS_ACTIVIDADES));
  if (inf.actividades.length) {
    for (let p = 0; p < total; p++) {
      const filas = inf.actividades.slice(p * FILAS_ACTIVIDADES, (p + 1) * FILAS_ACTIVIDADES);
      const ultima = p === total - 1;
      paginas.push(`
      <table class="inf-tabla inf-lista"><caption>Actividades y cursos realizados${total > 1 ? ` (${p + 1} de ${total})` : ""}</caption>
        <colgroup><col style="width:9%"><col style="width:12%"><col style="width:31%"><col style="width:17%"><col style="width:7%"><col style="width:8%"><col style="width:8%"><col style="width:5%"><col style="width:7%"></colgroup>
        <thead><tr><th>Fecha</th><th>Folio</th><th class="l">Actividad o curso</th><th class="l">Tipo</th><th>Horas</th>${SEXOS_INFORME.map(([, x]) => `<th>${x}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>${filas.map(a => `<tr><td>${fechaCorta(a.fecha)}</td><td>${esc(a.folio)}</td><td class="l">${esc(a.nombre)}</td><td class="l">${esc(a.tipo)}</td><td>${horasTexto(a.minutos)}</td>${a.sexo.map(n => `<td>${n}</td>`).join("")}<td><b>${a.total}</b></td></tr>`).join("")}</tbody>
        ${ultima ? `<tfoot><tr><td colspan="4" class="l">Total</td><td>${horasTexto(t.minutos)}</td>${inf.sexoAsistencias.map(n => `<td>${n}</td>`).join("")}<td>${t.asistencias}</td></tr></tfoot>` : ""}</table>`);
    }
  }

  if (inf.canalizaciones?.total) {
    const c = inf.canalizaciones;
    paginas.push(`
      <table class="inf-tabla"><caption>Canalizaciones a instituciones</caption>
        <thead><tr><th class="l">Institución</th>${ESTATUS_CANAL.map(([, x]) => `<th>${x}</th>`).join("")}<th>Total</th></tr></thead>
        <tbody>${c.filas.slice(0, 18).map(f => `<tr><td class="l">${esc(f.nombre)}</td>${ESTATUS_CANAL.map(([v]) => `<td>${f[v]}</td>`).join("")}<td><b>${f.total}</b></td></tr>`).join("")}</tbody>
        <tfoot><tr><td class="l">Total</td>${c.porEstatus.map(n => `<td>${n}</td>`).join("")}<td>${c.total}</td></tr></tfoot></table>
      <p class="inf-nota">Conteo de canalizaciones registradas en el periodo, por institución y estatus. No incluye nombres ni motivos.</p>`);
  }

  const evidencias = [];
  for (let i = 0; i < fotos.length; i += POR_HOJA_FOTOS) {
    evidencias.push(`
      <h2 class="inf-sub">Evidencias fotográficas</h2>
      <div class="evid-rejilla">${fotos.slice(i, i + POR_HOJA_FOTOS).map(({ f, src, a }, j) => `
        <figure class="evid-foto">
          ${src ? `<img src="${src}" alt="Fotografía ${i + j + 1}">` : `<div class="sin-foto">Fotografía no disponible en este dispositivo</div>`}
          <figcaption><b>${i + j + 1}.</b> ${esc(a.nombre)} (${fechaCorta(a.fecha)})${f.leyenda ? ` · ${esc(f.leyenda)}` : ""}</figcaption>
        </figure>`).join("")}</div>`);
  }
  return { paginas, evidencias };
}

export function hojasInformeHTML(inf, per, fotos) {
  const { paginas, evidencias } = paginasInforme(inf, per, fotos);
  const todas = [...paginas.map(p => [p, ""]), ...evidencias.map(p => [p, " evid-hoja"])];
  return todas.map(([cuerpo, clase], i) => `<div class="sheet-wrap"><article class="sheet inf-hoja${clase}" aria-label="Hoja ${i + 1} de ${todas.length}">${encabezadoInforme(per, inf)}${cuerpo}
      <div class="inf-pie"><span>Datos agregados: este informe no incluye información personal identificable de las usuarias.</span><span>Hoja ${i + 1} de ${todas.length}</span></div>
    </article></div>`).join("");
}

/* ---------- Pantallas ---------- */

function tablaPantalla(titulo, primera, filas) {
  const col = i => filas.reduce((s, f) => s + f.sexo[i], 0);
  return `<section class="panel stack"><h2 class="h3">${esc(titulo)}</h2>
    <div class="table-scroll"><table class="data">
      <thead><tr><th scope="col">${esc(primera)}</th>${SEXOS_INFORME.map(([, x]) => `<th scope="col" class="num">${x}</th>`).join("")}<th scope="col" class="num">Total</th></tr></thead>
      <tbody>${filas.map(f => `<tr><th scope="row">${esc(f.texto)}</th>${f.sexo.map(n => `<td class="num ${n ? "" : "zero"}">${n}</td>`).join("")}<td class="num total">${f.total}</td></tr>`).join("")}</tbody>
      <tfoot><tr><th scope="row">Total</th>${SEXOS_INFORME.map((_, i) => `<td class="num">${col(i)}</td>`).join("")}<td class="num total">${filas.reduce((s, f) => s + f.total, 0)}</td></tr></tfoot>
    </table></div></section>`;
}

async function pantalla({ yo, pintar }) {
  ev.liberarUrls();
  const per = periodo(filtros);
  const inf = await calcularInforme(yo, { ...per, alcance: filtros.alcance, ambito: filtros.ambito });
  const grupos = await evidenciasDelPeriodo(inf.actividades.map(a => ({ id: a.id, nombre: a.nombre, fecha: a.fecha, folio: a.folio })));
  const validas = new Set(grupos.flatMap(g => g.fotos.map(f => f.id)));
  seleccion = seleccion.filter(id => validas.has(id));
  const t = inf.totales;

  const campos = filtros.modo === "mes"
    ? `<div class="field"><label for="i-mes">Mes</label><select id="i-mes" data-filtro="mes" data-num>${opciones(MESES.map((m, i) => [i + 1, capital(m)]), filtros.mes)}</select></div>
       <div class="field"><label for="i-anio">Año</label><select id="i-anio" data-filtro="anio" data-num>${opciones(anios(), filtros.anio)}</select></div>`
    : filtros.modo === "trimestre"
      ? `<div class="field"><label for="i-tri">Trimestre</label><select id="i-tri" data-filtro="trimestre" data-num>${opciones([[1, "1.º (enero a marzo)"], [2, "2.º (abril a junio)"], [3, "3.º (julio a septiembre)"], [4, "4.º (octubre a diciembre)"]], filtros.trimestre)}</select></div>
         <div class="field"><label for="i-anio">Año</label><select id="i-anio" data-filtro="anio" data-num>${opciones(anios(), filtros.anio)}</select></div>`
      : `<div class="field"><label for="i-desde">Desde</label><input id="i-desde" type="date" data-filtro="desde" value="${filtros.desde}"></div>
         <div class="field"><label for="i-hasta">Hasta</label><input id="i-hasta" type="date" data-filtro="hasta" value="${filtros.hasta}"></div>`;

  const c = pintar("Informes", `
    <p class="hint">Informe con datos agregados del periodo, listo para entregar. No incluye nombres, CURP, teléfonos ni firmas de las usuarias.${filtros.ambito === "global" ? " El informe global suma todas las actividades del Centro (con las copias de cada perfil) y cada curso una sola vez; no incluye citas ni canalizaciones." : " Solo contiene sus actividades y los cursos."}</p>
    <p class="hint">${inf.canalizaciones ? (inf.canalizaciones.total ? `Incluye ${plural(inf.canalizaciones.total, "canalización", "canalizaciones")} del periodo, solo como conteos por institución y estatus.` : "No hay canalizaciones registradas en el periodo.") : "Para incluir las canalizaciones del periodo, abra primero «Canalizaciones» con su PIN."}</p>
    <div class="filters" id="filtros">
      <div class="field"><span class="legend">Periodo</span><div class="segmented" role="radiogroup" aria-label="Tipo de periodo">
        ${[["mes", "Mensual"], ["trimestre", "Trimestral"], ["rango", "Por fechas"]].map(([v, x]) => `<button type="button" role="radio" aria-checked="${v === filtros.modo}" data-modo="${v}">${x}</button>`).join("")}</div></div>
      ${campos}
      <div class="field"><label for="i-ambito">Informe</label><select id="i-ambito" data-filtro="ambito">${opciones(Object.entries(AMBITOS), filtros.ambito)}</select></div>
      <div class="field"><label for="i-alcance">Incluir</label><select id="i-alcance" data-filtro="alcance">${opciones(Object.entries(ALCANCES), filtros.alcance)}</select></div>
    </div>
    <p class="hint"><b>${esc(capital(per.tipo.toLowerCase()))}:</b> ${esc(per.titulo)}.</p>
    ${t.asistencias || inf.actividades.length || inf.citas?.total ? `
      <div class="tiles">
        <div class="tile"><span class="label">Actividades</span><span class="value">${t.actividades}</span></div>
        <div class="tile"><span class="label">Cursos y capacitaciones</span><span class="value">${t.cursos}</span></div>
        <div class="tile"><span class="label">Asistencias</span><span class="value">${t.asistencias}</span></div>
        <div class="tile"><span class="label">Usuarias distintas</span><span class="value">${t.unicas}</span></div>
        <div class="tile"><span class="label">Usuarias nuevas</span><span class="value">${t.nuevas}</span><span class="sub">primera vez en el periodo</span></div>
        <div class="tile"><span class="label">Usuarias recurrentes</span><span class="value">${t.recurrentes}</span><span class="sub">2 o más asistencias en el periodo</span></div>
        ${inf.citas?.total ? `<div class="tile"><span class="label">Citas individuales</span><span class="value">${inf.citas.total}</span><span class="sub">${inf.citas.asistio} asistieron · ${inf.citas.noAsistio} no asistieron</span></div>
        <div class="tile"><span class="label">Asistencia a citas</span><span class="value">${inf.citas.asistencia == null ? "—" : `${inf.citas.asistencia} %`}</span><span class="sub">${plural(inf.citas.reprogramadas, "reprogramada", "reprogramadas")} · ${plural(inf.citas.canceladas, "cancelada", "canceladas")}</span></div>` : ""}
        <div class="tile"><span class="label">Horas de actividad</span><span class="value">${t.minutos ? duracion(t.minutos) : "—"}</span>${t.sinHorario ? `<span class="sub">${plural(t.sinHorario, "actividad", "actividades")} sin horario</span>` : ""}</div>
      </div>
      <div class="two-col">
        ${tablaPantalla("Usuarias distintas por rango de edad y sexo", "Rango de edad", cruzar(inf.unicas, "rango", RANGOS))}
        ${tablaPantalla("Usuarias distintas por grupo y sexo", "Grupo", cruzar(inf.unicas, "grupo", GRUPOS))}
      </div>
      <section class="panel stack"><h2 class="h3">Por tipo de actividad</h2>
        <div class="table-scroll"><table class="data">
          <thead><tr><th scope="col">Tipo</th><th scope="col" class="num">Actividades</th><th scope="col" class="num">Asistencias</th><th scope="col" class="num">Usuarias distintas</th><th scope="col" class="num">Horas</th></tr></thead>
          <tbody>${inf.porTipo.map(p => `<tr><th scope="row">${esc(p.tipo)}</th><td class="num">${p.actividades}</td><td class="num">${p.asistencias}</td><td class="num">${p.unicas}</td><td class="num">${horasTexto(p.minutos)}</td></tr>`).join("")}</tbody>
        </table></div>
        ${inf.meses.length > 1 ? `<div class="table-scroll"><table class="data">
          <thead><tr><th scope="col">Mes</th><th scope="col" class="num">Actividades</th><th scope="col" class="num">Asistencias</th><th scope="col" class="num">Usuarias distintas</th></tr></thead>
          <tbody>${inf.meses.map(m => `<tr><th scope="row">${esc(m.etiqueta)}</th><td class="num">${m.actividades}</td><td class="num">${m.asistencias}</td><td class="num">${m.unicas}</td></tr>`).join("")}</tbody>
        </table></div>` : ""}
      </section>
      <section class="panel stack" id="fotos">
        <div class="section-head"><h2 class="h3">Evidencias fotográficas (opcional)</h2><span class="chip" id="cuentaFotos"></span></div>
        ${grupos.length ? `
          <p class="hint">Elija las fotografías que desea incluir en el informe (hasta ${MAX_FOTOS}). Seleccione solo las que muestren la actividad de forma general y para las que haya consentimiento de las personas que aparecen.</p>
          ${grupos.map(g => `<fieldset class="inf-grupo"><legend>${esc(g.actividad.nombre)} · ${fechaCorta(g.actividad.fecha)} · ${plural(g.fotos.length, "fotografía", "fotografías")}</legend>
            <div class="inf-fotos" data-actividad="${esc(g.actividad.id)}">${g.fotos.map(f => `<label class="inf-foto" title="${esc(f.leyenda || "Fotografía")}">
              <input type="checkbox" data-foto="${esc(f.id)}" ${seleccion.includes(f.id) ? "checked" : ""}>
              <span class="inf-miniatura" data-miniatura="${esc(f.id)}">Sin descargar</span>
              <span class="inf-leyenda">${esc(f.leyenda || "Sin leyenda")}</span></label>`).join("")}</div></fieldset>`).join("")}`
          : `<p class="hint">No hay fotografías de evidencias en las actividades de este periodo.</p>`}
      </section>
      <div class="actions">
        <a class="btn primary" id="verPDF" href="#/informes/pdf">Ver informe y exportar PDF</a>
        ${botonIcono("descargar", "Excel", { id: "excel", titulo: "Descargar informe en Excel (.xlsx)" })}
      </div>`
    : `<div class="empty"><b>No hay actividades registradas en este periodo.</b><p>Elija otro mes, trimestre o rango de fechas para generar el informe.</p></div>`}
  `, { ancho: true });

  const refrescar = () => ev.liberarUrls() || pantalla({ yo, pintar });
  $$("[data-modo]", c).forEach(b => b.addEventListener("click", () => { filtros.modo = b.dataset.modo; refrescar(); }));
  $$("[data-filtro]", c).forEach(el => el.addEventListener("change", () => {
    filtros[el.dataset.filtro] = "num" in el.dataset ? Number(el.value) : el.value;
    if (filtros.desde > filtros.hasta) [filtros.desde, filtros.hasta] = [filtros.hasta, filtros.desde];
    refrescar();
  }));

  const cuenta = () => { const e = $("#cuentaFotos", c); if (e) e.textContent = `${seleccion.length} de ${MAX_FOTOS} seleccionadas`; };
  cuenta();
  // Miniaturas: solo se muestran las que ya están en este dispositivo
  $$("[data-miniatura]", c).forEach(async el => {
    const url = await ev.urlDe(el.dataset.miniatura);
    if (url && el.isConnected) el.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
  });
  $$("[data-foto]", c).forEach(caja => caja.addEventListener("change", () => {
    if (caja.checked && seleccion.length >= MAX_FOTOS) { caja.checked = false; return aviso(`Se pueden incluir hasta ${MAX_FOTOS} fotografías.`); }
    // Se conserva el orden de la pantalla (por actividad y por orden de la carpeta)
    const marcadas = new Set($$("[data-foto]", c).filter(x => x.checked).map(x => x.dataset.foto));
    seleccion = $$("[data-foto]", c).map(x => x.dataset.foto).filter(id => marcadas.has(id));
    cuenta();
  }));

  $("#excel", c)?.addEventListener("click", () => {
    const nombre = `${nombreArchivo(per)}.xlsx`;
    entregar(libroDeInforme(inf, per), nombre);
  });
}

async function vistaPDF({ yo, pintar, ir }) {
  ev.liberarUrls();
  const per = periodo(filtros);
  const inf = await calcularInforme(yo, { ...per, alcance: filtros.alcance, ambito: filtros.ambito });
  if (!inf.actividades.length && !inf.citas?.total) return ir("#/informes");
  const grupos = await evidenciasDelPeriodo(inf.actividades.map(a => ({ id: a.id, nombre: a.nombre, fecha: a.fecha, folio: a.folio })));
  const porId = new Map(grupos.flatMap(g => g.fotos.map(f => [f.id, { f, a: g.actividad }])));
  const elegidas = seleccion.filter(id => porId.has(id));
  if (elegidas.length) aviso("Preparando fotografías…");
  const fotos = [];
  for (const id of elegidas) {
    const { f, a } = porId.get(id);
    let registro = await db.fotoLocal(f.id);
    if (!registro?.blob && (await descargarFoto(f))) registro = await db.fotoLocal(f.id);
    let src = null;
    try { src = registro?.blob ? await miniatura(registro.blob) : null; } catch { src = null; }
    fotos.push({ f, a, src });
  }
  const faltan = fotos.filter(x => !x.src).length;
  const html = hojasInformeHTML(inf, per, fotos);
  const hojas = (html.match(/class="sheet-wrap"/g) || []).length;
  const c = pintar("Informe para imprimir", `
    <div class="toolbar no-print">
      <button class="btn primary" id="exportarPDF" disabled>Preparando PDF…</button>
      <a id="bajarPDF" hidden></a>
      ${botonIcono("formato", "Imprimir", { id: "imprimir" })}
      ${botonIcono("descargar", "Excel", { id: "excel", titulo: "Descargar informe en Excel (.xlsx)" })}
      <p class="hint">${plural(hojas, "hoja", "hojas")} · carta horizontal${fotos.length ? ` · ${plural(fotos.length, "fotografía", "fotografías")}` : ""}${faltan ? ` · <span class="chip warn">${plural(faltan, "foto sin descargar", "fotos sin descargar")}</span>` : ""}</p>
    </div>
    ${faltan ? `<p class="hint no-print">Algunas fotografías fueron tomadas en otro dispositivo y aún no se descargan aquí. Conéctese a internet y vuelva a abrir esta pantalla para incluirlas.</p>` : ""}
    <p class="hint no-print">Revise las hojas y toque «Exportar PDF»: en iPad, iPhone y Android se abre el menú para guardarlo o compartirlo; en computadora se descarga el archivo.</p>
    <div class="sheets" id="hojas">${html}</div>
  `, { atras: "#/informes", ancho: true });
  const hojasEl = $("#hojas", c);
  ajustarHojas(hojasEl);
  const alCambiar = () => (document.contains(hojasEl) ? ajustarHojas(hojasEl) : removeEventListener("resize", alCambiar));
  addEventListener("resize", alCambiar);
  $("#excel", c).addEventListener("click", () => entregar(libroDeInforme(inf, per), `${nombreArchivo(per)}.xlsx`));
  conectarExportacion(c, hojasEl, `${nombreArchivo(per)}.pdf`, nombreArchivo(per));
}

export default {
  menu: [],
  rutas: [
    [/^#\/informes$/, pantalla],
    [/^#\/informes\/pdf$/, vistaPDF],
  ],
};
