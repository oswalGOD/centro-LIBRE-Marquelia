// Módulo de actividades: lista, alta/edición y detalle con sus asistentes.

import * as db from "../core/db.js";
import { TIPOS_ACTIVIDAD, TIPOS_RETIRADOS, hoy, fechaLarga, mesCorto, edad, rangoDe, etiquetaGrupo, normalizar, minutosEntre, duracion } from "../core/catalogos.js";
import { esCoordinadora } from "../core/auth.js";
import { puedeVer, puedeEditar } from "../core/permisos.js";
import { $, $$, esc, aviso, errores, leerCampos, dobleToque, plural, unaVez } from "../core/ui.js";
import { captura } from "./captura.js";
import { formato } from "./formato.js";
import * as evidencias from "../core/evidencias.js";
import * as kiosko from "../core/kiosko.js";
import { icono, botonIcono, menuMas, conectarMenus } from "../core/iconos.js";
import { seccionActividad, tomarFotos, agregarDeGaleria } from "./evidencias.js";

const ID = "([\\w-]+)";
const OTRO = "__otro";
const TIPO_CURSO = "Curso";
const listaDe = a => (a?.curso ? "#/cursos" : "#/asistencia");

// Filtros de la lista, vigentes mientras la app está abierta
const filtros = { mes: "", tipo: "", facilitadoraId: "", estado: "" };

