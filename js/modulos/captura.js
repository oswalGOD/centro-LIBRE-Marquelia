// Registro de una persona en una actividad: datos, reconocimiento en el padrón y firma.

import * as db from "../core/db.js";
import { GRUPOS, SEXOS, leerCurp, limpiarCurp, edad, rangoDe, etiquetaRango, normalizar } from "../core/catalogos.js";
import { puedeEditar } from "../core/permisos.js";
import { panelFirma } from "../core/firma.js";
import { $, $$, esc, aviso, errores, dobleToque } from "../core/ui.js";

const CAMPOS = ["curp", "nombre", "fnac", "sexo", "lugar", "grupo", "ocupacion", "telefono"];

export async function captura({ yo, pintar, ir }, actividadId, asistenciaId) {
  const act = await db.uno("actividades", actividadId);
  if (!act || !puedeEditar(yo, act)) return ir(`#/actividad/${actividadId}`);
  const existente = asistenciaId ? await db.uno("asistencias", asistenciaId) : null;
  if (asistenciaId && !existente) return ir(`#/actividad/${actividadId}`);
  const padron = await db.todos("personas");
  const yaEnLista = new Set((await db.todos("asistencias", "actividadId", actividadId)).filter(x => x.id !== asistenciaId).map(x => x.personaId));

  // Borrador de la persona que se está capturando
  const d = existente
    ? { ...existente.datos, personaId: existente.personaId, sinCurp: !existente.datos.curp }
    : { curp: "", nombre: "", fnac: "", sexo: "", lugar: "", grupo: "", ocupacion: "", telefono: "", personaId: null, sinCurp: false };

  const volver = `#/actividad/${actividadId}`;
  const c = pintar(existente ? "Editar asistente" : "Registrar asistente", `
    <p class="hint context">${esc(act.nombre)} · <span class="mono">${esc(act.folio)}</span></p>
    <section class="panel stack">
      ${existente ? "" : `
      <div class="field search-field"><label for="buscar">Buscar en el padrón por nombre</label>
        <input id="buscar" type="search" autocomplete="off" placeholder="Para quien ya vino antes y no trae su CURP">
        <div class="results" id="resultados" hidden></div></div>`}
      <div class="grid">
        <div class="field span-2"><label for="curp">CURP</label>
          <input id="curp" class="upper" maxlength="18" autocomplete="off" spellcheck="false" placeholder="18 caracteres" value="${esc(d.curp)}">
          <span class="note" id="curpNota"></span>
          <label class="check"><input type="checkbox" id="sinCurp" ${d.sinCurp ? "checked" : ""}> La persona no tiene CURP</label></div>
        <div id="reconocida" class="span-2" hidden></div>
        <div class="field span-2"><label for="nombre">Nombre completo</label><input id="nombre" data-c="nombre" autocomplete="off" placeholder="Nombre(s) y apellidos, sin abreviaturas"></div>
        <div class="field"><label for="fnac">Fecha de nacimiento</label><input id="fnac" type="date" data-c="fnac"><span class="note ok" id="edadNota"></span></div>
        <div class="field"><label for="lugar">Lugar de nacimiento</label><input id="lugar" data-c="lugar" autocomplete="off"></div>
        <div class="field"><label for="ocupacion">Ocupación</label><input id="ocupacion" data-c="ocupacion" autocomplete="off"></div>
        <div class="field"><label for="telefono">Teléfono</label><input id="telefono" type="tel" inputmode="tel" data-c="telefono" autocomplete="off" placeholder="10 dígitos"></div>
      </div>
      <div class="field"><span class="legend">Sexo</span><div class="choices" data-elegir="sexo">${SEXOS.map(([v, t]) => `<button type="button" class="choice" data-v="${v}">${t}</button>`).join("")}</div></div>
      <div class="field"><span class="legend">Grupo</span><div class="choices" data-elegir="grupo">${GRUPOS.map(([v, t]) => `<button type="button" class="choice" data-v="${v}"><b>${v})</b> ${t}</button>`).join("")}</div></div>
      <div class="field"><span class="legend">Firma</span>
        <div class="sigpad"><canvas id="firma" aria-label="Área para firmar"></canvas><div class="baseline"></div><div class="ph">Firme con el dedo o el lápiz sobre la línea</div></div>
        <div class="actions"><button type="button" class="btn small ghost" id="borrarFirma">Borrar firma</button></div></div>
      <div id="err"></div>
      <div class="actions">
        <button class="btn primary" id="guardar">${existente ? "Guardar cambios" : "Guardar asistente"}</button>
        ${existente ? "" : `<button class="btn" id="guardarOtra">Guardar y registrar otra</button>`}
        <a class="btn ghost" href="${volver}">Cancelar</a>
        ${existente ? `<button class="btn danger push" id="quitar">Quitar de esta lista</button>` : ""}
      </div>
    </section>`, { atras: volver });

  const firma = panelFirma($("#firma", c), existente?.firma || "");

  function pintarCampos() {
    $("#curp", c).value = d.curp;
    $$("[data-c]", c).forEach(el => (el.value = d[el.dataset.c] || ""));
    $$("[data-elegir]", c).forEach(g => $$(".choice", g).forEach(b => b.setAttribute("aria-pressed", d[g.dataset.elegir] === b.dataset.v)));
    const e = edad(d.fnac, act.fecha);
    $("#edadNota", c).textContent = e == null || e < 0 ? "" : `${e} años el día de la actividad · Rango ${rangoDe(e)}) ${etiquetaRango(rangoDe(e))}`;
    $("#curp", c).disabled = d.sinCurp;
  }

  function reconocer(p) {
    CAMPOS.forEach(k => (d[k] = p[k] || ""));
    d.personaId = p.id;
    d.sinCurp = !p.curp;
    $("#sinCurp", c).checked = d.sinCurp;
    const visitas = p.visitas ?? 0;
    const r = $("#reconocida", c);
    r.hidden = false;
    r.innerHTML = yaEnLista.has(p.id)
      ? `<div class="issues"><b>${esc(p.nombre)} ya está registrada en esta actividad.</b></div>`
      : `<div class="recognized">Persona ya registrada en el padrón${visitas ? ` · ${visitas} ${visitas === 1 ? "actividad anterior" : "actividades anteriores"}` : ""}. Confirma que sus datos sigan vigentes y pide su firma.</div>`;
    pintarCampos();
  }

  $$("[data-c]", c).forEach(el => el.addEventListener("input", () => {
    d[el.dataset.c] = el.value;
    if (el.dataset.c === "fnac") pintarCampos();
  }));
  $$("[data-elegir]", c).forEach(g => g.addEventListener("click", ev => {
    const b = ev.target.closest(".choice");
    if (!b) return;
    d[g.dataset.elegir] = b.dataset.v;
    pintarCampos();
  }));

  $("#curp", c).addEventListener("input", ev => {
    d.curp = limpiarCurp(ev.target.value);
    ev.target.value = d.curp;
    const nota = $("#curpNota", c);
    nota.className = "note";
    if (d.curp.length < 18) { nota.textContent = d.curp ? `${d.curp.length} de 18 caracteres` : ""; return; }
    const info = leerCurp(d.curp);
    if (!info) { nota.className = "note warn"; nota.textContent = "La CURP no tiene un formato válido. Revisa letras y números."; return; }
    const conocida = padron.find(p => p.curp === d.curp && p.id !== d.personaId);
    if (conocida && !existente) {
      nota.textContent = "";
      return reconocer({ ...conocida, visitas: conocida.visitas });
    }
    d.fnac = info.fnac;
    d.sexo = info.sexo;
    if (!d.lugar) d.lugar = info.lugar;
    nota.className = "note ok";
    nota.textContent = "Fecha de nacimiento, sexo y estado tomados de la CURP.";
    pintarCampos();
  });

  $("#sinCurp", c).addEventListener("change", ev => {
    d.sinCurp = ev.target.checked;
    if (d.sinCurp) d.curp = "";
    $("#curpNota", c).textContent = d.sinCurp ? "En el formato aparecerá “SIN CURP”. Captura la fecha de nacimiento y el sexo a mano." : "";
    pintarCampos();
  });

  // Conteo de visitas para mostrar al reconocer
  const asistencias = await db.todos("asistencias");
  padron.forEach(p => (p.visitas = asistencias.filter(x => x.personaId === p.id).length));

  const buscar = $("#buscar", c);
  if (buscar) buscar.addEventListener("input", () => {
    const q = normalizar(buscar.value).trim();
    const res = $("#resultados", c);
    if (q.length < 3) { res.hidden = true; return; }
    const palabras = q.split(/\s+/);
    const hallados = padron.filter(p => palabras.every(w => normalizar(p.nombre).includes(w))).slice(0, 6);
    res.hidden = false;
    res.innerHTML = hallados.length
      ? hallados.map(p => `<button type="button" data-id="${p.id}"><b>${esc(p.nombre)}</b><small>${esc(p.curp || "Sin CURP")} · ${edad(p.fnac, act.fecha) ?? "?"} años</small></button>`).join("")
      : `<p class="hint">No hay nadie con ese nombre en el padrón. Captura sus datos abajo.</p>`;
    $$("button", res).forEach(b => (b.onclick = () => {
      reconocer(padron.find(p => p.id === b.dataset.id));
      res.hidden = true;
      buscar.value = "";
    }));
  });

  $("#borrarFirma", c).onclick = () => firma.limpiar();

  async function guardar(otra) {
    const e = [];
    if (!d.sinCurp && !leerCurp(d.curp)) e.push("CURP válida de 18 caracteres (o marca que no tiene CURP)");
    const nombre = d.nombre.trim().replace(/\s+/g, " ");
    if (nombre.split(" ").length < 2) e.push("Nombre completo con apellidos");
    if (!d.fnac) e.push("Fecha de nacimiento");
    else if (edad(d.fnac, act.fecha) < 0) e.push("La fecha de nacimiento es posterior a la actividad");
    if (!d.sexo) e.push("Sexo");
    if (!d.lugar.trim()) e.push("Lugar de nacimiento");
    if (!d.grupo) e.push("Grupo");
    if (!d.ocupacion.trim()) e.push("Ocupación");
    const tel = d.telefono.replace(/\D/g, "");
    if (tel.length !== 10) e.push("Teléfono de 10 dígitos");
    const imagenFirma = firma.valor();
    if (!imagenFirma) e.push("Firma");

    // CURP repetida en el padrón con otra persona
    const curp = d.sinCurp ? "" : d.curp;
    const duena = curp && padron.find(p => p.curp === curp && p.id !== d.personaId);
    if (duena && existente) e.push(`Esa CURP ya pertenece a ${duena.nombre} en el padrón`);
    errores($("#err", c), e, "El formato no admite espacios en blanco. Falta:");
    if (e.length) return;

    const datos = { curp, nombre, fnac: d.fnac, sexo: d.sexo, lugar: d.lugar.trim(), grupo: d.grupo, ocupacion: d.ocupacion.trim(), telefono: tel };
    let persona = (d.personaId && (await db.uno("personas", d.personaId))) || (duena && !existente ? duena : null);
    if (persona && yaEnLista.has(persona.id)) return errores($("#err", c), [`${persona.nombre} ya está registrada en esta actividad.`]);
    persona = { ...(persona || { id: db.uid(), creadaPor: yo.id }), ...datos };
    if (!curp) delete persona.curp;
    await db.guardar("personas", persona);

    const orden = existente?.orden ?? (await db.todos("asistencias", "actividadId", actividadId)).reduce((m, x) => Math.max(m, x.orden), 0) + 1;
    await db.guardar("asistencias", {
      ...(existente || { id: db.uid(), actividadId, registradaPor: yo.id }),
      personaId: persona.id, orden, datos, firma: imagenFirma,
    });
    aviso(existente ? "Cambios guardados" : `${nombre.split(" ")[0]} quedó registrada`);
    if (otra) captura({ yo, pintar, ir }, actividadId); // la ruta no cambia: se abre un formulario en blanco
    else ir(volver);
  }
  $("#guardar", c).onclick = () => guardar(false);
  $("#guardarOtra", c)?.addEventListener("click", () => guardar(true));

  const quitar = $("#quitar", c);
  if (quitar) dobleToque(quitar, "Toca otra vez para quitarla", async () => {
    await db.borrar("asistencias", existente.id);
    aviso("Persona quitada de la lista");
    ir(volver);
  });

  pintarCampos();
  if (!existente) (buscar || $("#curp", c)).focus({ preventScroll: true });
}
