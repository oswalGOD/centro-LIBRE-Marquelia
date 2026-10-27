// Módulo de actividades: lista, alta/edición y detalle con sus asistentes.

import * as db from "../core/db.js";
import { TIPOS_ACTIVIDAD, hoy, fechaLarga, mesCorto, edad, rangoDe, etiquetaGrupo, normalizar } from "../core/catalogos.js";
import { esCoordinadora } from "../core/auth.js";
import { puedeVer, puedeEditar } from "../core/permisos.js";
import { $, $$, esc, aviso, errores, leerCampos, dobleToque, plural } from "../core/ui.js";
import { captura } from "./captura.js";
import { formato } from "./formato.js";

const ID = "([\\w-]+)";

async function lista({ yo, pintar }) {
  const acts = (await db.todos("actividades"))
    .filter(a => puedeVer(yo, a))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
  const asis = await db.todos("asistencias");
  const cuenta = id => asis.filter(x => x.actividadId === id).length;
  const abiertas = acts.filter(a => a.estado !== "cerrada").length;

  const c = pintar("Actividades", `
    <div class="toolbar">
      <a class="btn primary" href="#/actividad/nueva">Nueva actividad</a>
      ${acts.length > 6 ? `<input type="search" id="buscar" class="search" placeholder="Buscar por nombre, folio o lugar" aria-label="Buscar actividad">` : ""}
      <p class="hint">${plural(acts.length, "actividad", "actividades")} · ${plural(abiertas, "abierta", "abiertas")}</p>
    </div>
    ${acts.length ? `<div class="list" id="lista">${acts.map(a => `
      <a class="row" href="#/actividad/${a.id}" data-buscar="${esc(normalizar(`${a.nombre} ${a.folio} ${a.lugar} ${a.tipo} ${a.facilitadora}`))}">
        <span class="date"><b>${Number(a.fecha.slice(8, 10))}</b><small>${mesCorto(a.fecha)}</small></span>
        <span class="body"><span class="name">${esc(a.nombre)}</span>
          <span class="meta"><span>${esc(a.folio)}</span><span>${esc(a.tipo)}</span><span>${esc(a.lugar)}</span>${esCoordinadora(yo) ? `<span>${esc(a.facilitadora)}</span>` : ""}</span></span>
        <span class="end"><span class="big">${cuenta(a.id)}</span><small>asistentes</small>
          ${a.estado === "cerrada" ? `<span class="chip">Cerrada</span>` : `<span class="chip ok">Abierta</span>`}</span>
      </a>`).join("")}</div>`
    : `<div class="empty"><b>Todavía no hay actividades.</b><p>Crea la primera con “Nueva actividad”. Después podrás registrar a cada asistente con su firma e imprimir la lista.</p></div>`}
  `);
  $("#buscar", c)?.addEventListener("input", e => {
    const q = normalizar(e.target.value);
    $$("#lista .row").forEach(r => (r.hidden = !r.dataset.buscar.includes(q)));
  });
}

