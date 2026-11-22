// Agenda de citas individuales (asesoría psicológica o jurídica).
// Cada perfil con casos ve y gestiona sus citas; la Coordinadora ve todas y puede agendar, reprogramar y cancelar las de cualquier perfil.
// El motivo y el lugar van cifrados (ver core/citas.js y core/expedientes.js): al entrar se pide el PIN si las claves no están abiertas.

import * as db from "../core/db.js";
import * as exp from "../core/expedientes.js";
import * as k from "../core/citas.js";
import * as casos from "../core/casos.js";
import { tarjetas } from "../core/resumen.js";
import { botonIcono, menuMas, conectarMenus } from "../core/iconos.js";
import { selectorUsuaria, botonFiltros, conectarFiltros, estadoVacio, calendarioMes, paginar } from "../core/componentes.js";
import { esCoordinadora } from "../core/auth.js";
import { puedeAgendarCita, puedeGestionarCita, puedeUsarCitas, puedeVerCita } from "../core/permisos.js";
import { agregarAlCalendario } from "../core/calendario.js";
import { hoy, fechaLarga, normalizar, duracion, nombreRol } from "../core/catalogos.js";
import { $, $$, esc, aviso, errores, dobleToque, plural, unaVez } from "../core/ui.js";
import { puerta } from "./casos.js";

const CHIP = { programada: "prog", asistio: "ok", no_asistio: "warn", reprogramada: "", cancelada: "", por_registrar: "warn" };
const chip = c => {
  const e = k.estadoVisible(c);
  return `<span class="chip ${CHIP[e] || ""}">${e === "por_registrar" ? "Por registrar asistencia" : esc(k.etiquetaEstado(e))}</span>`;
};

