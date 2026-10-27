// Estadísticas por actividad, rango de edad, grupo y sexo, con exportación a Excel (CSV).

import * as db from "../core/db.js";
import { GRUPOS, RANGOS, SEXOS, edad, rangoDe, hoy, fechaCorta, fechaLarga, etiquetaGrupo, etiquetaRango, minutosEntre, duracion } from "../core/catalogos.js";
import { esCoordinadora } from "../core/auth.js";
import { puedeVer } from "../core/permisos.js";
import { $, $$, esc, descargar, plural } from "../core/ui.js";

const SEXO_COLUMNAS = [["M", "Mujeres"], ["H", "Hombres"], ["Otro", "Otro"]];

// Filtros vigentes mientras la app está abierta
const filtros = { desde: hoy().slice(0, 4) + "-01-01", hasta: hoy(), tipo: "", facilitadoraId: "", contar: "asistencias" };

async function cargar(yo) {
  const [acts, asis] = await Promise.all([db.todos("actividades"), db.todos("asistencias")]);
  const visibles = acts.filter(a => puedeVer(yo, a));
  return { visibles, asis };
}

/** Aplica los filtros y devuelve las filas a contar: una por asistencia o una por usuaria. */
function calcular({ visibles, asis }) {
  const acts = visibles
    .filter(a => a.fecha >= filtros.desde && a.fecha <= filtros.hasta)
    .filter(a => !filtros.tipo || a.tipo === filtros.tipo)
    .filter(a => !filtros.facilitadoraId || a.facilitadoraId === filtros.facilitadoraId)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.folio.localeCompare(b.folio));
  const porId = new Map(acts.map(a => [a.id, a]));
  const registros = asis
    .filter(x => porId.has(x.actividadId))
    .map(x => {
      const a = porId.get(x.actividadId);
      return { ...x.datos, usuariaId: x.usuariaId, orden: x.orden, actividad: a, rango: rangoDe(edad(x.datos.fnac, a.fecha)) };
    })
    .sort((x, y) => x.actividad.fecha.localeCompare(y.actividad.fecha) || x.actividad.folio.localeCompare(y.actividad.folio) || x.orden - y.orden);

  // Usuarias distintas: se cuenta cada usuaria una vez, con sus datos de la última actividad del periodo
  const usuarias = new Map();
  for (const r of registros) {
    const previa = usuarias.get(r.usuariaId);
    if (!previa || previa.actividad.fecha <= r.actividad.fecha) usuarias.set(r.usuariaId, r);
  }

  // Usuarias nuevas: su primera asistencia (de todas las que este perfil puede ver) cae dentro del periodo
  const primera = new Map();
  const fechaDe = new Map(visibles.map(a => [a.id, a.fecha]));
  for (const x of asis) {
    const f = fechaDe.get(x.actividadId);
    if (f && (!primera.has(x.usuariaId) || f < primera.get(x.usuariaId))) primera.set(x.usuariaId, f);
  }
  const nuevas = [...usuarias.keys()].filter(id => primera.get(id) >= filtros.desde).length;

  return { acts, registros, usuarias: [...usuarias.values()], nuevas };
}

function tablaCruzada(titulo, filas, clave, catalogo, etiqueta) {
  const total = filas.length;
  const conteos = catalogo.map(([v]) => {
    const de = filas.filter(r => r[clave] === v);
    return { v, total: de.length, sexo: SEXO_COLUMNAS.map(([s]) => de.filter(r => r.sexo === s).length) };
  });
  const max = Math.max(1, ...conteos.map(c => c.total));
  return `<section class="panel stack">
    <h2 class="h3">${titulo}</h2>
    <div class="table-scroll"><table class="data">
      <thead><tr><th scope="col">${clave === "rango" ? "Rango de edad" : "Grupo"}</th>${SEXO_COLUMNAS.map(([, t]) => `<th scope="col" class="num">${t}</th>`).join("")}<th scope="col" class="num">Total</th><th scope="col" class="bar-col"><span class="visually-hidden">Proporción</span></th></tr></thead>
      <tbody>${conteos.map(c => `<tr>
        <th scope="row"><span class="letter">${c.v})</span> ${esc(etiqueta(c.v))}</th>
        ${c.sexo.map(n => `<td class="num ${n ? "" : "zero"}">${n}</td>`).join("")}
        <td class="num total">${c.total}</td>
        <td class="bar-col"><span class="bar" style="--w:${(c.total / max) * 100}%" title="${esc(etiqueta(c.v))}: ${c.total} de ${total} (${total ? Math.round((c.total / total) * 100) : 0}%)"></span></td>
      </tr>`).join("")}</tbody>
      <tfoot><tr><th scope="row">Total</th>${SEXO_COLUMNAS.map(([s]) => `<td class="num">${filas.filter(r => r.sexo === s).length}</td>`).join("")}<td class="num total">${total}</td><td></td></tr></tfoot>
    </table></div>
  </section>`;
}

