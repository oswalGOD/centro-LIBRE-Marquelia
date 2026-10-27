// Módulo de actividades: lista, alta/edición y detalle con sus asistentes.

import * as db from "../core/db.js";
import { TIPOS_ACTIVIDAD, TIPOS_RETIRADOS, hoy, fechaLarga, mesCorto, edad, rangoDe, etiquetaGrupo, normalizar, minutosEntre, duracion } from "../core/catalogos.js";
import { esCoordinadora } from "../core/auth.js";
import { puedeVer, puedeEditar } from "../core/permisos.js";
import { $, $$, esc, aviso, errores, leerCampos, dobleToque, plural } from "../core/ui.js";
import { captura } from "./captura.js";
import { formato } from "./formato.js";

const ID = "([\\w-]+)";
const OTRO = "__otro";

// Filtros de la lista, vigentes mientras la app está abierta
const filtros = { mes: "", tipo: "", facilitadoraId: "", estado: "" };

async function lista({ yo, pintar }) {
  const acts = (await db.todos("actividades"))
    .filter(a => puedeVer(yo, a))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
  const asis = await db.todos("asistencias");
  const cuenta = id => asis.filter(x => x.actividadId === id).length;
  const abiertas = acts.filter(a => a.estado !== "cerrada").length;
  const muchas = acts.length > 6;
  const opciones = (lista, actual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${v === actual ? "selected" : ""}>${esc(t)}</option>`).join("");
  const meses = [...new Set(acts.map(a => a.fecha.slice(0, 7)))].map(m => [m, `${mesCorto(m + "-01")} ${m.slice(0, 4)}`]);
  const tipos = [...new Set(acts.map(a => a.tipo))].sort((x, y) => x.localeCompare(y, "es")).map(t => [t, t]);
  const facilitadoras = [...new Map(acts.map(a => [a.facilitadoraId, a.facilitadora]))].sort((x, y) => x[1].localeCompare(y[1], "es"));

  const c = pintar("Actividades", `
    <div class="toolbar">
      <a class="btn primary" href="#/actividad/nueva">Nueva actividad</a>
      ${muchas ? `<input type="search" id="buscar" class="search" placeholder="Buscar por nombre, folio o lugar" aria-label="Buscar actividad">` : ""}
      <p class="hint" id="cuenta">${plural(acts.length, "actividad", "actividades")} · ${plural(abiertas, "abierta", "abiertas")}</p>
    </div>
    ${muchas ? `<div class="filters" id="filtros">
      <div class="field"><label for="f-mes">Mes</label><select id="f-mes" data-filtro="mes"><option value="">Todos</option>${opciones(meses, filtros.mes)}</select></div>
      <div class="field"><label for="f-tipo">Tipo</label><select id="f-tipo" data-filtro="tipo"><option value="">Todos</option>${opciones(tipos, filtros.tipo)}</select></div>
      ${esCoordinadora(yo) ? `<div class="field"><label for="f-fac">Facilitadora</label><select id="f-fac" data-filtro="facilitadoraId"><option value="">Todas</option>${opciones(facilitadoras, filtros.facilitadoraId)}</select></div>` : ""}
      <div class="field"><label for="f-estado">Estado</label><select id="f-estado" data-filtro="estado"><option value="">Todas</option>${opciones([["abierta", "Abiertas"], ["cerrada", "Cerradas"]], filtros.estado)}</select></div>
    </div>` : ""}
    ${acts.length ? `<div class="list" id="lista">${acts.map(a => `
      <a class="row" href="#/actividad/${a.id}" data-buscar="${esc(normalizar(`${a.nombre} ${a.folio} ${a.lugar} ${a.tipo} ${a.facilitadora}`))}"
        data-mes="${a.fecha.slice(0, 7)}" data-tipo="${esc(a.tipo)}" data-facilitadora-id="${esc(a.facilitadoraId)}" data-estado="${a.estado === "cerrada" ? "cerrada" : "abierta"}">
        <span class="date"><b>${Number(a.fecha.slice(8, 10))}</b><small>${mesCorto(a.fecha)}</small></span>
        <span class="body"><span class="name">${esc(a.nombre)}</span>
          <span class="meta"><span>${esc(a.folio)}</span><span>${esc(a.tipo)}</span><span>${esc(a.lugar)}</span>${esCoordinadora(yo) ? `<span>${esc(a.facilitadora)}</span>` : ""}</span></span>
        <span class="end"><span class="big">${cuenta(a.id)}</span><small>asistentes</small>
          ${a.estado === "cerrada" ? `<span class="chip">Cerrada</span>` : `<span class="chip ok">Abierta</span>`}</span>
      </a>`).join("")}</div>`
    : `<div class="empty"><b>Todavía no hay actividades.</b><p>Crea la primera con “Nueva actividad”. Después podrás registrar a cada asistente con su firma e imprimir la lista.</p></div>`}
  `);
  const buscar = $("#buscar", c);
  function filtrar() {
    if (!muchas) return;
    const q = normalizar(buscar.value);
    let n = 0;
    $$("#lista .row", c).forEach(r => {
      r.hidden = !r.dataset.buscar.includes(q) || Object.entries(filtros).some(([k, v]) => v && r.dataset[k] !== v);
      if (!r.hidden) n++;
    });
    const activos = q || Object.values(filtros).some(Boolean);
    $("#cuenta", c).textContent = activos
      ? `${n} de ${plural(acts.length, "actividad", "actividades")}`
      : `${plural(acts.length, "actividad", "actividades")} · ${plural(abiertas, "abierta", "abiertas")}`;
    $("#sinResultados", c).hidden = n > 0;
  }
  if (muchas) $("#lista", c).insertAdjacentHTML("afterend", `<div class="empty" id="sinResultados" hidden><b>Ninguna actividad coincide.</b><p>Cambia la búsqueda o los filtros.</p></div>`);
  buscar?.addEventListener("input", filtrar);
  for (const k in filtros) filtros[k] = $(`[data-filtro=${k}]`, c)?.value || ""; // descarta filtros que ya no tienen opción
  $$("[data-filtro]", c).forEach(el => {
    el.addEventListener("change", () => { filtros[el.dataset.filtro] = el.value; filtrar(); });
  });
  filtrar();
}

/** Alta (id null), edición (id) o repetición de una actividad anterior (origenId). */
async function formulario({ yo, pintar, ir }, id, origenId) {
  const act = id ? await db.uno("actividades", id) : null;
  if (id && (!act || !puedeEditar(yo, act))) return ir(id ? `#/actividad/${id}` : "#/");
  const origen = origenId ? await db.uno("actividades", origenId) : null;
  if (origenId && (!origen || !puedeVer(yo, origen))) return ir("#/");
  const perfiles = (await db.todos("perfiles")).filter(u => u.activa);
  const ultimoLugar = await db.leerMeta("ultimoLugar", "Marquelia, Gro.");
  const a = act || (origen
    ? { nombre: origen.nombre, fecha: hoy(), lugar: origen.lugar, facilitadoraId: origen.facilitadoraId, tipo: origen.tipo, horaInicio: origen.horaInicio, horaFin: origen.horaFin }
    : { nombre: "", fecha: hoy(), lugar: ultimoLugar, facilitadoraId: yo.id, tipo: "Taller" });
  // Los tipos del catálogo más los que ya se escribieron a mano en otras actividades
  const usados = (await db.todos("actividades")).map(x => x.tipo).filter(t => t && !TIPOS_RETIRADOS.includes(t));
  const tipos = [...new Set([...TIPOS_ACTIVIDAD, ...usados.sort((x, y) => x.localeCompare(y, "es")), a.tipo].filter(Boolean))];
  const volver = act ? `#/actividad/${act.id}` : origen ? `#/actividad/${origen.id}` : "#/";

  const c = pintar(act ? "Editar actividad" : origen ? "Repetir actividad" : "Nueva actividad", `
    <section class="panel stack">
      <p class="hint">${origen ? `Copia de «${esc(origen.nombre)}» del ${fechaLarga(origen.fecha)}. Revisa la fecha y ajusta lo que haga falta. Al registrar asistentes verás a quienes vinieron esa vez.` : "Estos datos forman el encabezado del formato."}${act ? "" : " El folio se asigna al guardar."}</p>
      <div class="grid" id="f">
        <div class="field span-2"><label for="a-nombre">Nombre de la actividad</label><input id="a-nombre" data-campo="nombre" value="${esc(a.nombre)}"></div>
        <div class="field"><label for="a-fecha">Fecha</label><input id="a-fecha" type="date" data-campo="fecha" value="${esc(a.fecha)}"></div>
        <div class="field"><label for="a-lugar">Lugar de desarrollo</label><input id="a-lugar" data-campo="lugar" value="${esc(a.lugar)}"></div>
        <div class="field"><label for="a-facilitadora">Facilitadora</label>
          <select id="a-facilitadora" data-campo="facilitadoraId">${perfiles.map(u => `<option value="${u.id}" ${u.id === a.facilitadoraId ? "selected" : ""}>${esc(u.nombre)} · ${esc(u.rol)}</option>`).join("")}</select></div>
        <div class="field"><label for="a-tipo">Tipo de actividad</label>
          <select id="a-tipo" data-campo="tipo">${tipos.map(t => `<option ${t === a.tipo ? "selected" : ""}>${esc(t)}</option>`).join("")}<option value="${OTRO}">Otro tipo…</option></select>
          <input id="a-tipoOtro" aria-label="Escribe el tipo de actividad" placeholder="Escribe el tipo de actividad" autocomplete="off" hidden></div>
        <div class="field"><label for="a-inicio">Hora de inicio</label><input id="a-inicio" type="time" data-campo="horaInicio" value="${esc(a.horaInicio || "")}"></div>
        <div class="field"><label for="a-fin">Hora de término</label><input id="a-fin" type="time" data-campo="horaFin" value="${esc(a.horaFin || "")}"></div>
        ${act ? `<div class="field"><label>Folio</label><input value="${esc(act.folio)}" disabled></div>` : ""}
      </div>
      <div id="err"></div>
      <div class="actions"><button class="btn primary" id="guardar">${act ? "Guardar cambios" : "Crear actividad"}</button><a class="btn ghost" href="${volver}">Cancelar</a></div>
    </section>`, { atras: volver });

  const tipo = $("#a-tipo", c), tipoOtro = $("#a-tipoOtro", c);
  tipo.addEventListener("change", () => {
    tipoOtro.hidden = tipo.value !== OTRO;
    if (!tipoOtro.hidden) tipoOtro.focus();
  });

  $("#guardar", c).onclick = async () => {
    const d = leerCampos($("#f", c));
    if (d.tipo === OTRO) d.tipo = tipoOtro.value.trim().replace(/\s+/g, " ");
    const e = [];
    if (!d.nombre) e.push("Escribe el nombre de la actividad.");
    if (!d.fecha) e.push("Elige la fecha.");
    if (!d.lugar) e.push("Escribe el lugar de desarrollo.");
    if (!d.tipo) e.push("Escribe el tipo de actividad.");
    if (Boolean(d.horaInicio) !== Boolean(d.horaFin)) e.push("Escribe las dos horas, la de inicio y la de término, o deja ambas vacías.");
    else if (d.horaInicio && !minutosEntre(d.horaInicio, d.horaFin)) e.push("La hora de término debe ser después de la de inicio.");
    errores($("#err", c), e);
    if (e.length) return;
    const f = perfiles.find(u => u.id === d.facilitadoraId);
    const registro = {
      ...(act || { id: db.uid(), folio: await db.siguienteFolio(d.fecha), creadaPor: yo.id, estado: "abierta" }),
      nombre: d.nombre, fecha: d.fecha, lugar: d.lugar, tipo: d.tipo,
      horaInicio: d.horaInicio || "", horaFin: d.horaFin || "",
      facilitadoraId: f.id, facilitadora: f.nombre, puesto: f.rol,
      ...(origen ? { anteriorId: origen.id } : {}),
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
        ${a.horaInicio ? `<div><dt>Horario</dt><dd>${esc(a.horaInicio)} a ${esc(a.horaFin)} · ${duracion(minutosEntre(a.horaInicio, a.horaFin))}</dd></div>` : ""}
        <div><dt>Facilitadora</dt><dd>${esc(a.facilitadora)} · ${esc(a.puesto)}</dd></div>
        <div><dt>Tipo</dt><dd>${esc(a.tipo)}</dd></div>
        <div><dt>Estado</dt><dd>${a.estado === "cerrada" ? `<span class="chip">Cerrada</span>` : `<span class="chip ok">Abierta</span>`}</dd></div>
      </dl>
    </section>
    <div class="toolbar">
      ${editable ? `<a class="btn primary" href="#/actividad/${a.id}/registrar">Registrar asistente</a>` : ""}
      <a class="btn" href="#/actividad/${a.id}/formato">Ver e imprimir formato</a>
      ${editable ? `<a class="btn ghost" href="#/actividad/${a.id}/editar">Editar datos</a>` : ""}
      <a class="btn ghost" href="#/actividad/${a.id}/repetir">Repetir actividad</a>
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
    <section class="panel stack">
      <div><h2 class="h3">Notas de la actividad</h2>
        <p class="hint">Temas tratados, acuerdos y observaciones. Se pueden escribir aunque la actividad esté cerrada y se imprimen en una hoja aparte después de la lista.</p></div>
      <div class="field"><label for="notas" class="visually-hidden">Notas de la actividad</label><textarea id="notas" class="notas" rows="5" maxlength="4000">${esc(a.notas || "")}</textarea></div>
      <div class="actions"><button class="btn" id="guardarNotas">Guardar notas</button></div>
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

  $("#guardarNotas", c).addEventListener("click", async () => {
    const notas = $("#notas", c).value.trim();
    await db.guardar("actividades", { ...(await db.uno("actividades", id)), notas });
    aviso("Notas guardadas");
  });

  const cerrar = $("#cerrar", c);
  if (cerrar) dobleToque(cerrar, sinFirma ? `Hay ${sinFirma} sin firma. Toca otra vez para cerrar` : "Toca otra vez para cerrar", async () => {
    await db.guardar("actividades", { ...(await db.uno("actividades", id)), estado: "cerrada", cerradaPor: yo.id, cerradaEn: Date.now() });
    aviso("Actividad cerrada");
    detalle({ yo, pintar, ir }, id);
  });
  $("#reabrir", c)?.addEventListener("click", async () => {
    await db.guardar("actividades", { ...(await db.uno("actividades", id)), estado: "abierta" });
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
    [new RegExp(`^#/actividad/${ID}/repetir$`), (ctx, origenId) => formulario(ctx, null, origenId)],
    [new RegExp(`^#/actividad/${ID}/registrar(?:/${ID})?$`), captura],
    [new RegExp(`^#/actividad/${ID}/formato$`), formato],
    [new RegExp(`^#/actividad/${ID}$`), detalle],
  ],
};
