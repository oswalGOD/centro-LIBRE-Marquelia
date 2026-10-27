// Padrón de asistentes: todas las personas registradas alguna vez, con su historial.

import * as db from "../core/db.js";
import { GRUPOS, SEXOS, leerCurp, limpiarCurp, edad, etiquetaGrupo, etiquetaSexo, fechaLarga, normalizar } from "../core/catalogos.js";
import { esCoordinadora } from "../core/auth.js";
import { puedeVer } from "../core/permisos.js";
import { $, $$, esc, aviso, errores, dobleToque, plural } from "../core/ui.js";

async function lista({ pintar }) {
  const personas = (await db.todos("personas")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const asis = await db.todos("asistencias");
  const visitas = id => asis.filter(x => x.personaId === id).length;

  const c = pintar("Padrón de asistentes", `
    <div class="toolbar">
      <input type="search" id="buscar" class="search" placeholder="Buscar por nombre, CURP o teléfono" aria-label="Buscar en el padrón">
      <p class="hint" id="conteo">${plural(personas.length, "persona", "personas")}</p>
    </div>
    ${personas.length ? `<div class="list" id="lista">${personas.map(p => `
      <a class="row" href="#/padron/${p.id}" data-buscar="${esc(normalizar(`${p.nombre} ${p.curp || ""} ${p.telefono}`))}">
        <span class="body"><span class="name">${esc(p.nombre)}</span>
          <span class="meta"><span class="mono">${esc(p.curp || "Sin CURP")}</span><span>${edad(p.fnac) ?? "?"} años</span><span>${esc(etiquetaSexo(p.sexo))}</span><span>${esc(etiquetaGrupo(p.grupo))}</span></span></span>
        <span class="end"><span class="big">${visitas(p.id)}</span><small>${visitas(p.id) === 1 ? "actividad" : "actividades"}</small></span>
      </a>`).join("")}</div>`
    : `<div class="empty"><b>El padrón está vacío.</b><p>Cada persona que registres en una actividad se agrega aquí. La próxima vez que asista, basta con escribir su CURP o buscar su nombre.</p></div>`}
  `);
  $("#buscar", c).addEventListener("input", e => {
    const q = normalizar(e.target.value).replace(/\s+/g, " ").trim().split(" ");
    let n = 0;
    $$("#lista .row", c).forEach(r => { r.hidden = !q.every(w => r.dataset.buscar.includes(w)); if (!r.hidden) n++; });
    $("#conteo", c).textContent = plural(n, "persona", "personas");
  });
}

async function ficha({ yo, pintar, ir }, id) {
  const p = await db.uno("personas", id);
  if (!p) return ir("#/padron");
  const asis = await db.todos("asistencias", "personaId", id);
  const acts = (await db.todos("actividades")).filter(a => asis.some(x => x.actividadId === a.id)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const visibles = acts.filter(a => puedeVer(yo, a));
  const ocultas = acts.length - visibles.length;

  const c = pintar(p.nombre, `
    <section class="panel stack">
      <div class="section-head"><h2 class="h3">Datos personales</h2><p class="hint">Los cambios se usarán la próxima vez que asista. Las listas ya firmadas conservan los datos de ese día.</p></div>
      <div class="grid" id="f">
        <div class="field span-2"><label for="p-curp">CURP</label><input id="p-curp" class="upper" maxlength="18" value="${esc(p.curp || "")}" placeholder="Vacío si no tiene CURP"></div>
        <div class="field span-2"><label for="p-nombre">Nombre completo</label><input id="p-nombre" value="${esc(p.nombre)}"></div>
        <div class="field"><label for="p-fnac">Fecha de nacimiento</label><input id="p-fnac" type="date" value="${esc(p.fnac)}"></div>
        <div class="field"><label for="p-lugar">Lugar de nacimiento</label><input id="p-lugar" value="${esc(p.lugar)}"></div>
        <div class="field"><label for="p-ocupacion">Ocupación</label><input id="p-ocupacion" value="${esc(p.ocupacion)}"></div>
        <div class="field"><label for="p-telefono">Teléfono</label><input id="p-telefono" type="tel" inputmode="tel" value="${esc(p.telefono)}"></div>
        <div class="field"><label for="p-sexo">Sexo</label><select id="p-sexo">${SEXOS.map(([v, t]) => `<option value="${v}" ${p.sexo === v ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label for="p-grupo">Grupo</label><select id="p-grupo">${GRUPOS.map(([v, t]) => `<option value="${v}" ${p.grupo === v ? "selected" : ""}>${v}) ${t}</option>`).join("")}</select></div>
      </div>
      <div id="err"></div>
      <div class="actions"><button class="btn primary" id="guardar">Guardar cambios</button>
        ${esCoordinadora(yo) && !asis.length ? `<button class="btn danger push" id="eliminar">Eliminar del padrón</button>` : ""}</div>
    </section>
    <section class="stack">
      <h2>Historial de asistencia</h2>
      ${visibles.length ? `<div class="list">${visibles.map(a => `<a class="row" href="#/actividad/${a.id}"><span class="body"><span class="name">${esc(a.nombre)}</span><span class="meta"><span>${fechaLarga(a.fecha)}</span><span class="mono">${esc(a.folio)}</span><span>${esc(a.tipo)}</span></span></span></a>`).join("")}</div>` : ""}
      ${ocultas ? `<p class="hint">Además asistió a ${plural(ocultas, "actividad", "actividades")} de otras facilitadoras.</p>` : ""}
      ${!acts.length ? `<p class="hint">Todavía no asiste a ninguna actividad.</p>` : ""}
    </section>
  `, { atras: "#/padron" });

  $("#guardar", c).onclick = async () => {
    const v = k => $(`#p-${k}`, c).value.trim();
    const curp = limpiarCurp(v("curp"));
    const e = [];
    if (curp && !leerCurp(curp)) e.push("La CURP no tiene un formato válido.");
    const otra = curp && (await db.porIndice("personas", "curp", curp));
    if (otra && otra.id !== p.id) e.push(`Esa CURP ya pertenece a ${otra.nombre}.`);
    if (v("nombre").split(/\s+/).length < 2) e.push("Escribe el nombre completo con apellidos.");
    if (!v("fnac")) e.push("Falta la fecha de nacimiento.");
    if (v("telefono").replace(/\D/g, "").length !== 10) e.push("El teléfono debe tener 10 dígitos.");
    errores($("#err", c), e);
    if (e.length) return;
    const nuevo = { ...p, nombre: v("nombre").replace(/\s+/g, " "), fnac: v("fnac"), lugar: v("lugar"), ocupacion: v("ocupacion"), telefono: v("telefono").replace(/\D/g, ""), sexo: v("sexo"), grupo: v("grupo") };
    if (curp) nuevo.curp = curp; else delete nuevo.curp;
    await db.guardar("personas", nuevo);
    aviso("Datos actualizados");
    ficha({ yo, pintar, ir }, id);
  };
  const eliminar = $("#eliminar", c);
  if (eliminar) dobleToque(eliminar, "Toca otra vez para eliminar", async () => {
    await db.borrar("personas", id);
    aviso("Persona eliminada del padrón");
    ir("#/padron");
  });
}

export default {
  menu: [{ href: "#/padron", texto: "Padrón", activa: /^#\/padron/ }],
  rutas: [
    [/^#\/padron$/, lista],
    [/^#\/padron\/([\w-]+)$/, ficha],
  ],
};