async function lista({ yo, pintar }, curso = false) {
  const N = curso
    ? { titulo: "Cursos y capacitaciones", uno: "curso", varios: "cursos", abierto: "abierto", abiertos: "abiertos", nuevo: "#/curso/nuevo", buscar: "Buscar por nombre, folio, lugar o instructora" }
    : { titulo: "Actividades", uno: "actividad", varios: "actividades", abierto: "abierta", abiertos: "abiertas", nuevo: "#/actividad/nueva", buscar: "Buscar por nombre, folio o lugar" };
  const acts = (await db.todos("actividades"))
    .filter(a => Boolean(a.curso) === curso && puedeVer(yo, a))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);
  const asis = await db.todos("asistencias");
  const cuenta = id => asis.filter(x => x.actividadId === id).length;
  const abiertas = acts.filter(a => a.estado !== "cerrada").length;
  const muchas = acts.length > 6;
  const opciones = (lista, actual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${v === actual ? "selected" : ""}>${esc(t)}</option>`).join("");
  const meses = [...new Set(acts.map(a => a.fecha.slice(0, 7)))].map(m => [m, `${mesCorto(m + "-01")} ${m.slice(0, 4)}`]);
  const tipos = [...new Set(acts.map(a => a.tipo))].sort((x, y) => x.localeCompare(y, "es")).map(t => [t, t]);
  const facilitadoras = [...new Map(acts.map(a => [a.facilitadoraId, a.facilitadora]))].sort((x, y) => x[1].localeCompare(y[1], "es"));

  const c = pintar(N.titulo, `
    <div class="toolbar">
      ${muchas ? `<input type="search" id="buscar" class="search" placeholder="${N.buscar}" aria-label="Buscar ${N.uno}">
      <span class="ib-badge"><button type="button" class="ib" id="verFiltros" aria-expanded="false" aria-controls="filtros" aria-label="Filtros" title="Filtros">${icono("filtros")}<span class="ib-et">Filtros</span></button><b id="nFiltros" hidden></b></span>` : ""}
      ${botonIcono("mas2", curso ? "Nuevo" : "Nueva", { href: N.nuevo, clase: "primary", extra: `aria-label="${curso ? "Nuevo curso" : "Nueva actividad"}" title="${curso ? "Nuevo curso" : "Nueva actividad"}"` })}
      <p class="hint" id="cuenta">${plural(acts.length, N.uno, N.varios)} · ${plural(abiertas, N.abierto, N.abiertos)}</p>
    </div>
    ${muchas ? `<div class="filters" id="filtros" hidden>
      <div class="field"><label for="f-mes">Mes</label><select id="f-mes" data-filtro="mes"><option value="">Todos</option>${opciones(meses, filtros.mes)}</select></div>
      <div class="field"><label for="f-tipo">Tipo</label><select id="f-tipo" data-filtro="tipo"><option value="">Todos</option>${opciones(tipos, filtros.tipo)}</select></div>
      ${esCoordinadora(yo) ? `<div class="field"><label for="f-fac">Facilitadora</label><select id="f-fac" data-filtro="facilitadoraId"><option value="">Todas</option>${opciones(facilitadoras, filtros.facilitadoraId)}</select></div>` : ""}
      <div class="field"><label for="f-estado">Estado</label><select id="f-estado" data-filtro="estado"><option value="">Todas</option>${opciones([["abierta", "Abiertas"], ["cerrada", "Cerradas"]], filtros.estado)}</select></div>
    </div>` : ""}
    ${acts.length ? `<div class="list" id="lista">${acts.map(a => `
      <a class="row" href="#/actividad/${esc(a.id)}" data-buscar="${esc(normalizar(`${a.nombre} ${a.folio} ${a.lugar} ${a.tipo} ${a.facilitadora} ${a.instructora || ""}`))}"
        data-mes="${a.fecha.slice(0, 7)}" data-tipo="${esc(a.tipo)}" data-facilitadora-id="${esc(a.facilitadoraId)}" data-estado="${a.estado === "cerrada" ? "cerrada" : "abierta"}">
        <span class="date"><b>${Number(a.fecha.slice(8, 10))}</b><small>${mesCorto(a.fecha)}</small></span>
        <span class="body"><span class="name">${esc(a.nombre)}</span>
          <span class="meta"><span>${esc(a.folio)}</span><span>${esc(curso ? `${a.horas} h` : a.tipo)}</span><span>${esc(a.lugar)}</span>${esCoordinadora(yo) ? `<span>${esc(a.facilitadora)}</span>` : ""}</span></span>
        <span class="end"><span class="big">${cuenta(a.id)}</span><small>asistentes</small>
          ${a.estado === "cerrada" ? `<span class="chip">${curso ? "Cerrado" : "Cerrada"}</span>` : `<span class="chip ok">${curso ? "Abierto" : "Abierta"}</span>`}</span>
      </a>`).join("")}</div>`
    : `<div class="empty">${curso ? `<b>Aún no hay cursos registrados.</b><p>Cree el primero con “Nuevo”. Después podrá registrar a cada asistente con su firma, imprimir la lista y emitir las constancias.</p>` : `<b>Aún no hay actividades registradas.</b><p>Cree la primera con “Nueva actividad”. Posteriormente podrá registrar a cada asistente con su firma e imprimir la lista.</p>`}</div>`}
  `, { atras: "#/" });
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
    const nf = Object.values(filtros).filter(Boolean).length;
    $("#nFiltros", c).textContent = nf;
    $("#nFiltros", c).hidden = !nf;
    $("#verFiltros", c).setAttribute("aria-label", nf ? `Filtros: ${plural(nf, "activo", "activos")}` : "Filtros");
  }
  $("#verFiltros", c)?.addEventListener("click", e => {
    const caja = $("#filtros", c);
    caja.hidden = !caja.hidden;
    e.currentTarget.setAttribute("aria-expanded", String(!caja.hidden));
  });
  if (muchas) $("#lista", c).insertAdjacentHTML("afterend", `<div class="empty" id="sinResultados" hidden><b>Ninguna actividad coincide.</b><p>Modifique la búsqueda o los filtros.</p></div>`);
  buscar?.addEventListener("input", filtrar);
  for (const k in filtros) filtros[k] = $(`[data-filtro=${k}]`, c)?.value || ""; // descarta filtros que ya no tienen opción
  $$("[data-filtro]", c).forEach(el => {
    el.addEventListener("change", () => { filtros[el.dataset.filtro] = el.value; filtrar(); });
  });
  if (muchas && Object.values(filtros).some(Boolean)) { $("#filtros", c).hidden = false; $("#verFiltros", c).setAttribute("aria-expanded", "true"); }
  filtrar();
}

/** Alta (id null), edición (id) o repetición de una actividad anterior (origenId). */
async function formulario({ yo, pintar, ir }, id, origenId, nuevoCurso = false) {
  const act = id ? await db.uno("actividades", id) : null;
  if (id && (!act || !puedeEditar(yo, act))) return ir(id ? `#/actividad/${id}` : "#/asistencia");
  const origen = origenId ? await db.uno("actividades", origenId) : null;
  if (origenId && (!origen || !puedeVer(yo, origen))) return ir("#/asistencia");
  const curso = nuevoCurso || Boolean((act || origen)?.curso);
  const perfiles = (await db.todos("perfiles")).filter(u => u.activa);
  const ultimoLugar = await db.leerMeta("ultimoLugar", "Marquelia, Gro.");
  const a = act || (origen
    ? { nombre: origen.nombre, fecha: hoy(), lugar: origen.lugar, facilitadoraId: origen.facilitadoraId, tipo: origen.tipo, horaInicio: origen.horaInicio, horaFin: origen.horaFin, horas: origen.horas, instructora: origen.instructora }
    : { nombre: "", fecha: hoy(), lugar: ultimoLugar, facilitadoraId: yo.id, tipo: curso ? TIPO_CURSO : "Taller" });
  // Los tipos del catálogo más los que ya se escribieron a mano en otras actividades
  const usados = (await db.todos("actividades")).map(x => x.tipo).filter(t => t && t !== TIPO_CURSO && !TIPOS_RETIRADOS.includes(t));
  const tipos = [...new Set([...TIPOS_ACTIVIDAD, ...usados.sort((x, y) => x.localeCompare(y, "es")), a.tipo].filter(Boolean))];
  const volver = act ? `#/actividad/${act.id}` : origen ? `#/actividad/${origen.id}` : curso ? "#/cursos" : "#/asistencia";

  const c = pintar(`${act ? "Editar" : origen ? "Repetir" : "Nuevo"} ${curso ? "curso" : "actividad"}`.replace("Nuevo actividad", "Nueva actividad"), `
    <section class="panel stack">
      <p class="hint">${origen ? `Copia de «${esc(origen.nombre)}» del ${fechaLarga(origen.fecha)}. Verifique la fecha y ajuste lo que sea necesario. Al registrar asistentes se mostrará quiénes asistieron en esa ocasión.` : "Estos datos forman el encabezado del formato."}${act ? "" : " El folio se asigna al guardar."}</p>
      <div class="grid" id="f">
        <div class="field span-2"><label for="a-nombre">${curso ? "Nombre del curso o capacitación" : "Nombre de la actividad"}</label><input id="a-nombre" data-campo="nombre" value="${esc(a.nombre)}"></div>
        <div class="field"><label for="a-fecha">Fecha</label><input id="a-fecha" type="date" data-campo="fecha" value="${esc(a.fecha)}"></div>
        <div class="field"><label for="a-lugar">Lugar de desarrollo</label><input id="a-lugar" data-campo="lugar" value="${esc(a.lugar)}"></div>
        <div class="field"><label for="a-facilitadora">Facilitadora</label>
          <select id="a-facilitadora" data-campo="facilitadoraId">${perfiles.map(u => `<option value="${esc(u.id)}" ${u.id === a.facilitadoraId ? "selected" : ""}>${esc(u.nombre)} · ${esc(u.rol)}</option>`).join("")}</select></div>
        ${curso ? `<div class="field span-2"><label for="a-instructora">Instructora que imparte el curso</label><input id="a-instructora" data-campo="instructora" value="${esc(a.instructora || "")}" autocomplete="off"></div>
        <div class="field"><label for="a-horas">Duración total (horas)</label><input id="a-horas" type="number" inputmode="decimal" min="0.5" max="999" step="0.5" data-campo="horas" value="${esc(a.horas ?? "")}"></div>
        <input type="hidden" data-campo="tipo" value="${TIPO_CURSO}">` : `<div class="field"><label for="a-tipo">Tipo de actividad</label>
          <select id="a-tipo" data-campo="tipo">${tipos.map(t => `<option ${t === a.tipo ? "selected" : ""}>${esc(t)}</option>`).join("")}<option value="${OTRO}">Otro tipo…</option></select>
          <input id="a-tipoOtro" aria-label="Ingrese el tipo de actividad" placeholder="Ingrese el tipo de actividad" autocomplete="off" hidden></div>`}
        <div class="field"><label for="a-inicio">Hora de inicio</label><input id="a-inicio" type="time" data-campo="horaInicio" value="${esc(a.horaInicio || "")}"></div>
        <div class="field"><label for="a-fin">Hora de término</label><input id="a-fin" type="time" data-campo="horaFin" value="${esc(a.horaFin || "")}"></div>
        ${act ? `<div class="field"><label>Folio</label><input value="${esc(act.folio)}" disabled></div>` : ""}
      </div>
      <div id="err"></div>
      <div class="actions"><button class="btn primary" id="guardar">${act ? "Guardar cambios" : curso ? "Crear curso" : "Crear actividad"}</button><a class="btn ghost" href="${volver}">Cancelar</a></div>
    </section>`, { atras: volver });

  const tipo = $("#a-tipo", c), tipoOtro = $("#a-tipoOtro", c);
  tipo?.addEventListener("change", () => {
    tipoOtro.hidden = tipo.value !== OTRO;
    if (!tipoOtro.hidden) tipoOtro.focus();
  });

  $("#guardar", c).onclick = unaVez(async () => {
    const d = leerCampos($("#f", c));
    if (d.tipo === OTRO) d.tipo = tipoOtro.value.trim().replace(/\s+/g, " ");
    const e = [];
    if (!d.nombre) e.push(curso ? "Ingrese el nombre del curso." : "Ingrese el nombre de la actividad.");
    if (curso) {
      d.horas = Number(d.horas);
      if (!d.instructora) e.push("Ingrese el nombre de la instructora.");
      if (!(d.horas > 0)) e.push("Ingrese la duración del curso en horas.");
    }
    if (!d.fecha) e.push("Seleccione la fecha.");
    if (!d.lugar) e.push("Ingrese el lugar de desarrollo.");
    if (!d.tipo) e.push("Ingrese el tipo de actividad.");
    if (Boolean(d.horaInicio) !== Boolean(d.horaFin)) e.push("Ingrese ambas horas, la de inicio y la de término, o deje ambas vacías.");
    else if (d.horaInicio && !minutosEntre(d.horaInicio, d.horaFin)) e.push("La hora de término debe ser posterior a la de inicio.");
    errores($("#err", c), e);
    if (e.length) return;
    const f = perfiles.find(u => u.id === d.facilitadoraId);
    const registro = {
      ...(act || { id: db.uid(), folio: await db.siguienteFolio(d.fecha), creadaPor: yo.id, estado: "abierta" }),
      nombre: d.nombre, fecha: d.fecha, lugar: d.lugar, tipo: d.tipo,
      horaInicio: d.horaInicio || "", horaFin: d.horaFin || "",
      ...(curso ? { curso: true, horas: d.horas, instructora: d.instructora } : {}),
      facilitadoraId: f.id, facilitadora: f.nombre, puesto: f.rol,
      ...(origen ? { anteriorId: origen.id } : {}),
    };
    await db.guardar("actividades", registro);
    await db.escribirMeta("ultimoLugar", d.lugar);
    aviso(act ? "Cambios guardados" : `${curso ? "Curso creado" : "Actividad creada"} con folio ${registro.folio}`);
    ir(`#/actividad/${registro.id}`);
  });
}

