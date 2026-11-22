// Canalizaciones a instituciones: registro de a qué institución (DIF, Fiscalía, salud…) se envió a una usuaria,
// con su motivo, estatus, fecha de seguimiento y resultado. Funciona sin conexión y se sincroniza.
// El contenido va cifrado como el de los casos (ver core/canalizaciones.js y core/expedientes.js): cada perfil ve
// las suyas y la Coordinadora las consulta todas; el catálogo de instituciones lo administra la Coordinadora.

import * as db from "../core/db.js";
import * as exp from "../core/expedientes.js";
import * as k from "../core/canalizaciones.js";
import { listarCasos } from "../core/casos.js";
import { tarjetas } from "../core/resumen.js";
import { botonIcono, menuMas, conectarMenus } from "../core/iconos.js";
import { selectorUsuaria, botonFiltros, conectarFiltros, estadoVacio, paginar } from "../core/componentes.js";
import { esCoordinadora } from "../core/auth.js";
import { puedeCrearCaso, puedeEditarCaso, puedeUsarCasos } from "../core/permisos.js";
import { agregarAlCalendario } from "../core/calendario.js";
import { hoy, fechaLarga, normalizar, nombreRol } from "../core/catalogos.js";
import { $, $$, esc, aviso, errores, dobleToque, plural, unaVez } from "../core/ui.js";
import { puerta } from "./casos.js";

const CHIP = { enviada: "prog", atendida: "ok", sin_respuesta: "", rechazada: "warn" };
const AVISO_SEG = { vencido: ["warn", "Seguimiento vencido"], hoy: ["warn", "Seguimiento hoy"], proximo: ["gold", "Seguimiento próximo"] };

const chipEstatus = d => `<span class="chip ${CHIP[d.estatus] ?? ""}">${esc(k.etiquetaEstatus(d.estatus))}</span>`;
const chipSeguimiento = d => {
  const e = k.estadoSeguimiento(d);
  return e ? `<span class="chip ${AVISO_SEG[e][0]}">${AVISO_SEG[e][1]}</span>` : "";
};
const opciones = (lista, actual, vacio) => `${vacio ? `<option value="">${esc(vacio)}</option>` : ""}${lista.map(([v, t, off]) => `<option value="${esc(v)}" ${v === actual ? "selected" : ""} ${off ? "disabled" : ""}>${esc(t)}</option>`).join("")}`;