/* ---------- Fechas ---------- */
const formato = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00`); d.setDate(d.getDate() + n); return formato(d); };
const lunesDe = f => sumarDias(f, -((new Date(`${f}T12:00`).getDay() + 6) % 7));
const diaSemana = f => new Date(`${f}T12:00`).toLocaleDateString("es-MX", { weekday: "long" }).replace(/^./, c => c.toUpperCase());
const diaCorto = f => `${diaSemana(f)} ${Number(f.slice(8, 10))}`;
const horario = c => `${c.hora} a ${k.horaFin(c)} h`;

/** Estado de la agenda al navegar (se conserva mientras la aplicación esté abierta). */
const vista = { modo: "semana", ancla: hoy(), dia: hoy(), perfil: "", estado: "", q: "" };

/* ---------- Agenda ---------- */
async function agenda(ctx, usuariaId) {
  const { yo, pintar } = ctx;
  if (!puedeUsarCitas(yo)) return ctx.ir("#/");
  if (!exp.desbloqueado(yo)) return puerta(ctx, "Agenda de citas", "#/");
  await exp.actualizarCopias(yo);
  const coord = esCoordinadora(yo);
  const usuarias = new Map((await db.todos("usuarias")).map(u => [u.id, u]));
  const perfiles = new Map((await db.todos("perfiles")).map(p => [p.id, p]));
  const todas = (await k.listarCitas(yo, usuariaId)).map(c => ({ ...c, usuaria: usuarias.get(c.usuariaId), perfil: perfiles.get(c.perfilId) }));
  const filtrada = usuariaId ? usuarias.get(usuariaId) : null;
  const modo = usuariaId ? "lista" : vista.modo;
  const hoyF = hoy(), lunes = lunesDe(hoyF), domingo = sumarDias(lunes, 6);
  const programadas = todas.filter(c => c.estado === "programada");
  const sinSabrir = todas.filter(c => !c.legible).length;

  const cuerpo = pintar(filtrada ? `Citas de ${filtrada.nombre}` : "Agenda de citas", `
    ${tarjetas([
      [programadas.filter(c => c.fecha === hoyF && !k.porRegistrar(c)).length, "Hoy", "ok"],
      [programadas.filter(c => c.fecha >= lunes && c.fecha <= domingo && !k.porRegistrar(c)).length, "Esta semana", "gold"],
      [programadas.filter(c => k.porRegistrar(c)).length, "Por registrar", programadas.some(c => k.porRegistrar(c)) ? "warn" : ""],
    ], { etiqueta: "Resumen de citas" })}
    <p class="hint">${coord ? "Vista de la Coordinadora: ve las citas de todos los perfiles y puede agendar, reprogramar y cancelar." : "Solo usted ve sus citas. El motivo y el lugar se guardan cifrados."}</p>
    <div class="toolbar">
      ${usuariaId ? "" : `<div class="segmented" role="radiogroup" aria-label="Vista de la agenda">${[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"], ["lista", "Lista"]].map(([v, x]) => `<button type="button" role="radio" aria-checked="${v === modo}" data-vista="${v}">${x}</button>`).join("")}</div>`}
      <input type="search" id="buscar" class="search" placeholder="Buscar por usuaria, motivo o lugar" aria-label="Buscar cita" value="${esc(vista.q)}">
      ${botonFiltros()}
      ${puedeAgendarCita(yo) ? botonIcono("mas2", "Nueva cita", { href: filtrada ? `#/citas/nueva/${esc(filtrada.id)}` : "#/citas/nueva", clase: "quieto" }) : ""}
    </div>
    <div class="filters" id="filtros" hidden>
      ${coord ? `<div class="field"><label for="f-perfil">Perfil</label><select id="f-perfil"><option value="">Todos los perfiles</option>${[...perfiles.values()].filter(p => p.rol === "Psicóloga" || p.rol === "Abogada").map(p => `<option value="${esc(p.id)}" ${vista.perfil === p.id ? "selected" : ""}>${esc(p.nombre)} · ${esc(nombreRol(p.rol))}</option>`).join("")}</select></div>` : ""}
      <div class="field"><label for="f-estado">Estado</label><select id="f-estado"><option value="">Todos los estados</option>${k.ESTADOS.map(([v, t]) => `<option value="${v}" ${vista.estado === v ? "selected" : ""}>${t}</option>`).join("")}<option value="por_registrar" ${vista.estado === "por_registrar" ? "selected" : ""}>Por registrar asistencia</option></select></div>
    </div>
    ${sinSabrir ? `<div class="issues" role="alert"><b>${plural(sinSabrir, "cita tiene su motivo protegido", "citas tienen su motivo protegido")}.</b><p>${coord ? "La persona responsable debe ingresar con su PIN para dejar su copia a la Coordinadora; mientras tanto se ven fecha, hora y estado." : "Avise a la Coordinadora si el problema continúa."}</p></div>` : ""}
    ${modo === "lista" ? "" : `<div class="toolbar" id="navegacion"></div>`}
    <div id="resultado" class="stack"></div>
  `, { atras: filtrada ? `#/usuarias/${filtrada.id}` : "#/" });

  const panel = conectarFiltros(cuerpo);
  const textoDe = c => normalizar(`${c.usuaria?.nombre || ""} ${c.d.motivo} ${c.d.lugar}`);
  const filtradas = () => {
    const q = normalizar(vista.q).replace(/\s+/g, " ").trim().split(" ");
    return todas.filter(c => q.every(w => textoDe(c).includes(w))
      && (!vista.perfil || c.perfilId === vista.perfil)
      && (!vista.estado || k.estadoVisible(c) === vista.estado || (vista.estado === "programada" && c.estado === "programada")));
  };
  const fila = (c, conFecha) => `
    <a class="row" href="#/citas/${esc(c.id)}">
      <span class="body"><span class="name">${conFecha ? `${esc(fechaLarga(c.fecha))} · ` : ""}${esc(c.hora)} · ${esc(c.usuaria?.nombre || "Usuaria eliminada")}</span>
        <span class="meta"><span>${esc(duracion(c.duracion))}</span><span>${esc(c.legible ? c.d.motivo || "Sin motivo" : "Motivo protegido")}</span>${c.d.lugar ? `<span>${esc(c.d.lugar)}</span>` : ""}${coord ? `<span>${esc(c.perfil?.nombre || "")} · ${esc(nombreRol(c.perfil?.rol))}</span>` : ""}</span></span>
      <span class="end">${chip(c)}</span>
    </a>`;
  const ordenar = lista => [...lista].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora));
  const vacio = () => estadoVacio("No hay citas en este periodo.", puedeAgendarCita(yo) ? "Use «Nueva cita» para agendar una." : "");

  const dibujar = () => {
    const lista = filtradas();
    const salida = $("#resultado", cuerpo), nav = $("#navegacion", cuerpo);
    panel.contar((vista.perfil ? 1 : 0) + (vista.estado ? 1 : 0));
    $$("[data-vista]", cuerpo).forEach(b => b.setAttribute("aria-checked", String(b.dataset.vista === modo)));
    if (modo === "lista") {
      const prox = ordenar(lista.filter(c => c.fecha >= hoyF)), ant = ordenar(lista.filter(c => c.fecha < hoyF)).reverse();
      salida.innerHTML = lista.length ? `
        ${prox.length ? `<h2 class="h3">Próximas</h2><div class="list">${prox.map(c => fila(c, true)).join("")}</div>` : ""}
        ${ant.length ? `<h2 class="h3">Anteriores</h2><div class="list">${ant.map(c => fila(c, true)).join("")}</div>` : ""}`
        : estadoVacio(todas.length ? "Ninguna cita coincide." : "Aún no hay citas.", todas.length ? "Modifique la búsqueda o los filtros." : puedeAgendarCita(yo) ? "Use «Nueva cita» para agendar la primera." : "");
      if (lista.length) paginar(salida, { dentro: true, singular: "cita", plural: "citas" });
      return;
    }
    if (modo === "mes") {
      const mes = vista.ancla.slice(0, 7), [ma, mm] = mes.split("-").map(Number);
      const etiquetaMes = new Date(ma, mm - 1, 1).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
      const moverMes = n => { const d = new Date(ma, mm - 1 + n, 1); vista.ancla = formato(d); vista.dia = vista.ancla; dibujar(); };
      nav.innerHTML = `${botonIcono("anterior", "Anterior", { id: "ant", clase: "quieto" })}<b class="nav-etiqueta" aria-live="polite">${esc(etiquetaMes.replace(/^./, c => c.toUpperCase()))}</b>${botonIcono("siguiente", "Siguiente", { id: "sig", clase: "quieto" })}${botonIcono("calendario", "Hoy", { id: "hoy", clase: "quieto" })}`;
      $("#ant", cuerpo).onclick = () => moverMes(-1);
      $("#sig", cuerpo).onclick = () => moverMes(1);
      $("#hoy", cuerpo).onclick = () => { vista.ancla = hoy(); vista.dia = hoy(); dibujar(); };
      if (!vista.dia.startsWith(mes)) vista.dia = `${mes}-01`;
      const delDia = ordenar(lista.filter(c => c.fecha === vista.dia));
      salida.innerHTML = `<div id="calMes"></div><h2 class="h3">${esc(diaCorto(vista.dia))}${vista.dia === hoyF ? " · hoy" : ""}</h2><div id="delDia" class="stack">${delDia.length ? `<div class="list">${delDia.map(c => fila(c, false)).join("")}</div>` : `<p class="hint">Sin citas.</p>`}</div>`;
      calendarioMes($("#calMes", cuerpo), { mes, marcados: new Set(lista.map(c => c.fecha)), elegido: vista.dia, hoy: hoyF, onElegir: f => { vista.dia = f; dibujar(); } });
      return;
    }
    const semana = modo === "semana";
    const inicio = semana ? lunesDe(vista.ancla) : vista.ancla, fin = semana ? sumarDias(inicio, 6) : inicio;
    const etiqueta = semana ? `${Number(inicio.slice(8, 10))} a ${fechaLarga(fin)}` : `${diaSemana(inicio)} ${fechaLarga(inicio)}`;
    nav.innerHTML = `${botonIcono("anterior", "Anterior", { id: "ant", clase: "quieto" })}<b class="nav-etiqueta" aria-live="polite">${esc(etiqueta)}</b>${botonIcono("siguiente", "Siguiente", { id: "sig", clase: "quieto" })}${botonIcono("calendario", "Hoy", { id: "hoy", clase: "quieto" })}`;
    $("#ant", cuerpo).onclick = () => { vista.ancla = sumarDias(inicio, semana ? -7 : -1); dibujar(); };
    $("#sig", cuerpo).onclick = () => { vista.ancla = sumarDias(inicio, semana ? 7 : 1); dibujar(); };
    $("#hoy", cuerpo).onclick = () => { vista.ancla = hoy(); dibujar(); };
    const dias = semana ? Array.from({ length: 7 }, (_, i) => sumarDias(inicio, i)) : [inicio];
    const deldia = f => ordenar(lista.filter(c => c.fecha === f));
    if (!semana) { const l = deldia(inicio); salida.innerHTML = l.length ? `<div class="list">${l.map(c => fila(c, false)).join("")}</div>` : vacio(); return; }
    salida.innerHTML = lista.some(c => c.fecha >= inicio && c.fecha <= fin) ? dias.map(f => {
      const l = deldia(f);
      return `<section class="stack"><h2 class="h3">${esc(diaCorto(f))}${f === hoyF ? " · hoy" : ""}</h2>${l.length ? `<div class="list">${l.map(c => fila(c, false)).join("")}</div>` : `<p class="hint">Sin citas.</p>`}</section>`;
    }).join("") : vacio();
  };

  $$("[data-vista]", cuerpo).forEach(b => (b.onclick = () => { vista.modo = b.dataset.vista; ctx.recargar(); }));
  $("#buscar", cuerpo).addEventListener("input", e => { vista.q = e.target.value; dibujar(); });
  $("#f-perfil", cuerpo)?.addEventListener("change", e => { vista.perfil = e.target.value; dibujar(); });
  $("#f-estado", cuerpo).addEventListener("change", e => { vista.estado = e.target.value; dibujar(); });
  dibujar();
}