async function formulario({ yo, pintar, ir }, id) {
  const act = id ? await db.uno("actividades", id) : null;
  if (id && (!act || !puedeEditar(yo, act))) return ir(id ? `#/actividad/${id}` : "#/");
  const perfiles = (await db.todos("usuarias")).filter(u => u.activa);
  const ultimoLugar = await db.leerMeta("ultimoLugar", "Marquelia, Gro.");
  const a = act || { nombre: "", fecha: hoy(), lugar: ultimoLugar, facilitadoraId: yo.id, tipo: "Taller" };

  const c = pintar(act ? "Editar actividad" : "Nueva actividad", `
    <section class="panel stack">
      <p class="hint">Estos datos forman el encabezado del formato.${act ? "" : " El folio se asigna al guardar."}</p>
      <div class="grid" id="f">
        <div class="field span-2"><label for="a-nombre">Nombre de la actividad</label><input id="a-nombre" data-campo="nombre" value="${esc(a.nombre)}"></div>
        <div class="field"><label for="a-fecha">Fecha</label><input id="a-fecha" type="date" data-campo="fecha" value="${esc(a.fecha)}"></div>
        <div class="field"><label for="a-lugar">Lugar de desarrollo</label><input id="a-lugar" data-campo="lugar" value="${esc(a.lugar)}"></div>
        <div class="field"><label for="a-facilitadora">Facilitadora</label>
          <select id="a-facilitadora" data-campo="facilitadoraId">${perfiles.map(u => `<option value="${u.id}" ${u.id === a.facilitadoraId ? "selected" : ""}>${esc(u.nombre)} · ${esc(u.rol)}</option>`).join("")}</select></div>
        <div class="field"><label for="a-tipo">Tipo de actividad</label><input id="a-tipo" data-campo="tipo" list="tipos" value="${esc(a.tipo)}">
          <datalist id="tipos">${TIPOS_ACTIVIDAD.map(t => `<option value="${t}">`).join("")}</datalist></div>
        ${act ? `<div class="field"><label>Folio</label><input value="${esc(act.folio)}" disabled></div>` : ""}
      </div>
      <div id="err"></div>
      <div class="actions"><button class="btn primary" id="guardar">${act ? "Guardar cambios" : "Crear actividad"}</button><a class="btn ghost" href="${act ? `#/actividad/${act.id}` : "#/"}">Cancelar</a></div>
    </section>`, { atras: act ? `#/actividad/${act.id}` : "#/" });

  $("#guardar", c).onclick = async () => {
    const d = leerCampos($("#f", c));
    const e = [];
    if (!d.nombre) e.push("Escribe el nombre de la actividad.");
    if (!d.fecha) e.push("Elige la fecha.");
    if (!d.lugar) e.push("Escribe el lugar de desarrollo.");
    if (!d.tipo) e.push("Escribe el tipo de actividad.");
    errores($("#err", c), e);
    if (e.length) return;
    const f = perfiles.find(u => u.id === d.facilitadoraId);
    const registro = {
      ...(act || { id: db.uid(), folio: await db.siguienteFolio(d.fecha), creadaPor: yo.id, estado: "abierta" }),
      nombre: d.nombre, fecha: d.fecha, lugar: d.lugar, tipo: d.tipo,
      facilitadoraId: f.id, facilitadora: f.nombre, puesto: f.rol,
    };
    await db.guardar("actividades", registro);
    await db.escribirMeta("ultimoLugar", d.lugar);
    aviso(act ? "Cambios guardados" : `Actividad creada con folio ${registro.folio}`);
    ir(`#/actividad/${registro.id}`);
  };
}

async function detalle({ yo, pintar, ir }, id) {
  const a = await db.uno("actividades", id);
  if (!a || !puedeVer(yo, a)) return ir("#/");
  const editable = puedeEditar(yo, a);
  const asis = (await db.todos("asistencias", "actividadId", id)).sort((x, y) => x.orden - y.orden);
  const n = s => asis.filter(x => x.datos.sexo === s).length;
  const sinFirma = asis.filter(x => !x.firma).length;

  const c = pintar(a.nombre, `
    <section class="panel">
      <dl class="facts">
        <div><dt>Folio</dt><dd class="mono">${esc(a.folio)}</dd></div>
        <div><dt>Fecha</dt><dd>${fechaLarga(a.fecha)}</dd></div>
        <div><dt>Lugar</dt><dd>${esc(a.lugar)}</dd></div>
        <div><dt>Facilitadora</dt><dd>${esc(a.facilitadora)} · ${esc(a.puesto)}</dd></div>
        <div><dt>Tipo</dt><dd>${esc(a.tipo)}</dd></div>
        <div><dt>Estado</dt><dd>${a.estado === "cerrada" ? `<span class="chip">Cerrada</span>` : `<span class="chip ok">Abierta</span>`}</dd></div>
      </dl>
    </section>
    <div class="toolbar">
      ${editable ? `<a class="btn primary" href="#/actividad/${a.id}/registrar">Registrar asistente</a>` : ""}
      <a class="btn" href="#/actividad/${a.id}/formato">Ver e imprimir formato</a>
      ${editable ? `<a class="btn ghost" href="#/actividad/${a.id}/editar">Editar datos</a>` : ""}
    </div>
    <section class="stack">
      <div class="section-head"><h2>Asistentes</h2>
        <div class="stats"><span><b>${asis.length}</b> en total</span><span><b>${n("M")}</b> mujeres</span><span><b>${n("H")}</b> hombres</span><span><b>${n("Otro")}</b> otro</span>${sinFirma ? `<span class="chip warn">${sinFirma} sin firma</span>` : ""}</div></div>
      ${asis.length ? `<div class="list">${asis.map((x, i) => {
        const p = x.datos, e = edad(p.fnac, a.fecha);
        const inner = `<span class="num">${i + 1}</span>
          <span class="body"><span class="name">${esc(p.nombre)}</span>
            <span class="meta"><span class="mono">${esc(p.curp || "Sin CURP")}</span><span>${e ?? "?"} años · ${rangoDe(e) || ""}</span><span>${esc(etiquetaGrupo(p.grupo))}</span><span>${esc(p.ocupacion)}</span></span></span>
          ${x.firma ? `<img class="sig" src="${x.firma}" alt="Firma">` : `<span class="chip warn">Falta firma</span>`}`;
        return editable ? `<a class="row person" href="#/actividad/${a.id}/registrar/${x.id}">${inner}</a>` : `<div class="row person">${inner}</div>`;
      }).join("")}</div>` : `<div class="empty"><b>Sin asistentes todavía.</b><p>${editable ? "Toca “Registrar asistente” para capturar a la primera persona. Si ya vino antes, al escribir su CURP se llenan sus datos." : "Esta actividad está cerrada."}</p></div>`}
    </section>
    <section class="panel stack quiet">
      <h2 class="h3">Cierre</h2>
      <p class="hint">${a.estado === "cerrada" ? "La lista está cerrada y ya no admite cambios." + (esCoordinadora(yo) ? " Como Coordinadora puedes reabrirla." : "") : "Cierra la actividad cuando termines de registrar. Ya no se podrán agregar ni modificar asistentes."}</p>
      <div class="actions">
        ${a.estado !== "cerrada" && puedeVer(yo, a) ? `<button class="btn" id="cerrar">Cerrar actividad</button>` : ""}
        ${a.estado === "cerrada" && esCoordinadora(yo) ? `<button class="btn" id="reabrir">Reabrir actividad</button>` : ""}
        ${esCoordinadora(yo) ? `<button class="btn danger" id="eliminar">Eliminar actividad</button>` : ""}
      </div>
    </section>
  `, { atras: "#/" });

  const cerrar = $("#cerrar", c);
  if (cerrar) dobleToque(cerrar, sinFirma ? `Hay ${sinFirma} sin firma. Toca otra vez para cerrar` : "Toca otra vez para cerrar", async () => {
    await db.guardar("actividades", { ...a, estado: "cerrada", cerradaPor: yo.id, cerradaEn: Date.now() });
    aviso("Actividad cerrada");
    detalle({ yo, pintar, ir }, id);
  });
  $("#reabrir", c)?.addEventListener("click", async () => {
    await db.guardar("actividades", { ...a, estado: "abierta" });
    aviso("Actividad reabierta");
    detalle({ yo, pintar, ir }, id);
  });
  const eliminar = $("#eliminar", c);
  if (eliminar) dobleToque(eliminar, `Se borrará con ${plural(asis.length, "asistente", "asistentes")}. Toca otra vez`, async () => {
    for (const x of asis) await db.borrar("asistencias", x.id);
    await db.borrar("actividades", a.id);
    aviso("Actividad eliminada");
    ir("#/");
  });
}

export default {
  menu: [{ href: "#/", texto: "Actividades", activa: /^#\/(actividad.*)?$/ }],
  rutas: [
    [/^#\/$/, lista],
    [/^#\/actividad\/nueva$/, ctx => formulario(ctx, null)],
    [new RegExp(`^#/actividad/${ID}/editar$`), formulario],
    [new RegExp(`^#/actividad/${ID}/registrar(?:/${ID})?$`), captura],
    [new RegExp(`^#/actividad/${ID}/formato$`), formato],
    [new RegExp(`^#/actividad/${ID}$`), detalle],
  ],
};
