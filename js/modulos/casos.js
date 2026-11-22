// Seguimiento de casos confidenciales: expediente por usuaria con notas de sesión, fechas de seguimiento y estatus.
// Lo usan la Asesora Psicoemocional y la Asesora Jurídica (cada una ve solo sus casos); la Coordinadora los ve todos, solo para lectura.
// El contenido va cifrado (ver core/expedientes.js): al entrar se pide el PIN si las claves no están abiertas.

import * as db from "../core/db.js";
import * as exp from "../core/expedientes.js";
import * as c from "../core/casos.js";
import * as citasCore from "../core/citas.js";
import { tarjetas } from "../core/resumen.js";
import { botonIcono } from "../core/iconos.js";
import { selectorUsuaria, botonFiltros, conectarFiltros, estadoVacio, lineaTiempo, paginar } from "../core/componentes.js";
import { esperaPin, pinFallido, pinCorrecto, verificarPin, esCoordinadora } from "../core/auth.js";
import { puedeCrearCaso, puedeEditarCaso, puedeUsarCasos } from "../core/permisos.js";
import { agregarAlCalendario } from "../core/calendario.js";
import { hoy, fechaLarga, normalizar, nombreRol } from "../core/catalogos.js";
import { $, $$, esc, aviso, errores, dobleToque, plural, unaVez } from "../core/ui.js";

const CHIP = { abierto: "ok", en_proceso: "prog", cerrado: "" };
const AVISO_SEG = { vencido: ["warn", "Seguimiento vencido"], hoy: ["warn", "Seguimiento hoy"], proximo: ["gold", "Seguimiento próximo"] };

const hora12 = h => h || "";
const chipEstatus = d => `<span class="chip ${CHIP[d.estatus] || ""}">${esc(c.etiquetaEstatus(d.estatus))}</span>`;
const chipSeguimiento = d => {
  const e = c.estadoSeguimiento(d);
  return e ? `<span class="chip ${AVISO_SEG[e][0]}">${AVISO_SEG[e][1]}</span>` : "";
};
const textoSeguimiento = d => (d.proximo ? `${fechaLarga(d.proximo)}${hora12(d.hora) ? `, ${hora12(d.hora)} h` : ""}` : "");

/* ---------- Puerta: pide el PIN si las claves no están abiertas en esta sesión ---------- */
export function puerta(ctx, titulo, atras) {
  const { yo, pintar } = ctx;
  const cuerpo = pintar(titulo, `
    <form class="panel stack" id="puerta">
      <h2 class="h3">Expedientes protegidos</h2>
      <p class="hint">El contenido de los casos está cifrado y solo se abre con el PIN de cada perfil. Ingrese su PIN para continuar.</p>
      <div class="field"><label for="pin-casos">PIN de ${esc(yo.nombre.split(" ")[0])}</label><input id="pin-casos" type="password" inputmode="numeric" pattern="[0-9]*" enterkeyhint="go" maxlength="6" autocomplete="off"></div>
      <div id="err"></div>
      <div class="actions"><button class="btn primary" type="submit">Abrir expedientes</button></div>
    </form>`, { atras });
  $("#pin-casos", cuerpo).focus();
  $("#puerta", cuerpo).onsubmit = async ev => {
    ev.preventDefault();
    const espera = esperaPin();
    if (espera) return errores($("#err", cuerpo), [`Demasiados intentos. Espere ${espera > 90000 ? `${Math.ceil(espera / 60000)} minutos` : `${Math.ceil(espera / 1000)} segundos`}.`]);
    const pin = $("#pin-casos", cuerpo).value;
    if (!(await verificarPin(yo, pin))) {
      pinFallido();
      errores($("#err", cuerpo), ["PIN incorrecto."]);
      return $("#pin-casos", cuerpo).select();
    }
    pinCorrecto();
    if (!(await exp.desbloquear(yo, pin))) return errores($("#err", cuerpo), ["No fue posible abrir los expedientes. Si el PIN se cambió recientemente, solicite a la Coordinadora que lo restablezca."]);
    ctx.recargar();
  };
}