/* ---------- Formulario común (nueva cita y editar) ---------- */
function campos(v, { prefijo, casosDe = [], minimo = hoy() }) {
  return `
    <div class="field"><label for="${prefijo}-fecha">Fecha</label><input id="${prefijo}-fecha" type="date" data-campo="fecha" min="${minimo}" value="${esc(v.fecha || "")}"></div>
    <div class="field"><label for="${prefijo}-hora">Hora</label><input id="${prefijo}-hora" type="time" data-campo="hora" value="${esc(v.hora || "")}"></div>
    <div class="field"><label for="${prefijo}-dur">Duración</label><select id="${prefijo}-dur" data-campo="duracion">${k.DURACIONES.map(m => `<option value="${m}" ${m === (Number(v.duracion) || 60) ? "selected" : ""}>${esc(duracion(m))}</option>`).join("")}</select></div>
    <div class="field"><label for="${prefijo}-lugar">Lugar o modalidad (opcional)</label><input id="${prefijo}-lugar" data-campo="lugar" list="${prefijo}-modos" maxlength="80" autocomplete="off" value="${esc(v.lugar || "")}"><datalist id="${prefijo}-modos">${k.MODALIDADES.map(m => `<option value="${esc(m)}">`).join("")}</datalist></div>
    <div class="field span-2"><label for="${prefijo}-motivo">Motivo breve (opcional)</label><input id="${prefijo}-motivo" data-campo="motivo" maxlength="140" autocomplete="off" placeholder="Por ejemplo: Primera sesión de acompañamiento" value="${esc(v.motivo || "")}"></div>
    ${casosDe.length ? `<div class="field span-2"><label for="${prefijo}-caso">Caso relacionado (opcional)</label><select id="${prefijo}-caso" data-campo="casoId"><option value="">Sin caso ligado</option>${casosDe.map(c => `<option value="${esc(c.id)}" ${c.id === v.casoId ? "selected" : ""}>${esc(c.d.asunto || "Sin asunto")}</option>`).join("")}</select></div>` : ""}`;
}
const leer = raiz => Object.fromEntries($$("[data-campo]", raiz).map(el => [el.dataset.campo, el.value.trim()]));

