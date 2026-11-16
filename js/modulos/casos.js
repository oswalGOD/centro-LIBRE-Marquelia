// Seguimiento de casos confidenciales: expediente por usuaria con notas de sesión, fechas de seguimiento y estatus.
// Lo usan la Psicóloga y la Abogada (cada una ve solo sus casos); la Coordinadora los ve todos, solo para lectura.
// El contenido va cifrado (ver core/expedientes.js): al entrar se pide el PIN si las claves no están abiertas.

import * as db from "../core/db.js";
import * as exp from "../core/expedientes.js";
import * as c from "../core/casos.js";
import { tarjetas } from "../core/resumen.js";
import { botonIcono } from "../core/iconos.js";
import { esperaPin, pinFallido, pinCorrecto, verificarPin, esCoordinadora } from "../core/auth.js";
import { llevaCasos, puedeEditarCaso, puedeUsarCasos } from "../core/permisos.js";
import { agregarAlCalendario } from "../core/calendario.js";
import { hoy, fechaLarga, normalizar } from "../core/catalogos.js";
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
function puerta(ctx, titulo, atras) {
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
      <select id="estatus" aria-label="Filtrar por estatus"><option value="">Todos los estatus</option>${c.ESTATUS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select>
      ${llevaCasos(yo) ? botonIcono("mas2", "Nuevo caso", { href: filtrada ? `#/casos/nuevo/${esc(filtrada.id)}` : "#/casos/nuevo", clase: "quieto" }) : ""}
    </div>
    ${sinAbrir ? `<div class="issues" role="alert"><b>${plural(sinAbrir, "expediente no se puede abrir", "expedientes no se pueden abrir")} en este dispositivo.</b><p>${esCoordinadora(yo) ? "La persona que lo lleva debe ingresar con su PIN para dejar su copia a la Coordinadora." : "Pueden pertenecer a una clave anterior. Si el problema continúa, avise a la Coordinadora."}</p></div>` : ""}
    ${legibles.length ? `<div class="list" id="lista">${legibles.map(k => `
      <a class="row" href="#/casos/${esc(k.id)}" data-estatus="${esc(k.d.estatus)}" data-buscar="${esc(normalizar(`${k.usuaria?.nombre || ""} ${k.d.asunto}`))}">
        <span class="body"><span class="name">${esc(k.usuaria?.nombre || "Usuaria eliminada")}</span>
          <span class="meta"><span>${esc(k.d.asunto || "Sin asunto")}</span>${esCoordinadora(yo) ? `<span>${esc(k.perfil?.nombre || "")} · ${esc(k.perfil?.rol || "")}</span>` : ""}${k.d.proximo ? `<span>Seguimiento: ${esc(textoSeguimiento(k.d))}</span>` : ""}</span></span>
        <span class="end">${chipEstatus(k.d)}${chipSeguimiento(k.d)}</span>
      </a>`).join("")}</div>`
    : `<div class="empty"><b>Aún no hay casos${filtrada ? " de esta usuaria" : ""}.</b>${llevaCasos(yo) ? "<p>Use «Nuevo caso» para abrir un expediente con notas de sesión y fechas de seguimiento.</p>" : ""}</div>`}
  `, { atras: filtrada ? `#/usuarias/${filtrada.id}` : "#/" });

  const filtrar = () => {
    const q = normalizar($("#buscar", cuerpo).value).replace(/\s+/g, " ").trim().split(" ");
    const st = $("#estatus", cuerpo).value;
    $$("#lista .row", cuerpo).forEach(r => (r.hidden = !(q.every(w => r.dataset.buscar.includes(w)) && (!st || r.dataset.estatus === st))));
  };
  $("#buscar", cuerpo).addEventListener("input", filtrar);
  $("#estatus", cuerpo).addEventListener("change", filtrar);
}

/* ---------- Nuevo caso ---------- */
async function nuevo(ctx, usuariaId) {
  const { yo, pintar, ir } = ctx;
  if (!llevaCasos(yo)) return ir("#/casos");
  if (!exp.desbloqueado(yo)) return puerta(ctx, "Nuevo caso", "#/casos");
  const usuarias = (await db.todos("usuarias")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const fija = usuariaId && usuarias.find(u => u.id === usuariaId);

  const cuerpo = pintar("Nuevo caso", `
    <section class="panel stack">
      <p class="hint">El asunto, el estatus, las fechas y las notas se guardan cifrados. Solo usted podrá leerlos${""}; la Coordinadora los puede consultar.</p>
      <div class="grid" id="f">
        ${fija ? `<div class="field span-2"><label>Usuaria</label><input value="${esc(fija.nombre)}" disabled><input type="hidden" data-campo="usuariaId" value="${esc(fija.id)}"></div>`
          : `<div class="field span-2"><label for="n-buscar">Usuaria</label>
              <input type="search" id="n-buscar" placeholder="Escriba para buscar por nombre o CURP" autocomplete="off">
              <select id="n-usuaria" data-campo="usuariaId" size="5" aria-label="Usuarias encontradas"></select></div>`}
        <div class="field span-2"><label for="n-asunto">Asunto del caso</label><input id="n-asunto" data-campo="asunto" autocomplete="off" placeholder="Por ejemplo: Atención psicológica individual"></div>
        <div class="field"><label for="n-estatus">Estatus</label><select id="n-estatus" data-campo="estatus">${c.ESTATUS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>
        <div class="field"><label for="n-proximo">Próximo seguimiento (opcional)</label><input id="n-proximo" type="date" data-campo="proximo" min="${hoy()}"></div>
        <div class="field"><label for="n-hora">Hora (opcional)</label><input id="n-hora" type="time" data-campo="hora"></div>
      </div>
      <div id="err"></div>
      <div class="actions"><button class="btn primary" id="guardar">Abrir caso</button><a class="btn" href="#/casos">Cancelar</a></div>
    </section>`, { atras: fija ? `#/usuarias/${fija.id}` : "#/casos" });

  if (!fija) {
    const sel = $("#n-usuaria", cuerpo);
    const pintarOpciones = () => {
      const q = normalizar($("#n-buscar", cuerpo).value).trim().split(/\s+/).filter(Boolean);
      const hallados = usuarias.filter(u => q.every(w => normalizar(`${u.nombre} ${u.curp || ""}`).includes(w))).slice(0, 40);
      sel.innerHTML = hallados.map(u => `<option value="${esc(u.id)}">${esc(u.nombre)}${u.curp ? ` · ${esc(u.curp)}` : ""}</option>`).join("");
      if (hallados.length === 1) sel.value = hallados[0].id;
    };
    $("#n-buscar", cuerpo).addEventListener("input", pintarOpciones);
    pintarOpciones();
  }

  $("#guardar", cuerpo).onclick = unaVez(async () => {
    const d = Object.fromEntries($$("[data-campo]", cuerpo).map(el => [el.dataset.campo, el.value.trim()]));
    const e = [];
    if (!d.usuariaId) e.push("Seleccione a la usuaria.");
    if (!d.asunto) e.push("Ingrese el asunto del caso.");
    if (d.hora && !d.proximo) e.push("Para indicar una hora, seleccione también la fecha del seguimiento.");
    if (d.proximo && d.proximo < hoy()) e.push("La fecha del seguimiento no puede ser anterior a hoy.");
    errores($("#err", cuerpo), e);
    if (e.length) return;
    const caso = await c.crearCaso(yo, d.usuariaId, d);
    aviso("Caso abierto");
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
        <div><dt>Lleva el caso</dt><dd>${esc(perfil?.nombre || "—")} · ${esc(perfil?.rol || "")}</dd></div>
        <div><dt>Próximo seguimiento</dt><dd>${seguimiento ? esc(seguimiento) : "—"}</dd></div>
      </dl>
      ${vigente ? `<p class="hint">El evento del calendario no incluye el nombre de la usuaria ni el asunto, para proteger su privacidad.</p>` : ""}
      ${esCoordinadora(yo) ? `<p class="hint">Consulta de la Coordinadora: solo lectura.</p>` : ""}
    </section>

    ${edita ? `<section class="panel stack" id="editor" hidden>
      <h2 class="h3">Datos del caso</h2>
      <div class="grid" id="fc">
        <div class="field span-2"><label for="e-asunto">Asunto del caso</label><input id="e-asunto" data-campo="asunto" value="${esc(d.asunto)}" autocomplete="off"></div>
        <div class="field"><label for="e-estatus">Estatus</label><select id="e-estatus" data-campo="estatus">${c.ESTATUS.map(([v, t]) => `<option value="${v}" ${v === d.estatus ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <div class="field"><label for="e-proximo">Próximo seguimiento</label><input id="e-proximo" type="date" data-campo="proximo" value="${esc(d.proximo)}"></div>
        <div class="field"><label for="e-hora">Hora</label><input id="e-hora" type="time" data-campo="hora" value="${esc(d.hora)}"></div>
      </div>
      <div id="errc"></div>
      <div class="actions"><button class="btn primary" id="guardarCaso">Guardar cambios</button><button class="btn" id="cancelarCaso">Cancelar</button></div>
    </section>` : ""}

    <section class="stack">
      <h2>Notas de sesión</h2>
      ${edita ? `<div class="panel stack" id="nuevaNota">
        <div class="grid">
          <div class="field"><label for="nota-fecha">Fecha de la sesión</label><input id="nota-fecha" type="date" value="${hoy()}" max="${hoy()}"></div>
          <div class="field span-2"><label for="nota-texto">Nota</label><textarea id="nota-texto" class="notas" rows="4" placeholder="Registre aquí lo tratado en la sesión y los acuerdos."></textarea></div>
        </div>
        <div id="errn"></div>
        <div class="actions"><button class="btn primary" id="guardarNota">Agregar nota</button></div>
      </div>` : ""}
      ${notas.length ? `<div class="list">${notas.map(n => `
        <div class="row nota" data-id="${esc(n.id)}">
          <span class="body"><span class="name">${n.d ? esc(fechaLarga(n.d.fecha)) : "Nota no disponible"}</span>
            ${n.d ? `<p class="nota-texto">${esc(n.d.texto)}</p>` : `<span class="meta"><span>No se pudo abrir esta nota con la clave actual.</span></span>`}</span>
          ${edita && n.d ? `<span class="end actions">${botonIcono("editar", "Editar", { clase: "quieto", extra: 'data-accion="editarNota"' })}${botonIcono("eliminar", "Eliminar", { clase: "danger", extra: 'data-accion="borrarNota"' })}</span>` : ""}
        </div>`).join("")}</div>` : `<p class="hint">Aún no hay notas.</p>`}
    </section>
  `, { atras: "#/casos" });

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
    await c.guardarCaso(caso, nuevoD);
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

  $$(".row.nota", cuerpo).forEach(fila => {
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