/* ---------- Lista ---------- */
async function lista(ctx, usuariaId) {
  const { yo, pintar } = ctx;
  if (!puedeUsarCasos(yo)) return ctx.ir("#/");
  if (!exp.desbloqueado(yo)) return puerta(ctx, "Seguimiento de casos", "#/");
  await exp.actualizarCopias(yo);
  const usuarias = new Map((await db.todos("usuarias")).map(u => [u.id, u]));
  const perfiles = new Map((await db.todos("perfiles")).map(p => [p.id, p]));
  const casos = (await c.listarCasos(yo, usuariaId)).map(k => ({ ...k, usuaria: usuarias.get(k.usuariaId), perfil: perfiles.get(k.perfilId) }));
  const legibles = casos.filter(k => k.legible);
  const sinAbrir = casos.length - legibles.length;
  const vivos = legibles.filter(k => k.d.estatus !== "cerrado");
  const filtrada = usuariaId ? usuarias.get(usuariaId) : null;
  const orden = k => (k.d.estatus === "cerrado" ? "9" : "0") + (k.d.proximo || "9999-12-31");
  legibles.sort((a, b) => orden(a).localeCompare(orden(b)) || (a.usuaria?.nombre || "").localeCompare(b.usuaria?.nombre || "", "es"));

  const cuerpo = pintar(filtrada ? `Casos de ${filtrada.nombre}` : "Seguimiento de casos", `
    ${tarjetas([
      [vivos.length, "Activos", "ok"],
      [legibles.filter(k => ["hoy", "proximo"].includes(c.estadoSeguimiento(k.d))).length, "Próximos", "gold"],
      [legibles.filter(k => c.estadoSeguimiento(k.d) === "vencido").length, "Vencidos", legibles.some(k => c.estadoSeguimiento(k.d) === "vencido") ? "warn" : ""],
      [legibles.length - vivos.length, "Cerrados"],
    ], { etiqueta: "Resumen de casos" })}
    <p class="hint">${esCoordinadora(yo) ? "Vista de la Coordinadora: puede consultar todos los expedientes, sin modificarlos." : "Solo usted ve estos expedientes. Se abren con su PIN y viajan cifrados."}</p>
    <div class="toolbar">
      <input type="search" id="buscar" class="search" placeholder="Buscar por usuaria o asunto" aria-label="Buscar caso">
      ${botonFiltros()}
      ${puedeCrearCaso(yo) ? botonIcono("mas2", "Nuevo caso", { href: filtrada ? `#/casos/nuevo/${esc(filtrada.id)}` : "#/casos/nuevo", clase: "quieto" }) : ""}
    </div>
    <div class="filters" id="filtros" hidden>
      <div class="field"><label for="estatus">Estatus</label><select id="estatus"><option value="">Todos los estatus</option>${c.ESTATUS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>
    </div>
    ${sinAbrir ? `<div class="issues" role="alert"><b>${plural(sinAbrir, "expediente no se puede abrir", "expedientes no se pueden abrir")} en este dispositivo.</b><p>${esCoordinadora(yo) ? "La persona que lo lleva debe ingresar con su PIN para dejar su copia a la Coordinadora." : "Pueden pertenecer a una clave anterior. Si el problema continúa, avise a la Coordinadora."}</p></div>` : ""}
    ${legibles.length ? `<div class="list" id="lista">${legibles.map(k => `
      <a class="row" href="#/casos/${esc(k.id)}" data-estatus="${esc(k.d.estatus)}" data-buscar="${esc(normalizar(`${k.usuaria?.nombre || ""} ${k.d.asunto}`))}">
        <span class="body"><span class="name">${esc(k.usuaria?.nombre || "Usuaria eliminada")}</span>
          <span class="meta"><span>${esc(k.d.asunto || "Sin asunto")}</span>${esCoordinadora(yo) ? `<span>${esc(k.perfil?.nombre || "")} · ${esc(nombreRol(k.perfil?.rol))}</span>` : ""}${k.d.proximo ? `<span>Seguimiento: ${esc(textoSeguimiento(k.d))}</span>` : ""}</span></span>
        <span class="end">${chipEstatus(k.d)}${chipSeguimiento(k.d)}</span>
      </a>`).join("")}</div>`
    : `<div class="empty"><b>Aún no hay casos${filtrada ? " de esta usuaria" : ""}.</b>${puedeCrearCaso(yo) ? "<p>Use «Nuevo caso» para abrir un expediente con notas de sesión y fechas de seguimiento.</p>" : ""}</div>`}
  `, { atras: filtrada ? `#/usuarias/${filtrada.id}` : "#/" });

  const panel = conectarFiltros(cuerpo);
  $("#lista", cuerpo)?.insertAdjacentHTML("afterend", `<div class="empty" id="sinResultados" hidden><b>Ningún caso coincide.</b><p>Modifique la búsqueda o los filtros.</p></div>`);
  const filtrar = () => {
    const q = normalizar($("#buscar", cuerpo).value).replace(/\s+/g, " ").trim().split(" ");
    const st = $("#estatus", cuerpo).value;
    let n = 0;
    $$("#lista .row", cuerpo).forEach(r => { r.hidden = !(q.every(w => r.dataset.buscar.includes(w)) && (!st || r.dataset.estatus === st)); if (!r.hidden) n++; });
    const aviso = $("#sinResultados", cuerpo);
    if (aviso) aviso.hidden = n > 0;
    panel.contar(st ? 1 : 0);
    pag.refrescar();
  };
  const pag = paginar($("#lista", cuerpo), { singular: "caso", plural: "casos" });
  $("#buscar", cuerpo).addEventListener("input", filtrar);
  $("#estatus", cuerpo).addEventListener("change", filtrar);
}

/* ---------- Nuevo caso ---------- */
async function nuevo(ctx, usuariaId) {
  const { yo, pintar, ir } = ctx;
  if (!puedeCrearCaso(yo)) return ir("#/casos");
  if (!exp.desbloqueado(yo)) return puerta(ctx, "Nuevo caso", "#/casos");
  await exp.actualizarCopias(yo);
  const usuarias = (await db.todos("usuarias")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const fija = usuariaId && usuarias.find(u => u.id === usuariaId);
  // La Coordinadora refiere el caso a la Asesora Psicoemocional o la Asesora Jurídica; solo se puede si ese perfil ya ingresó tras la actualización
  const coord = esCoordinadora(yo);
  const destinos = coord ? (await db.todos("perfiles")).filter(p => p.activa && (p.rol === "Psicóloga" || p.rol === "Abogada")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) : [];

  let elegida = fija || null;

  const cuerpo = pintar(coord ? "Nuevo caso (referido)" : "Nuevo caso", `
    <section class="panel stack">
      <p class="hint">${coord ? "El caso lo llevará el perfil al que lo refiera; usted podrá consultarlo. Después solo ese perfil lo modifica." : "El asunto, el estatus, las fechas y las notas se guardan cifrados. Solo usted podrá leerlos; la Coordinadora los puede consultar."}</p>
      <div class="field" id="usuaria"></div>
      <div class="grid" id="f">
        ${coord ? `<div class="field span-2"><label for="n-destino">Referir a</label>
          <select id="n-destino" data-campo="destinoId">${destinos.map(p => `<option value="${esc(p.id)}" ${exp.puedeLeer(p.id) ? "" : "disabled"}>${esc(p.nombre)} · ${esc(nombreRol(p.rol))}${exp.puedeLeer(p.id) ? "" : " (debe ingresar una vez con su PIN)"}</option>`).join("")}</select></div>` : ""}
        <div class="field span-2"><label for="n-asunto">Asunto del caso</label><input id="n-asunto" data-campo="asunto" autocomplete="off" placeholder="Por ejemplo: Atención psicológica individual"></div>
        <div class="field"><label for="n-estatus">Estatus</label><select id="n-estatus" data-campo="estatus">${c.ESTATUS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>
        <div class="field"><label for="n-proximo">Próximo seguimiento (opcional)</label><input id="n-proximo" type="date" data-campo="proximo" min="${hoy()}"></div>
        <div class="field"><label for="n-hora">Hora (opcional)</label><input id="n-hora" type="time" data-campo="hora"></div>
        ${coord ? `<div class="field span-2"><label for="n-nota">Nota de primer contacto (opcional)</label><textarea id="n-nota" class="notas" rows="4" placeholder="Motivo de la referencia y lo observado en el primer contacto."></textarea></div>` : ""}
      </div>
      <div id="err"></div>
    </section>
    <div class="barra-fija"><button class="btn primary" id="guardar">${coord ? "Abrir y referir caso" : "Abrir caso"}</button></div>`, { atras: fija ? `#/usuarias/${fija.id}` : "#/casos" });

  // Selector de usuaria común (core/componentes.js). Si se entra desde la ficha de la usuaria, solo se ve su tarjeta.
  selectorUsuaria($("#usuaria", cuerpo), { usuarias, elegida, fija: Boolean(fija), onElegir: u => (elegida = u) });

  $("#guardar", cuerpo).onclick = unaVez(async () => {
    const d = Object.fromEntries($$("[data-campo]", cuerpo).map(el => [el.dataset.campo, el.value.trim()]));
    d.usuariaId = elegida?.id || "";
    const e = [];
    if (!d.usuariaId) e.push("Seleccione a la usuaria.");
    if (!d.asunto) e.push("Ingrese el asunto del caso.");
    const destino = coord ? destinos.find(p => p.id === d.destinoId && exp.puedeLeer(p.id)) : yo;
    if (!destino) e.push("Seleccione el perfil al que se referirá el caso (debe haber ingresado con su PIN al menos una vez).");
    if (d.hora && !d.proximo) e.push("Para indicar una hora, seleccione también la fecha del seguimiento.");
    if (d.proximo && d.proximo < hoy()) e.push("La fecha del seguimiento no puede ser anterior a hoy.");
    errores($("#err", cuerpo), e);
    if (e.length) return;
    const caso = await c.crearCaso(yo, d.usuariaId, d, destino, coord ? $("#n-nota", cuerpo).value : "");
    aviso(coord ? `Caso referido a ${destino.nombre.split(" ")[0]}` : "Caso abierto");
    ir(`#/casos/${caso.id}`);
  });
}

/* ---------- Detalle del caso ---------- */
async function detalle(ctx, id) {
  const { yo, pintar, ir } = ctx;
  if (!puedeUsarCasos(yo)) return ir("#/");
  if (!exp.desbloqueado(yo)) return puerta(ctx, "Caso", "#/casos");
  await exp.actualizarCopias(yo);
  const caso = await c.uncaso(id);
  if (!caso || !(esCoordinadora(yo) || caso.perfilId === yo.id)) return ir("#/casos");
  const usuaria = await db.uno("usuarias", caso.usuariaId);
  if (!caso.legible) {
    return pintar("Caso", `<div class="issues" role="alert"><b>Este expediente no se puede abrir en este dispositivo.</b><p>${esCoordinadora(yo) ? "La persona que lo lleva debe ingresar con su PIN para dejar su copia a la Coordinadora." : "La clave del expediente no coincide. Avise a la Coordinadora."}</p></div>`, { atras: "#/casos" });
  }
  const perfil = await db.uno("perfiles", caso.perfilId);
  const edita = puedeEditarCaso(yo, caso);
  const d = caso.d;
  const notas = await c.listarNotas(caso);
  const citasDelCaso = (await citasCore.listarCitas(yo, caso.usuariaId)).filter(x => x.casoId === caso.id && x.legible);
  const historial = [
    ...notas.map(n => ({ fecha: n.d?.fecha || "", orden: n.creado || 0, n })),
    ...citasDelCaso.map(x => ({ fecha: x.fecha, orden: 0, cita: x })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.orden - a.orden);
  const seguimiento = textoSeguimiento(d);
  const vigente = d.proximo && d.proximo >= hoy() && d.estatus !== "cerrado";

  const cuerpo = pintar(usuaria?.nombre || "Caso", `
    <section class="panel stack">
      <div class="card-head">
        <span class="meta">${chipEstatus(d)}${chipSeguimiento(d)}</span>
        <span class="icon-row">
          ${edita ? botonIcono("editar", "Editar", { id: "editar", clase: "quieto" }) : ""}
          ${vigente ? botonIcono("calendario", "Calendario", { id: "calendario", clase: "quieto", extra: `aria-label="Agregar el seguimiento al calendario" title="Agregar el seguimiento al calendario"` }) : ""}
        </span>
      </div>
      <dl class="facts">
        <div><dt>Asunto</dt><dd>${esc(d.asunto || "—")}</dd></div>
        <div><dt>Usuaria</dt><dd>${usuaria ? `<a href="#/usuarias/${esc(usuaria.id)}">${esc(usuaria.nombre)}</a>` : "—"}</dd></div>
        <div><dt>Lleva el caso</dt><dd>${esc(perfil?.nombre || "—")} · ${esc(nombreRol(perfil?.rol))}</dd></div>
        ${d.referidoPor ? `<div><dt>Referido por</dt><dd>${esc(d.referidoPor)}</dd></div>` : ""}
        <div><dt>Próximo seguimiento</dt><dd>${seguimiento ? esc(seguimiento) : "—"}</dd></div>
      </dl>
      ${vigente ? `<p class="hint">El evento del calendario no incluye el nombre de la usuaria ni el asunto, para proteger su privacidad.</p>` : ""}
      ${esCoordinadora(yo) ? `<p class="hint">Consulta de la Coordinadora: solo lectura.</p>` : ""}
    </section>

    ${edita ? `<section class="panel stack" id="editor" hidden>
      <div class="card-head"><h2 class="h3">Datos del caso</h2><span class="icon-row">${botonIcono("salir", "Cancelar", { id: "cancelarCaso", clase: "quieto" })}</span></div>
      <div class="grid" id="fc">
        <div class="field span-2"><label for="e-asunto">Asunto del caso</label><input id="e-asunto" data-campo="asunto" value="${esc(d.asunto)}" autocomplete="off"></div>
        <div class="field"><label for="e-estatus">Estatus</label><select id="e-estatus" data-campo="estatus">${c.ESTATUS.map(([v, t]) => `<option value="${v}" ${v === d.estatus ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label for="e-proximo">Próximo seguimiento</label><input id="e-proximo" type="date" data-campo="proximo" value="${esc(d.proximo)}"></div>
        <div class="field"><label for="e-hora">Hora</label><input id="e-hora" type="time" data-campo="hora" value="${esc(d.hora)}"></div>
      </div>
      <div id="errc"></div>
      <div class="actions"><button class="btn primary" id="guardarCaso">Guardar cambios</button></div>
    </section>` : ""}

    <section class="stack">
      <h2>Historial</h2>
      ${edita ? `<div class="panel stack" id="nuevaNota">
        <div class="grid">
          <div class="field"><label for="nota-fecha">Fecha de la sesión</label><input id="nota-fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
          <div class="field span-2"><label for="nota-texto">Nota</label><textarea id="nota-texto" class="notas" rows="4" placeholder="Registre aquí lo tratado en la sesión y los acuerdos."></textarea></div>
        </div>
        <div id="errn"></div>
        <div class="actions"><button class="btn primary" id="guardarNota">Agregar nota</button></div>
      </div>` : ""}
      ${historial.length ? lineaTiempo(historial.map(h => h.cita ? {
        fecha: fechaLarga(h.cita.fecha), tipo: "Cita", icono: "agenda", clase: "prog",
        titulo: `${h.cita.hora} h · ${citasCore.estadoVisible(h.cita) === "por_registrar" ? "Por registrar asistencia" : citasCore.etiquetaEstado(citasCore.estadoVisible(h.cita))}`, href: `#/citas/${h.cita.id}`,
      } : h.n.d ? {
        id: h.n.id, fecha: fechaLarga(h.n.d.fecha), tipo: "Nota de sesión", icono: "editar", titulo: h.n.d.autora || "", texto: h.n.d.texto,
        acciones: edita ? `${botonIcono("editar", "Editar", { clase: "quieto", extra: 'data-accion="editarNota"' })}${botonIcono("eliminar", "Eliminar", { clase: "danger", extra: 'data-accion="borrarNota"' })}` : "",
      } : { fecha: "Sin fecha", tipo: "Nota no disponible", icono: "llave", texto: "No se pudo abrir esta nota con la clave actual." }), { etiqueta: "Historial del caso" })
        : estadoVacio("Aún no hay notas.", edita ? "Agregue la primera con el cuadro de arriba." : "")}
    </section>
  `, { atras: "#/casos" });
  paginar(cuerpo.querySelector(".linea"), { selector: ".linea-item", porPagina: 15, singular: "registro", plural: "registros" });

  if (!edita) return;
  $("#editar", cuerpo).onclick = () => { $("#editor", cuerpo).hidden = false; $("#e-asunto", cuerpo).focus(); };
  $("#cancelarCaso", cuerpo).onclick = () => ($("#editor", cuerpo).hidden = true);
  $("#guardarCaso", cuerpo).onclick = unaVez(async () => {
    const nuevoD = Object.fromEntries($$("#fc [data-campo]", cuerpo).map(el => [el.dataset.campo, el.value.trim()]));
    const e = [];
    if (!nuevoD.asunto) e.push("Ingrese el asunto del caso.");
    if (nuevoD.hora && !nuevoD.proximo) e.push("Para indicar una hora, seleccione también la fecha del seguimiento.");
    errores($("#errc", cuerpo), e);
    if (e.length) return;
    // Al cerrar un caso se retira el seguimiento pendiente
    if (nuevoD.estatus === "cerrado") { nuevoD.proximo = ""; nuevoD.hora = ""; }
    await c.guardarCaso(caso, { ...d, ...nuevoD });
    aviso("Caso actualizado");
    ctx.recargar();
  });
  $("#calendario", cuerpo)?.addEventListener("click", async () => {
    try {
      const r = await agregarAlCalendario({
        id: `seguimiento-${caso.id}`, folio: "seguimiento", nombre: "Seguimiento programado (Centro LIBRE)",
        fecha: d.proximo, horaInicio: d.hora || "", horaFin: "",
        descripcion: "Seguimiento programado en la aplicación del Centro LIBRE Marquelia.",
      });
      if (r === "descargado") aviso("Archivo de calendario descargado. Ábralo para agregar el evento con sus recordatorios");
      else if (r === "compartido") aviso("Elija «Calendario» para agregar el evento con sus recordatorios");
    } catch (err) {
      console.error(err);
      aviso("No se pudo generar el archivo de calendario.");
    }
  });

  $("#guardarNota", cuerpo).onclick = unaVez(async () => {
    const fecha = $("#nota-fecha", cuerpo).value, texto = $("#nota-texto", cuerpo).value.trim();
    const e = [];
    if (!fecha) e.push("Seleccione la fecha de la sesión.");
    if (!texto) e.push("Escriba la nota.");
    errores($("#errn", cuerpo), e);
    if (e.length) return;
    await c.guardarNota(caso, null, { fecha, texto });
    // Si el caso estaba abierto, una primera nota lo pasa a «en proceso»
    if (d.estatus === "abierto") await c.guardarCaso(caso, { ...d, estatus: "en_proceso" });
    aviso("Nota agregada");
    ctx.recargar();
  });

  $$(".linea-item[data-id]", cuerpo).forEach(fila => {
    const nota = notas.find(n => n.id === fila.dataset.id);
    const borrar = $('[data-accion="borrarNota"]', fila);
    if (borrar) dobleToque(borrar, "Toque nuevamente para eliminar la nota", async () => {
      await c.borrarNota(nota.id);
      aviso("Nota eliminada");
      ctx.recargar();
    });
    $('[data-accion="editarNota"]', fila)?.addEventListener("click", () => {
      $("#nota-fecha", cuerpo).value = nota.d.fecha;
      $("#nota-texto", cuerpo).value = nota.d.texto;
      const guardar = $("#guardarNota", cuerpo);
      guardar.textContent = "Guardar nota editada";
      guardar.onclick = unaVez(async () => {
        const fecha = $("#nota-fecha", cuerpo).value, texto = $("#nota-texto", cuerpo).value.trim();
        const e = [];
        if (!fecha) e.push("Seleccione la fecha de la sesión.");
        if (!texto) e.push("Escriba la nota.");
        errores($("#errn", cuerpo), e);
        if (e.length) return;
        await c.guardarNota(caso, nota, { fecha, texto });
        aviso("Nota actualizada");
        ctx.recargar();
      });
      $("#nota-texto", cuerpo).focus();
      $("#nuevaNota", cuerpo).scrollIntoView({ block: "center" });
    });
  });
}

export default {
  menu: [],
  rutas: [
    [/^#\/casos$/, ctx => lista(ctx)],
    [/^#\/casos\/usuaria\/([\w-]+)$/, lista],
    [/^#\/casos\/nuevo(?:\/([\w-]+))?$/, nuevo],
    [/^#\/casos\/(?!nuevo$|usuaria$)([\w-]+)$/, detalle],
  ],
};