const celdaCsv = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = filas => "﻿" + filas.map(f => f.map(celdaCsv).join(",")).join("\r\n");

async function vista(ctx) {
  const { yo, pintar } = ctx;
  const datos = await cargar(yo);
  const coord = esCoordinadora(yo);
  const perfiles = coord ? (await db.todos("perfiles")).sort((a, b) => a.nombre.localeCompare(b.nombre)) : [];
  const tipos = [...new Set(datos.visibles.map(a => a.tipo))].sort();

  const c = pintar("Estadísticas", `
    <div class="filters" id="filtros">
      <div class="field"><label for="e-desde">Desde</label><input id="e-desde" type="date" data-filtro="desde" value="${filtros.desde}"></div>
      <div class="field"><label for="e-hasta">Hasta</label><input id="e-hasta" type="date" data-filtro="hasta" value="${filtros.hasta}"></div>
      <div class="field"><label for="e-tipo">Tipo de actividad</label><select id="e-tipo" data-filtro="tipo"><option value="">Todos</option>${tipos.map(t => `<option ${t === filtros.tipo ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>
      ${coord ? `<div class="field"><label for="e-fac">Facilitadora</label><select id="e-fac" data-filtro="facilitadoraId"><option value="">Todas</option>${perfiles.map(u => `<option value="${u.id}" ${u.id === filtros.facilitadoraId ? "selected" : ""}>${esc(u.nombre)}</option>`).join("")}</select></div>` : ""}
      <div class="field"><span class="legend">Contar</span><div class="segmented" role="radiogroup" aria-label="Qué contar">
        <button type="button" role="radio" data-contar="asistencias">Asistencias</button>
        <button type="button" role="radio" data-contar="usuarias">Usuarias distintas</button></div></div>
    </div>
    <div id="resultado" class="stack"></div>
  `, { ancho: true });

  function pintarResultado() {
    $$("[data-contar]", c).forEach(b => b.setAttribute("aria-checked", b.dataset.contar === filtros.contar));
    const r = calcular(datos);
    const filas = filtros.contar === "usuarias" ? r.usuarias : r.registros;
    const nota = filtros.contar === "usuarias"
      ? "Cada usuaria cuenta una vez en el periodo, con su edad y grupo de la última actividad a la que asistió."
      : "Cada firma en una lista cuenta una vez: si una usuaria fue a tres actividades, cuenta tres.";
    const porAct = r.acts.map(a => {
      const de = r.registros.filter(x => x.actividad.id === a.id);
      return { a, n: de.length, sexo: SEXO_COLUMNAS.map(([s]) => de.filter(x => x.sexo === s).length) };
    });

    const minutos = r.acts.map(a => minutosEntre(a.horaInicio, a.horaFin));
    const conHorario = minutos.filter(m => m != null);
    const sinHorario = r.acts.length - conHorario.length;
    const totalMin = conHorario.reduce((t, m) => t + m, 0);

    $("#resultado", c).innerHTML = `
      <p class="hint">Del ${fechaLarga(filtros.desde)} al ${fechaLarga(filtros.hasta)}${coord ? "" : " · solo tus actividades"}.</p>
      <div class="tiles">
        <div class="tile"><span class="label">Asistencias registradas</span><span class="value">${r.registros.length}</span></div>
        <div class="tile"><span class="label">Usuarias distintas</span><span class="value">${r.usuarias.length}</span></div>
        <div class="tile"><span class="label">Usuarias nuevas</span><span class="value">${r.nuevas}</span><span class="sub">primera vez en el periodo</span></div>
        <div class="tile"><span class="label">Actividades</span><span class="value">${r.acts.length}</span></div>
        <div class="tile"><span class="label">Horas de actividad</span><span class="value">${conHorario.length ? duracion(totalMin) : "—"}</span>${sinHorario ? `<span class="sub">${plural(sinHorario, "actividad", "actividades")} sin horario</span>` : ""}</div>
      </div>
      ${r.registros.length ? `
      <p class="hint">${nota}</p>
      <div class="two-col">
        ${tablaCruzada("Por rango de edad y sexo", filas, "rango", RANGOS, etiquetaRango)}
        ${tablaCruzada("Por grupo y sexo", filas, "grupo", GRUPOS, etiquetaGrupo)}
      </div>
      <section class="panel stack">
        <div class="section-head"><h2 class="h3">Por actividad</h2>
          <div class="actions"><button class="btn small" id="csvActividades">Descargar resumen (Excel)</button><button class="btn small" id="csvDetalle">Descargar lista detallada (Excel)</button></div></div>
        <div class="table-scroll"><table class="data">
          <thead><tr><th scope="col">Fecha</th><th scope="col">Folio</th><th scope="col">Actividad</th><th scope="col">Tipo</th>${SEXO_COLUMNAS.map(([, t]) => `<th scope="col" class="num">${t}</th>`).join("")}<th scope="col" class="num">Total</th></tr></thead>
          <tbody>${porAct.map(p => `<tr>
            <td class="nowrap">${fechaCorta(p.a.fecha)}</td><td class="nowrap mono"><a href="#/actividad/${p.a.id}">${esc(p.a.folio)}</a></td><td>${esc(p.a.nombre)}</td><td>${esc(p.a.tipo)}</td>
            ${p.sexo.map(n => `<td class="num ${n ? "" : "zero"}">${n}</td>`).join("")}<td class="num total">${p.n}</td></tr>`).join("")}</tbody>
        </table></div>
      </section>` : `<div class="empty"><b>No hay asistencias en este periodo.</b><p>Cambia las fechas o los filtros de arriba para ver otro periodo.</p></div>`}
    `;

    $("#csvActividades", c)?.addEventListener("click", () => {
      descargar(`resumen-actividades-${filtros.desde}-a-${filtros.hasta}.csv`, csv([
        ["Fecha", "Folio", "Actividad", "Tipo", "Lugar", "Facilitadora", "Puesto", "Hora de inicio", "Hora de término", "Horas", "Mujeres", "Hombres", "Otro", "Total",
          ...GRUPOS.map(([g, t]) => `${g}) ${t}`), ...RANGOS.map(([l, t]) => `${l}) ${t}`)],
        ...porAct.map(p => {
          const de = r.registros.filter(x => x.actividad.id === p.a.id);
          return [fechaCorta(p.a.fecha), p.a.folio, p.a.nombre, p.a.tipo, p.a.lugar, p.a.facilitadora, p.a.puesto,
            p.a.horaInicio || "", p.a.horaFin || "", minutosEntre(p.a.horaInicio, p.a.horaFin) == null ? "" : (minutosEntre(p.a.horaInicio, p.a.horaFin) / 60).toFixed(2), ...p.sexo, p.n,
            ...GRUPOS.map(([g]) => de.filter(x => x.grupo === g).length), ...RANGOS.map(([l]) => de.filter(x => x.rango === l).length)];
        }),
      ]), "text/csv");
    });
    $("#csvDetalle", c)?.addEventListener("click", () => {
      descargar(`asistentes-${filtros.desde}-a-${filtros.hasta}.csv`, csv([
        ["Fecha", "Folio", "Actividad", "Tipo", "CURP", "Nombre completo", "Fecha de nacimiento", "Edad", "Rango de edad", "Sexo", "Lugar de nacimiento", "Grupo", "Ocupación", "Teléfono"],
        ...r.registros.map(x => [fechaCorta(x.actividad.fecha), x.actividad.folio, x.actividad.nombre, x.actividad.tipo, x.curp || "SIN CURP", x.nombre,
          fechaCorta(x.fnac), edad(x.fnac, x.actividad.fecha), `${x.rango}) ${etiquetaRango(x.rango)}`, SEXOS.find(s => s[0] === x.sexo)?.[1] || x.sexo,
          x.lugar, `${x.grupo}) ${etiquetaGrupo(x.grupo)}`, x.ocupacion, x.telefono]),
      ]), "text/csv");
    });
  }

  $$("[data-filtro]", c).forEach(el => el.addEventListener("change", () => {
    filtros[el.dataset.filtro] = el.value;
    if (filtros.desde > filtros.hasta) {
      [filtros.desde, filtros.hasta] = [filtros.hasta, filtros.desde];
      $("#e-desde", c).value = filtros.desde;
      $("#e-hasta", c).value = filtros.hasta;
    }
    pintarResultado();
  }));
  $$("[data-contar]", c).forEach(b => b.addEventListener("click", () => { filtros.contar = b.dataset.contar; pintarResultado(); }));
  pintarResultado();
}

export default {
  menu: [{ href: "#/estadisticas", texto: "Estadísticas", activa: /^#\/estadisticas/ }],
  rutas: [[/^#\/estadisticas$/, vista]],
};