/** Perfiles a cuyo nombre la Coordinadora puede registrar (los que tienen clave de expedientes). */
const destinosDe = async () => (await db.todos("perfiles")).filter(p => p.activa && exp.rolConCasos(p)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

/* ---------- Lista ---------- */
async function lista(ctx, usuariaId) {
  const { yo, pintar } = ctx;
  if (!puedeUsarCasos(yo)) return ctx.ir("#/");
  if (!exp.desbloqueado(yo)) return puerta(ctx, "Canalizaciones", "#/");
  await exp.actualizarCopias(yo);
  await k.sembrarInstituciones();
  const [usuarias, perfiles, instituciones] = await Promise.all([db.todos("usuarias"), db.todos("perfiles"), k.listarInstituciones()]);
  const uMap = new Map(usuarias.map(u => [u.id, u])), pMap = new Map(perfiles.map(p => [p.id, p]));
  const todas = (await k.listarCanalizaciones(yo, usuariaId)).map(c => ({ ...c, usuaria: uMap.get(c.usuariaId), perfil: pMap.get(c.perfilId) }));
  const legibles = todas.filter(c => c.legible);
  const sinAbrir = todas.length - legibles.length;
  const filtrada = usuariaId ? uMap.get(usuariaId) : null;
  const coord = esCoordinadora(yo);
  const n = e => legibles.filter(c => c.d.estatus === e).length;
  const enSeguimiento = legibles.filter(c => ["hoy", "vencido"].includes(k.estadoSeguimiento(c.d))).length;
  const orden = c => (c.d.estatus === "enviada" ? "0" : "9") + (c.d.estatus === "enviada" ? c.d.seguimiento || "9999-12-31" : "");
  legibles.sort((a, b) => orden(a).localeCompare(orden(b)) || b.d.fecha.localeCompare(a.d.fecha));
  const nombresUsados = [...new Set(legibles.map(c => c.d.nombre))].sort((a, b) => a.localeCompare(b, "es"));
  const resumen = k.ESTATUS.map(([v]) => v);
  const porInst = new Map();
  for (const c of legibles) {
    const f = porInst.get(c.d.nombre) || Object.fromEntries([["nombre", c.d.nombre], ["total", 0], ...resumen.map(v => [v, 0])]);
    f[c.d.estatus]++; f.total++;
    porInst.set(c.d.nombre, f);
  }

  const cuerpo = pintar(filtrada ? `Canalizaciones de ${filtrada.nombre}` : "Canalizaciones", `
    ${tarjetas([
      [n("enviada"), "Enviadas", "gold"],
      [enSeguimiento, "Por dar seguimiento", enSeguimiento ? "warn" : ""],
      [n("atendida"), "Atendidas", "ok"],
      [n("sin_respuesta") + n("rechazada"), "Sin respuesta o rechazadas"],
    ], { etiqueta: "Resumen de canalizaciones" })}
    <p class="hint">${coord ? "Vista de la Coordinadora: puede consultar todas las canalizaciones, sin modificarlas." : "Solo usted ve estas canalizaciones. Se abren con su PIN y viajan cifradas."}</p>
    <div class="toolbar">
      <input type="search" id="buscar" class="search" placeholder="Buscar por usuaria o institución" aria-label="Buscar canalización">
      ${botonFiltros()}
      ${coord ? botonIcono("institucion", "Instituciones", { href: "#/canalizaciones/instituciones", clase: "quieto" }) : ""}
      ${botonIcono("mas2", "Nueva", { href: filtrada ? `#/canalizaciones/nueva/${esc(filtrada.id)}` : "#/canalizaciones/nueva", clase: "quieto" })}
    </div>
    <div class="filters" id="filtros" hidden>
      <div class="field"><label for="f-estatus">Estatus</label><select id="f-estatus"><option value="">Todos los estatus</option>${k.ESTATUS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>
      <div class="field"><label for="f-inst">Institución</label><select id="f-inst"><option value="">Todas las instituciones</option>${nombresUsados.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select></div>
    </div>
    ${sinAbrir ? `<div class="issues" role="alert"><b>${plural(sinAbrir, "canalización no se puede abrir", "canalizaciones no se pueden abrir")} en este dispositivo.</b><p>${coord ? "La persona que la registró debe ingresar con su PIN para dejar su copia a la Coordinadora." : "Pueden pertenecer a una clave anterior. Si el problema continúa, avise a la Coordinadora."}</p></div>` : ""}
    ${legibles.length ? `<div class="list" id="lista">${legibles.map(c => `
      <a class="row" href="#/canalizaciones/${esc(c.id)}" data-estatus="${esc(c.d.estatus)}" data-inst="${esc(c.d.nombre)}" data-buscar="${esc(normalizar(`${c.usuaria?.nombre || ""} ${c.d.nombre}`))}">
        <span class="body"><span class="name">${esc(c.usuaria?.nombre || "Usuaria eliminada")}</span>
          <span class="meta"><span>${esc(c.d.nombre)}</span><span>${esc(fechaLarga(c.d.fecha))}</span>${coord ? `<span>${esc(c.perfil?.nombre || "")} · ${esc(nombreRol(c.perfil?.rol))}</span>` : ""}</span></span>
        <span class="end">${chipEstatus(c.d)}${chipSeguimiento(c.d)}</span>
      </a>`).join("")}</div>
      <div class="empty" id="sinResultados" hidden><b>Ninguna canalización coincide.</b><p>Modifique la búsqueda o los filtros.</p></div>`
    : estadoVacio(`Aún no hay canalizaciones${filtrada ? " de esta usuaria" : ""}.`, "Use «Nueva» para registrar a qué institución se canalizó a una usuaria y qué resultado tuvo.")}
    ${legibles.length && !filtrada ? `<details class="panel plegable"><summary>Resumen por institución</summary>
      <div class="table-scroll"><table class="data">
        <thead><tr><th scope="col">Institución</th>${k.ESTATUS.map(([, t]) => `<th scope="col" class="num">${esc(t)}</th>`).join("")}<th scope="col" class="num">Total</th></tr></thead>
        <tbody>${[...porInst.values()].sort((a, b) => b.total - a.total).map(f => `<tr><th scope="row">${esc(f.nombre)}</th>${resumen.map(v => `<td class="num ${f[v] ? "" : "zero"}">${f[v]}</td>`).join("")}<td class="num total">${f.total}</td></tr>`).join("")}</tbody>
      </table></div></details>` : ""}
  `, { atras: filtrada ? `#/usuarias/${filtrada.id}` : "#/" });

  const panel = conectarFiltros(cuerpo);
  const filtrar = () => {
    const q = normalizar($("#buscar", cuerpo).value).replace(/\s+/g, " ").trim().split(" ");
    const st = $("#f-estatus", cuerpo).value, inst = $("#f-inst", cuerpo).value;
    let visibles = 0;
    $$("#lista .row", cuerpo).forEach(r => {
      r.hidden = !(q.every(w => r.dataset.buscar.includes(w)) && (!st || r.dataset.estatus === st) && (!inst || r.dataset.inst === inst));
      if (!r.hidden) visibles++;
    });
    const sin = $("#sinResultados", cuerpo);
    if (sin) sin.hidden = visibles > 0;
    panel.contar((st ? 1 : 0) + (inst ? 1 : 0));
    pag.refrescar();
  };
  const pag = paginar($("#lista", cuerpo), { singular: "canalización", plural: "canalizaciones" });
  ["#buscar", "#f-estatus", "#f-inst"].forEach(s => $(s, cuerpo).addEventListener(s === "#buscar" ? "input" : "change", filtrar));
}

/* ---------- Formulario (nueva y editar) ---------- */
async function formulario(ctx, usuariaId, id) {
  const { yo, pintar, ir } = ctx;
  const edicion = Boolean(id);
  if (!puedeUsarCasos(yo) || (!edicion && !puedeCrearCaso(yo))) return ctx.ir("#/");
  const regreso = edicion ? `#/canalizaciones/${id}` : usuariaId ? `#/usuarias/${usuariaId}` : "#/canalizaciones";
  if (!exp.desbloqueado(yo)) return puerta(ctx, edicion ? "Editar canalización" : "Nueva canalización", edicion ? regreso : "#/canalizaciones");
  await exp.actualizarCopias(yo);
  await k.sembrarInstituciones();

  const actual = edicion ? await k.unaCanalizacion(id) : null;
  if (edicion && (!actual || !actual.legible || !puedeEditarCaso(yo, actual))) return ir("#/canalizaciones");
  const coord = esCoordinadora(yo);
  const usuarias = (await db.todos("usuarias")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const fija = edicion ? usuarias.find(u => u.id === actual.usuariaId) : usuariaId && usuarias.find(u => u.id === usuariaId);
  const destinos = coord ? await destinosDe() : [];
  const todasInst = await k.listarInstituciones();
  const instOpc = todasInst.filter(i => i.activa !== false || i.id === actual?.d.institucionId);
  const d = actual?.d || { fecha: hoy(), estatus: "enviada", seguimiento: "", motivo: "", resultado: "", casoId: "", institucionId: "" };
  let elegida = fija || null;
  let casoInicial = d.casoId || "";

  const cuerpo = pintar(edicion ? "Editar canalización" : coord ? "Nueva canalización (a nombre de un perfil)" : "Nueva canalización", `
    <section class="panel stack">
      <div class="card-head"><p class="hint context">${edicion ? "Edición" : "Registro"}</p><span class="icon-row">${botonIcono("salir", "Cancelar", { href: regreso, clase: "quieto" })}</span></div>
      <p class="hint">${coord && !edicion ? "La canalización quedará a nombre del perfil que elija, que será quien le dé seguimiento; usted podrá consultarla. Después solo ese perfil la modifica." : "La institución, el motivo y el resultado se guardan cifrados. Solo usted podrá leerlos; la Coordinadora los puede consultar."}</p>
      <div class="field" id="usuaria"></div>
      <div class="grid" id="f">
        ${coord && !edicion ? `<div class="field span-2"><label for="c-destino">Registrar a nombre de</label>
          <select id="c-destino" data-campo="destinoId">${destinos.map(p => `<option value="${esc(p.id)}" ${exp.puedeLeer(p.id) ? "" : "disabled"}>${esc(p.nombre)} · ${esc(nombreRol(p.rol))}${exp.puedeLeer(p.id) ? "" : " (debe ingresar una vez con su PIN)"}</option>`).join("")}</select></div>` : ""}
        <div class="field span-2"><label for="c-inst">Institución</label>
          <select id="c-inst" data-campo="institucionId">${opciones(instOpc.map(i => [i.id, i.activa === false ? `${i.nombre} (inactiva)` : i.nombre]), d.institucionId, "Seleccione la institución")}</select>
          ${instOpc.length ? "" : `<p class="note">No hay instituciones en el catálogo. La Coordinadora puede agregarlas desde «Instituciones».</p>`}</div>
        <div class="field"><label for="c-fecha">Fecha de la canalización</label><input id="c-fecha" type="date" data-campo="fecha" value="${esc(d.fecha)}" max="${hoy()}"></div>
        <div class="field"><label for="c-estatus">Estatus</label><select id="c-estatus" data-campo="estatus">${opciones(k.ESTATUS, d.estatus)}</select></div>
        <div class="field span-2"><label for="c-motivo">Motivo de la canalización</label><textarea id="c-motivo" class="notas" rows="3" data-campo="motivo" placeholder="Por qué se canaliza y qué se solicita a la institución.">${esc(d.motivo)}</textarea></div>
        <div class="field" id="campoSeg"><label for="c-seg">Fecha de seguimiento (opcional)</label><input id="c-seg" type="date" data-campo="seguimiento" value="${esc(d.seguimiento)}"></div>
        <div class="field span-2"><label for="c-caso">Caso relacionado (opcional)</label><select id="c-caso" data-campo="casoId"><option value="">Sin caso relacionado</option></select></div>
        <div class="field span-2"><label for="c-resultado">Resultado o respuesta de la institución (opcional)</label><textarea id="c-resultado" class="notas" rows="3" data-campo="resultado" placeholder="Qué respondió o resolvió la institución.">${esc(d.resultado)}</textarea></div>
      </div>
      <div id="err"></div>
    </section>
    <div class="barra-fija"><button class="btn primary" id="guardar">${edicion ? "Guardar cambios" : "Registrar canalización"}</button></div>`, { atras: regreso });

  selectorUsuaria($("#usuaria", cuerpo), { usuarias, elegida, fija: Boolean(fija), onElegir: u => { elegida = u; casoInicial = ""; cargarCasos(); } });

  const estatusEl = $("#c-estatus", cuerpo), segEl = $("#campoSeg", cuerpo), casoEl = $("#c-caso", cuerpo), destinoEl = $("#c-destino", cuerpo);
  const verSeguimiento = () => { segEl.hidden = estatusEl.value !== "enviada"; };
  estatusEl.addEventListener("change", verSeguimiento);
  verSeguimiento();

  // Casos de la usuaria que lleva el mismo perfil (se leen cifrados con su clave)
  async function cargarCasos() {
    const dueno = edicion ? actual.perfilId : coord ? destinoEl?.value : yo.id;
    const previo = casoEl.value || casoInicial;
    let casos = [];
    if (elegida && dueno) casos = (await listarCasos(yo, elegida.id)).filter(c => c.legible && c.perfilId === dueno);
    casoEl.innerHTML = opciones(casos.map(c => [c.id, c.d.asunto || "Caso sin asunto"]), previo, "Sin caso relacionado");
  }
  destinoEl?.addEventListener("change", () => { casoInicial = ""; cargarCasos(); });
  await cargarCasos();

  $("#guardar", cuerpo).onclick = unaVez(async () => {
    const v = Object.fromEntries($$("[data-campo]", cuerpo).map(el => [el.dataset.campo, el.value.trim()]));
    const inst = todasInst.find(i => i.id === v.institucionId);
    const destino = edicion ? yo : coord ? destinos.find(p => p.id === v.destinoId && exp.puedeLeer(p.id)) : yo;
    const e = [];
    if (!elegida) e.push("Seleccione a la usuaria.");
    if (!inst) e.push("Seleccione la institución.");
    if (!destino) e.push("Seleccione el perfil a cuyo nombre se registrará (debe haber ingresado con su PIN al menos una vez).");
    if (!v.fecha) e.push("Seleccione la fecha de la canalización.");
    else if (v.fecha > hoy()) e.push("La fecha de la canalización no puede ser posterior a hoy.");
    if (!v.motivo) e.push("Escriba el motivo de la canalización.");
    if (v.estatus === "enviada" && v.seguimiento && v.seguimiento < v.fecha) e.push("La fecha de seguimiento no puede ser anterior a la de la canalización.");
    errores($("#err", cuerpo), e);
    if (e.length) return;
    if (edicion) {
      await k.guardarCanalizacion(actual, v, inst);
      aviso("Canalización actualizada");
      return ir(`#/canalizaciones/${actual.id}`);
    }
    const c = await k.crearCanalizacion(yo, elegida.id, v, inst, destino);
    aviso("Canalización registrada");
    ir(`#/canalizaciones/${c.id}`);
  });
}

/* ---------- Detalle ---------- */
async function detalle(ctx, id) {
  const { yo, pintar, ir } = ctx;
  if (!puedeUsarCasos(yo)) return ir("#/");
  if (!exp.desbloqueado(yo)) return puerta(ctx, "Canalización", "#/canalizaciones");
  await exp.actualizarCopias(yo);
  const c = await k.unaCanalizacion(id);
  if (!c || !(esCoordinadora(yo) || c.perfilId === yo.id)) return ir("#/canalizaciones");
  if (!c.legible) {
    return pintar("Canalización", `<div class="issues" role="alert"><b>Esta canalización no se puede abrir en este dispositivo.</b><p>${esCoordinadora(yo) ? "La persona que la registró debe ingresar con su PIN para dejar su copia a la Coordinadora." : "La clave del expediente no coincide. Avise a la Coordinadora."}</p></div>`, { atras: "#/canalizaciones" });
  }
  const [usuaria, perfil, inst] = await Promise.all([db.uno("usuarias", c.usuariaId), db.uno("perfiles", c.perfilId), c.d.institucionId ? db.uno("instituciones", c.d.institucionId) : null]);
  const caso = c.d.casoId ? (await listarCasos(yo, c.usuariaId)).find(x => x.id === c.d.casoId) : null;
  const edita = puedeEditarCaso(yo, c);
  const d = c.d;
  const vigente = d.estatus === "enviada" && d.seguimiento && d.seguimiento >= hoy();
  const dato = (t, v) => `<div><dt>${t}</dt><dd>${v}</dd></div>`;

  const cuerpo = pintar(usuaria?.nombre || "Canalización", `
    <section class="panel stack">
      <div class="card-head">
        <span class="meta">${chipEstatus(d)}${chipSeguimiento(d)}</span>
        <span class="icon-row">
          ${edita ? botonIcono("editar", "Editar", { href: `#/canalizaciones/${esc(c.id)}/editar`, clase: "quieto" }) : ""}
          ${vigente ? botonIcono("calendario", "Calendario", { id: "calendario", clase: "quieto", titulo: "Agregar el seguimiento al calendario" }) : ""}
          ${edita ? menuMas([{ id: "eliminar", icono: "eliminar", texto: "Eliminar canalización", clase: "danger" }]) : ""}
        </span>
      </div>
      <dl class="facts">
        ${dato("Usuaria", usuaria ? `<a href="#/usuarias/${esc(usuaria.id)}">${esc(usuaria.nombre)}</a>` : "—")}
        ${dato("Institución", `${esc(d.nombre)}${inst?.contacto ? `<br><small class="hint">${esc(inst.contacto)}</small>` : ""}`)}
        ${dato("Fecha de la canalización", esc(fechaLarga(d.fecha)))}
        ${dato("Canaliza", `${esc(perfil?.nombre || "—")} · ${esc(nombreRol(perfil?.rol))}${d.registradaPor ? `<br><small class="hint">Registrada por ${esc(d.registradaPor)}</small>` : ""}`)}
        ${dato("Motivo", `<span class="nota-texto">${esc(d.motivo || "—")}</span>`)}
        ${dato("Seguimiento", d.seguimiento ? esc(fechaLarga(d.seguimiento)) : "—")}
        ${dato("Resultado", `<span class="nota-texto">${esc(d.resultado || "Aún sin resultado")}</span>`)}
        ${d.casoId ? dato("Caso relacionado", caso ? `<a href="#/casos/${esc(caso.id)}">${esc(caso.d.asunto || "Caso sin asunto")}</a>` : "No disponible para su perfil") : ""}
      </dl>
      ${vigente ? `<p class="hint">El evento del calendario no incluye el nombre de la usuaria ni la institución, para proteger su privacidad.</p>` : ""}
      ${esCoordinadora(yo) ? `<p class="hint">Consulta de la Coordinadora: solo lectura.</p>` : ""}
    </section>
  `, { atras: "#/canalizaciones" });

  conectarMenus(cuerpo);
  const eliminar = $("#eliminar", cuerpo);
  if (eliminar) dobleToque(eliminar, "Toque nuevamente para eliminar la canalización", async () => {
    await k.borrarCanalizacion(c.id);
    aviso("Canalización eliminada");
    ir("#/canalizaciones");
  });
  $("#calendario", cuerpo)?.addEventListener("click", async () => {
    try {
      const r = await agregarAlCalendario({
        id: `canalizacion-${c.id}`, folio: "canalizacion", nombre: "Seguimiento de canalización (Centro LIBRE)",
        fecha: d.seguimiento, horaInicio: "", horaFin: "",
        descripcion: "Seguimiento de una canalización programada en la aplicación del Centro LIBRE Marquelia.",
      });
      if (r === "descargado") aviso("Archivo de calendario descargado. Ábralo para agregar el evento con sus recordatorios");
      else if (r === "compartido") aviso("Elija «Calendario» para agregar el evento con sus recordatorios");
    } catch (err) {
      console.error(err);
      aviso("No se pudo generar el archivo de calendario.");
    }
  });
}

/* ---------- Catálogo de instituciones (Coordinadora) ---------- */
async function catalogo(ctx) {
  const { yo, pintar, recargar } = ctx;
  if (!esCoordinadora(yo)) return ctx.ir("#/canalizaciones");
  await k.sembrarInstituciones();
  const lista = await k.listarInstituciones();
  const activas = lista.filter(i => i.activa !== false).length;
  let enEdicion = null;

  const cuerpo = pintar("Instituciones", `
    ${tarjetas([[activas, "Activas", "ok"], [lista.length - activas, "Inactivas"]], { etiqueta: "Resumen de instituciones" })}
    <p class="hint">Catálogo de instituciones a las que se canaliza. Una institución inactiva deja de ofrecerse al registrar, pero las canalizaciones anteriores la conservan.</p>
    <section class="panel stack" id="formInst">
      <div class="card-head"><h2 class="h3" id="tituloInst">Nueva institución</h2><span class="icon-row">${botonIcono("salir", "Cancelar", { id: "cancelarInst", clase: "quieto", extra: "hidden" })}</span></div>
      <div class="grid">
        <div class="field span-2"><label for="i-nombre">Nombre de la institución</label><input id="i-nombre" autocomplete="off" placeholder="Por ejemplo: DIF municipal"></div>
        <div class="field span-2"><label for="i-contacto">Teléfono o dirección (opcional)</label><input id="i-contacto" autocomplete="off"></div>
      </div>
      <div id="errI"></div>
      <div class="actions"><button class="btn primary" id="guardarInst">Agregar institución</button></div>
    </section>
    ${lista.length ? `<div class="list">${lista.map(i => `
      <div class="row" data-id="${esc(i.id)}">
        <span class="body"><span class="name">${esc(i.nombre)}</span>${i.contacto ? `<span class="meta"><span>${esc(i.contacto)}</span></span>` : ""}</span>
        <span class="end actions">${i.activa === false ? `<span class="chip">Inactiva</span>` : ""}
          ${botonIcono("editar", "Editar", { clase: "quieto", extra: 'data-accion="editar"' })}
          ${botonIcono(i.activa === false ? "activar" : "apagar", i.activa === false ? "Activar" : "Desactivar", { clase: "quieto", extra: 'data-accion="alternar"' })}
          ${botonIcono("eliminar", "Quitar", { clase: "danger", extra: 'data-accion="quitar"' })}</span>
      </div>`).join("")}</div>` : estadoVacio("El catálogo está vacío.", "Agregue la primera institución con el formulario de arriba.")}
  `, { atras: "#/canalizaciones" });
  paginar($("section ~ .list", cuerpo), { singular: "institución", plural: "instituciones" });

  const nombre = $("#i-nombre", cuerpo), contacto = $("#i-contacto", cuerpo), cancelar = $("#cancelarInst", cuerpo);
  const limpiar = () => {
    enEdicion = null; nombre.value = ""; contacto.value = ""; cancelar.hidden = true;
    $("#tituloInst", cuerpo).textContent = "Nueva institución";
    $("#guardarInst", cuerpo).textContent = "Agregar institución";
  };
  cancelar.onclick = limpiar;
  $("#guardarInst", cuerpo).onclick = unaVez(async () => {
    const e = [];
    if (!nombre.value.trim()) e.push("Escriba el nombre de la institución.");
    else if (lista.some(i => i.id !== enEdicion?.id && normalizar(i.nombre) === normalizar(nombre.value.trim()))) e.push("Ya existe una institución con ese nombre.");
    errores($("#errI", cuerpo), e);
    if (e.length) return;
    await k.guardarInstitucion(enEdicion, { nombre: nombre.value, contacto: contacto.value });
    aviso(enEdicion ? "Institución actualizada" : "Institución agregada");
    recargar();
  });
  $$(".row[data-id]", cuerpo).forEach(fila => {
    const inst = lista.find(i => i.id === fila.dataset.id);
    $('[data-accion="editar"]', fila).onclick = () => {
      enEdicion = inst; nombre.value = inst.nombre; contacto.value = inst.contacto || ""; cancelar.hidden = false;
      $("#tituloInst", cuerpo).textContent = "Editar institución";
      $("#guardarInst", cuerpo).textContent = "Guardar cambios";
      $("#formInst", cuerpo).scrollIntoView({ block: "center" });
      nombre.focus();
    };
    $('[data-accion="alternar"]', fila).onclick = async () => {
      await k.activarInstitucion(inst, inst.activa === false);
      aviso(inst.activa === false ? "Institución activada" : "Institución desactivada");
      recargar();
    };
    dobleToque($('[data-accion="quitar"]', fila), "Toque nuevamente para quitarla del catálogo", async () => {
      await k.quitarInstitucion(inst.id);
      aviso("Institución quitada");
      recargar();
    });
  });
}

export default {
  menu: [],
  rutas: [
    [/^#\/canalizaciones$/, ctx => lista(ctx)],
    [/^#\/canalizaciones\/usuaria\/([\w-]+)$/, lista],
    [/^#\/canalizaciones\/instituciones$/, catalogo],
    [/^#\/canalizaciones\/nueva(?:\/([\w-]+))?$/, (ctx, usuariaId) => formulario(ctx, usuariaId, null)],
    [/^#\/canalizaciones\/([\w-]+)\/editar$/, (ctx, id) => formulario(ctx, null, id)],
    [/^#\/canalizaciones\/(?!nueva$|usuaria$|instituciones$)([\w-]+)$/, detalle],
  ],
};