/* ---------- Nueva cita ---------- */
async function nueva(ctx, usuariaId) {
  const { yo, pintar, ir } = ctx;
  if (!puedeAgendarCita(yo)) return ir("#/citas");
  if (!exp.desbloqueado(yo)) return puerta(ctx, "Nueva cita", "#/citas");
  await exp.actualizarCopias(yo);
  const coord = esCoordinadora(yo);
  const usuarias = (await db.todos("usuarias")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const fija = usuariaId && usuarias.find(u => u.id === usuariaId);
  const destinos = coord ? (await db.todos("perfiles")).filter(p => p.activa && (p.rol === "Psicóloga" || p.rol === "Abogada")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) : [];
  const abiertos = (await casos.listarCasos(yo)).filter(c => c.legible && c.d.estatus !== "cerrado");
  const existentes = await db.todos("citas");
  let elegida = fija || null;

  const cuerpo = pintar("Nueva cita", `
    <section class="panel stack">
      <p class="hint">${coord ? "La cita queda a cargo del perfil que elija; esa persona la verá en su agenda." : "El motivo y el lugar se guardan cifrados; solo usted y la Coordinadora podrán leerlos."}</p>
      <div class="field" id="usuaria"></div>
      <div class="grid" id="f">
        ${coord ? `<div class="field span-2"><label for="n-perfil">Perfil responsable</label>
          <select id="n-perfil" data-campo="perfilId">${destinos.map(p => `<option value="${esc(p.id)}" ${exp.puedeLeer(p.id) ? "" : "disabled"}>${esc(p.nombre)} · ${esc(nombreRol(p.rol))}${exp.puedeLeer(p.id) ? "" : " (debe ingresar una vez con su PIN)"}</option>`).join("")}</select></div>` : ""}
        ${campos({ duracion: 60 }, { prefijo: "n" })}
        <div class="field span-2" id="zonaCaso" hidden></div>
      </div>
      <div id="err"></div>
    </section>
    <div class="barra-fija"><button class="btn primary" id="guardar">Agendar cita</button></div>`, { atras: fija ? `#/usuarias/${fija.id}` : "#/citas" });

  const perfilActual = () => (coord ? $("#n-perfil", cuerpo)?.value : yo.id);
  const pintarCasos = () => {
    const lista = abiertos.filter(c => c.usuariaId === elegida?.id && c.perfilId === perfilActual());
    const zona = $("#zonaCaso", cuerpo);
    zona.hidden = !lista.length;
    zona.innerHTML = lista.length ? `<label for="n-caso">Caso relacionado (opcional)</label><select id="n-caso" data-campo="casoId"><option value="">Sin caso ligado</option>${lista.map(c => `<option value="${esc(c.id)}">${esc(c.d.asunto || "Sin asunto")}</option>`).join("")}</select>` : "";
  };
  selectorUsuaria($("#usuaria", cuerpo), { usuarias, elegida, fija: Boolean(fija), onElegir: u => { elegida = u; pintarCasos(); } });
  $("#n-perfil", cuerpo)?.addEventListener("change", pintarCasos);
  pintarCasos();

  $("#guardar", cuerpo).onclick = unaVez(async () => {
    const d = leer(cuerpo);
    d.usuariaId = elegida?.id || "";
    d.perfilId = perfilActual() || "";
    const destino = coord ? destinos.find(p => p.id === d.perfilId && exp.puedeLeer(p.id)) : yo;
    const e = k.validar(d, existentes);
    if (!destino && coord) e.push("Seleccione el perfil responsable (debe haber ingresado con su PIN al menos una vez).");
    if (d.fecha && d.fecha < hoy()) e.push("La fecha de la cita no puede ser anterior a hoy.");
    errores($("#err", cuerpo), e);
    if (e.length) return;
    const cita = await k.crearCita(yo, destino, d);
    aviso(coord ? `Cita agendada con ${destino.nombre.split(" ")[0]}` : "Cita agendada");
    ir(`#/citas/${cita.id}`);
  });
}

/* ---------- Detalle ---------- */
async function detalle(ctx, id) {
  const { yo, pintar, ir } = ctx;
  if (!puedeUsarCitas(yo)) return ir("#/");
  if (!exp.desbloqueado(yo)) return puerta(ctx, "Cita", "#/citas");
  await exp.actualizarCopias(yo);
  const cita = await k.unaCita(id);
  if (!cita || !puedeVerCita(yo, cita)) return ir("#/citas");
  const gestiona = puedeGestionarCita(yo, cita);
  const usuaria = await db.uno("usuarias", cita.usuariaId);
  const perfil = await db.uno("perfiles", cita.perfilId);
  const caso = cita.casoId ? await casos.uncaso(cita.casoId) : null;
  const casosDe = (await casos.listarCasos(yo, cita.usuariaId)).filter(c => c.legible && c.perfilId === cita.perfilId && (c.d.estatus !== "cerrado" || c.id === cita.casoId));
  const existentes = await db.todos("citas");
  const programada = cita.estado === "programada";
  const vigente = k.esVigente(cita);
  const ligada = await Promise.all([cita.reprogramadaDe, cita.reprogramadaA].map(x => (x ? db.uno("citas", x) : null)));
  const puedeEscribir = cita.legible || esCoordinadora(yo) || cita.perfilId === yo.id;
  const opciones = gestiona ? [
    ...(programada && cita.legible ? [{ id: "editar", icono: "editar", texto: "Editar datos" }] : []),
    ...(programada ? [{ id: "cancelar", icono: "salir", texto: "Cancelar cita" }] : [{ id: "reabrir", icono: "reabrir", texto: "Volver a programada" }]),
    { id: "eliminar", icono: "eliminar", texto: "Eliminar cita", clase: "danger" },
  ] : [];

  const cuerpo = pintar(usuaria?.nombre || "Cita", `
    <section class="panel stack">
      <div class="card-head">
        <span class="meta">${chip(cita)}</span>
        <span class="icon-row">
          ${gestiona && programada ? botonIcono("activar", "Asistió", { id: "asistio", clase: "quieto" }) + botonIcono("salir", "No asistió", { id: "noasistio", clase: "quieto" }) : ""}
          ${gestiona && programada ? botonIcono("reloj", "Reprogramar", { id: "reprogramar", clase: "quieto" }) : ""}
          ${vigente ? botonIcono("calendario", "Calendario", { id: "calendario", clase: "quieto", titulo: "Agregar la cita al calendario" }) : ""}
          ${menuMas(opciones)}
        </span>
      </div>
      <dl class="facts dos">
        <div class="largo"><dt>Usuaria</dt><dd>${usuaria ? `<a href="#/usuarias/${esc(usuaria.id)}">${esc(usuaria.nombre)}</a>` : "—"}</dd></div>
        <div class="largo"><dt>Fecha y hora</dt><dd>${esc(diaSemana(cita.fecha))} ${esc(fechaLarga(cita.fecha))}, ${esc(horario(cita))}</dd></div>
        <div><dt>Duración</dt><dd>${esc(duracion(cita.duracion))}</dd></div>
        <div><dt>Atiende</dt><dd>${esc(perfil?.nombre || "—")}${perfil ? ` · ${esc(nombreRol(perfil.rol))}` : ""}</dd></div>
        <div class="largo"><dt>Lugar o modalidad</dt><dd>${esc(cita.d.lugar || "—")}</dd></div>
        <div class="largo"><dt>Motivo</dt><dd>${cita.legible ? esc(cita.d.motivo || "—") : "Protegido: el perfil responsable debe ingresar una vez con su PIN"}</dd></div>
        ${caso ? `<div class="largo"><dt>Caso relacionado</dt><dd>${caso.legible ? `<a href="#/casos/${esc(caso.id)}">${esc(caso.d.asunto || "Ver caso")}</a>` : "Caso protegido"}</dd></div>` : ""}
        ${ligada[0] ? `<div class="largo"><dt>Reprogramada de</dt><dd><a href="#/citas/${esc(ligada[0].id)}">${esc(fechaLarga(ligada[0].fecha))}, ${esc(ligada[0].hora)} h</a></dd></div>` : ""}
        ${ligada[1] ? `<div class="largo"><dt>Nueva fecha</dt><dd><a href="#/citas/${esc(ligada[1].id)}">${esc(fechaLarga(ligada[1].fecha))}, ${esc(ligada[1].hora)} h</a></dd></div>` : ""}
      </dl>
      ${vigente ? `<p class="hint">El evento del calendario no incluye el nombre de la usuaria ni el motivo, para proteger su privacidad.</p>` : ""}
      ${!gestiona ? `<p class="hint">Consulta: solo lectura.</p>` : ""}
    </section>

    ${gestiona && programada ? `<section class="panel stack" id="reprog" hidden>
      <div class="card-head"><h2 class="h3">Reprogramar cita</h2><span class="icon-row">${botonIcono("salir", "Cancelar", { id: "cancelarReprog", clase: "quieto" })}</span></div>
      <p class="hint">La cita actual quedará marcada como reprogramada y se agendará otra con el mismo motivo y lugar.</p>
      <div class="grid" id="fr">
        <div class="field"><label for="r-fecha">Nueva fecha</label><input id="r-fecha" type="date" data-campo="fecha" min="${hoy()}"></div>
        <div class="field"><label for="r-hora">Nueva hora</label><input id="r-hora" type="time" data-campo="hora" value="${esc(cita.hora)}"></div>
        <div class="field"><label for="r-dur">Duración</label><select id="r-dur" data-campo="duracion">${k.DURACIONES.map(m => `<option value="${m}" ${m === cita.duracion ? "selected" : ""}>${esc(duracion(m))}</option>`).join("")}</select></div>
      </div>
      <div id="errr"></div>
      <div class="actions"><button class="btn primary" id="guardarReprog">Reprogramar</button></div>
    </section>` : ""}

    ${gestiona && programada && cita.legible ? `<section class="panel stack" id="editor" hidden>
      <div class="card-head"><h2 class="h3">Datos de la cita</h2><span class="icon-row">${botonIcono("salir", "Cancelar", { id: "cancelarEditor", clase: "quieto" })}</span></div>
      <div class="grid" id="fe">${campos({ ...cita, ...cita.d }, { prefijo: "e", casosDe, minimo: cita.fecha < hoy() ? cita.fecha : hoy() })}</div>
      <div id="erre"></div>
      <div class="actions"><button class="btn primary" id="guardarEditor">Guardar cambios</button></div>
    </section>` : ""}
  `, { atras: "#/citas" });

  conectarMenus(cuerpo);
  const estado = (nuevo, texto) => unaVez(async () => { await k.cambiarEstado(cita, nuevo); aviso(texto); ctx.recargar(); });
  $("#asistio", cuerpo)?.addEventListener("click", estado("asistio", "Asistencia registrada"));
  $("#noasistio", cuerpo)?.addEventListener("click", estado("no_asistio", "Inasistencia registrada"));
  $("#reabrir", cuerpo)?.addEventListener("click", estado("programada", "La cita volvió a programada"));
  const cancelar = $("#cancelar", cuerpo);
  if (cancelar) dobleToque(cancelar, "Toque nuevamente para cancelar la cita", async () => { await k.cambiarEstado(cita, "cancelada"); aviso("Cita cancelada"); ctx.recargar(); });
  const eliminar = $("#eliminar", cuerpo);
  if (eliminar) dobleToque(eliminar, "Toque nuevamente para eliminar la cita", async () => { await k.borrarCita(cita.id); aviso("Cita eliminada"); ir("#/citas"); });

  const abrirPanel = (panel, foco) => { $("#reprog", cuerpo) && ($("#reprog", cuerpo).hidden = true); $("#editor", cuerpo) && ($("#editor", cuerpo).hidden = true); $(panel, cuerpo).hidden = false; $(foco, cuerpo).focus(); $(panel, cuerpo).scrollIntoView({ block: "center" }); };
  $("#reprogramar", cuerpo)?.addEventListener("click", () => abrirPanel("#reprog", "#r-fecha"));
  $("#cancelarReprog", cuerpo)?.addEventListener("click", () => ($("#reprog", cuerpo).hidden = true));
  $("#editar", cuerpo)?.addEventListener("click", () => abrirPanel("#editor", "#e-fecha"));
  $("#cancelarEditor", cuerpo)?.addEventListener("click", () => ($("#editor", cuerpo).hidden = true));

  $("#guardarReprog", cuerpo)?.addEventListener("click", unaVez(async () => {
    const d = leer($("#fr", cuerpo));
    const e = k.validar({ ...d, usuariaId: cita.usuariaId, perfilId: cita.perfilId }, existentes, cita.id);
    if (d.fecha && d.fecha < hoy()) e.push("La nueva fecha no puede ser anterior a hoy.");
    if (!e.length && !puedeEscribir) e.push("No se puede reprogramar: el contenido de la cita está bloqueado.");
    errores($("#errr", cuerpo), e);
    if (e.length) return;
    const nueva = await k.reprogramar(yo, cita, d);
    aviso("Cita reprogramada");
    ir(`#/citas/${nueva.id}`);
  }));
  $("#guardarEditor", cuerpo)?.addEventListener("click", unaVez(async () => {
    const d = leer($("#fe", cuerpo));
    const e = k.validar({ ...d, usuariaId: cita.usuariaId, perfilId: cita.perfilId }, existentes, cita.id);
    errores($("#erre", cuerpo), e);
    if (e.length) return;
    await k.guardarCita(yo, cita, d);
    aviso("Cita actualizada");
    ctx.recargar();
  }));
  $("#calendario", cuerpo)?.addEventListener("click", async () => {
    try {
      const evento = k.paraCalendario(cita);
      evento.folio = `CITA-${cita.fecha.replaceAll("-", "")}-${cita.hora.replace(":", "")}`;
      const r = await agregarAlCalendario(evento);
      if (r === "descargado") aviso("Archivo de calendario descargado. Ábralo para agregar el evento con sus recordatorios");
      else if (r === "compartido") aviso("Elija «Calendario» para agregar el evento con sus recordatorios");
    } catch (err) {
      console.error(err);
      aviso("No se pudo generar el archivo de calendario.");
    }
  });
}

export default {
  menu: [],
  rutas: [
    [/^#\/citas$/, ctx => agenda(ctx)],
    [/^#\/citas\/usuaria\/([\w-]+)$/, agenda],
    [/^#\/citas\/nueva(?:\/([\w-]+))?$/, nueva],
    [/^#\/citas\/(?!nueva$|usuaria$)([\w-]+)$/, detalle],
  ],
};