async function detalle({ yo, pintar, ir }, id) {
  evidencias.liberarUrls();
  const a = await db.uno("actividades", id);
  if (!a || !puedeVer(yo, a)) return ir("#/asistencia");
  const curso = Boolean(a.curso);
  const editable = puedeEditar(yo, a);
  const asis = (await db.todos("asistencias", "actividadId", id)).sort((x, y) => x.orden - y.orden);
  const n = s => asis.filter(x => x.datos.sexo === s).length;
  const sinFirma = asis.filter(x => !x.firma && !x.sinFirma).length;

  const coord = esCoordinadora(yo);
  const opcionesMas = [
    ...(a.estado === "cerrada" && coord ? [{ id: "reabrir", icono: "reabrir", texto: "Reabrir actividad" }] : []),
    ...(coord ? [{ id: "eliminar", icono: "eliminar", texto: "Eliminar actividad", clase: "danger" }] : []),
  ];
  const c = pintar(a.nombre, `
    <section class="panel stack">
      <div class="card-head">
        ${a.estado === "cerrada" ? `<span class="chip">Cerrada</span>` : `<span class="chip ok">Abierta</span>`}
        <span class="icon-row">
          ${editable ? botonIcono("editar", "Editar", { href: `#/actividad/${a.id}/editar`, clase: "quieto" }) : ""}
          ${botonIcono("repetir", "Repetir", { href: `#/actividad/${a.id}/repetir`, clase: "quieto" })}
          ${menuMas(opcionesMas)}
        </span>
      </div>
      <dl class="facts">
        <div><dt>Folio</dt><dd class="mono">${esc(a.folio)}</dd></div>
        <div><dt>Fecha</dt><dd>${fechaLarga(a.fecha)}</dd></div>
        <div><dt>Lugar</dt><dd>${esc(a.lugar)}</dd></div>
        ${a.horaInicio ? `<div><dt>Horario</dt><dd>${esc(a.horaInicio)} a ${esc(a.horaFin)} · ${duracion(minutosEntre(a.horaInicio, a.horaFin))}</dd></div>` : ""}
        <div><dt>Facilitadora</dt><dd>${esc(a.facilitadora)} · ${esc(a.puesto)}</dd></div>
        ${curso ? `<div><dt>Instructora</dt><dd>${esc(a.instructora)}</dd></div><div><dt>Duración</dt><dd>${esc(a.horas)} ${a.horas === 1 ? "hora" : "horas"}</dd></div>` : `<div><dt>Tipo</dt><dd>${esc(a.tipo)}</dd></div>`}
      </dl>
    </section>
    <div class="actions-bar">
      ${editable ? `<a class="btn primary" href="#/actividad/${esc(a.id)}/registrar">${icono("mas2")}Registrar asistente</a>` : ""}
      ${botonIcono("formato", "Formato", { href: `#/actividad/${a.id}/formato` })}
      ${curso ? botonIcono("constancia", "Constancias", { href: `#/actividad/${a.id}/constancias` }) : ""}
      ${editable ? botonIcono("captura", "Modo captura", { id: "modoCaptura" }) : ""}
    </div>
    <section class="stack">
      <div class="section-head"><h2>Asistentes</h2>
        <div class="stats"><span><b>${asis.length}</b> en total</span><span><b>${n("M")}</b> mujeres</span><span><b>${n("H")}</b> hombres</span><span><b>${n("Otro")}</b> otro</span>${sinFirma ? `<span class="chip warn">${sinFirma} sin firma</span>` : ""}</div></div>
      ${asis.length ? `<div class="list">${asis.map((x, i) => {
        const p = x.datos, e = edad(p.fnac, a.fecha);
        const inner = `<span class="num">${i + 1}</span>
          <span class="body"><span class="name">${esc(p.nombre)}</span>
            <span class="meta"><span class="mono">${esc(p.curp || "Sin CURP")}</span><span>${e ?? "?"} años · ${rangoDe(e) || ""}</span><span>${esc(etiquetaGrupo(p.grupo))}</span><span>${esc(p.ocupacion)}</span></span></span>
          ${x.firma ? `<img class="sig" src="${esc(x.firma)}" alt="Firma">` : x.sinFirma ? `<span class="chip">Firma omitida: ${esc(x.sinFirma)}</span>` : `<span class="chip warn">Falta firma</span>`}`;
        return editable ? `<a class="row person" href="#/actividad/${esc(a.id)}/registrar/${esc(x.id)}">${inner}</a>` : `<div class="row person">${inner}</div>`;
      }).join("")}</div>` : `<div class="empty"><b>Aún no hay asistentes.</b><p>${editable ? "Seleccione “Registrar asistente” para capturar a la primera persona. Si ya asistió antes, al ingresar su CURP se completarán sus datos." : "Esta actividad está cerrada."}</p></div>`}
    </section>
    ${await seccionActividad(yo, a)}
    <section class="panel stack">
      <div><h2 class="h3">Notas de la actividad</h2>
        <p class="hint">Temas tratados, acuerdos y observaciones. Se guardan solas al salir del cuadro y se imprimen en una hoja aparte, a continuación de la lista.</p></div>
      <div class="field"><label for="notas" class="visually-hidden">Notas de la actividad</label><textarea id="notas" class="notas" rows="5" maxlength="4000">${esc(a.notas || "")}</textarea></div>
      <p class="autoguardado" id="estadoNotas" role="status"></p>
    </section>
    ${a.estado !== "cerrada" && puedeVer(yo, a) ? `<div class="barra-fija"><button class="btn" id="cerrar">${icono("cerrar", 20)}Cerrar actividad</button></div>` : ""}
  `, { atras: listaDe(a) });

  $("#tomarFotos", c)?.addEventListener("click", async () => { if (await tomarFotos(yo, a)) detalle({ yo, pintar, ir }, id); });
  $("#desdeGaleria", c)?.addEventListener("click", async () => { if (await agregarDeGaleria(yo, a)) detalle({ yo, pintar, ir }, id); });

  const modo = $("#modoCaptura", c);
  if (modo) dobleToque(modo, "Las usuarias se registrarán solas y solo podrá salir con su PIN. Toque nuevamente para activar", async () => {
    kiosko.activar(yo, a.id);
    ir("#/captura");
  });

  // Las notas se guardan al salir del cuadro, solo si cambiaron
  const campoNotas = $("#notas", c);
  let notasGuardadas = (a.notas || "").trim();
  campoNotas.addEventListener("blur", async () => {
    const notas = campoNotas.value.trim();
    if (notas === notasGuardadas) return;
    await db.guardar("actividades", { ...(await db.uno("actividades", id)), notas });
    notasGuardadas = notas;
    $("#estadoNotas", c).textContent = "Notas guardadas.";
  });
  campoNotas.addEventListener("input", () => { $("#estadoNotas", c).textContent = ""; });
  conectarMenus(c);

  const cerrar = $("#cerrar", c);
  if (cerrar) dobleToque(cerrar, sinFirma ? `Hay ${sinFirma} sin firma. Toque nuevamente para cerrar` : "Toque nuevamente para cerrar", async () => {
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
  if (eliminar) dobleToque(eliminar, `Se eliminará la actividad con ${plural(asis.length, "asistente", "asistentes")} y sus fotografías. Toque nuevamente para confirmar`, async () => {
    for (const x of asis) await db.borrar("asistencias", x.id);
    for (const f of await evidencias.de(a.id)) await evidencias.quitar(f.id);
    await db.borrar("actividades", a.id);
    aviso(curso ? "Curso eliminado" : "Actividad eliminada");
    ir(listaDe(a));
  });
}

export default {
  menu: [{ href: "#/asistencia", texto: "Actividades", activa: /^#\/(asistencia|actividad.*|cursos|curso.*)$/ }],
  rutas: [
    [/^#\/asistencia$/, ctx => lista(ctx, false)],
    [/^#\/cursos$/, ctx => lista(ctx, true)],
    [/^#\/curso\/nuevo$/, ctx => formulario(ctx, null, null, true)],
    [/^#\/actividad\/nueva$/, ctx => formulario(ctx, null)],
    [new RegExp(`^#/actividad/${ID}/editar$`), formulario],
    [new RegExp(`^#/actividad/${ID}/repetir$`), (ctx, origenId) => formulario(ctx, null, origenId)],
    [new RegExp(`^#/actividad/${ID}/registrar(?:/${ID})?$`), captura],
    [new RegExp(`^#/actividad/${ID}/formato$`), formato],
    [new RegExp(`^#/actividad/${ID}$`), detalle],
  ],
};
