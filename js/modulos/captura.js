// Registro de una persona en una actividad: datos, reconocimiento de usuarias que ya vinieron y firma.

import * as db from "../core/db.js";
import { GRUPOS, SEXOS, leerCurp, limpiarCurp, edad, rangoDe, etiquetaRango, normalizar } from "../core/catalogos.js";
import { puedeEditar } from "../core/permisos.js";
import { pedirFirma } from "../core/firma.js";
import { $, $$, esc, aviso, errores, dobleToque } from "../core/ui.js";

const CAMPOS = ["curp", "nombre", "fnac", "sexo", "lugar", "grupo", "ocupacion", "telefono"];

export async function captura({ yo, pintar, ir }, actividadId, asistenciaId) {
  const act = await db.uno("actividades", actividadId);
  if (!act || !puedeEditar(yo, act)) return ir(`#/actividad/${actividadId}`);
  const existente = asistenciaId ? await db.uno("asistencias", asistenciaId) : null;
  if (asistenciaId && !existente) return ir(`#/actividad/${actividadId}`);
  const registradas = await db.todos("usuarias");
  const yaEnLista = new Set((await db.todos("asistencias", "actividadId", actividadId)).filter(x => x.id !== asistenciaId).map(x => x.usuariaId));

  // Borrador de la persona que se está capturando
  const d = existente
    ? { ...existente.datos, usuariaId: existente.usuariaId, sinCurp: !existente.datos.curp }
    : { curp: "", nombre: "", fnac: "", sexo: "", lugar: "", grupo: "", ocupacion: "", telefono: "", usuariaId: null, sinCurp: false };

  const volver = `#/actividad/${actividadId}`;
  const c = pintar(existente ? "Editar asistente" : "Registrar asistente", `
    <p class="hint context">${esc(act.nombre)} · <span class="mono">${esc(act.folio)}</span></p>
    <section class="panel stack">
      ${existente ? "" : `
      <div class="field search-field"><label for="buscar">Buscar usuaria por nombre</label>
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
        <div class="sig-row"><div class="sig-preview" id="firmaVista"></div>
          <button type="button" class="btn" id="firmar"></button></div></div>
      <div id="err"></div>
      <div class="actions">
        <button class="btn primary" id="guardar">${existente ? "Guardar cambios" : "Guardar asistente"}</button>
        ${existente ? "" : `<button class="btn" id="guardarOtra">Guardar y registrar otra</button>`}
        <a class="btn ghost" href="${volver}">Cancelar</a>
        ${existente ? `<button class="btn danger push" id="quitar">Quitar de esta lista</button>` : ""}
      </div>
    </section>`, { atras: volver });

  let firma = existente?.firma || "";
  function pintarFirma() {
    $("#firmaVista", c).innerHTML = firma ? `<img src="${firma}" alt="Firma capturada">` : `<span>Sin firma</span>`;
    $("#firmaVista", c).classList.toggle("vacia", !firma);
    $("#firmar", c).textContent = firma ? "Volver a firmar" : "Firmar";
  }
  pintarFirma();

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
    d.usuariaId = p.id;
    d.sinCurp = !p.curp;
    $("#sinCurp", c).checked = d.sinCurp;
    const visitas = p.visitas ?? 0;
    const r = $("#reconocida", c);
    r.hidden = false;
    r.innerHTML = yaEnLista.has(p.id)
      ? `<div class="issues"><b>${esc(p.nombre)} ya está registrada en esta actividad.</b></div>`
      : `<div class="recognized">Usuaria ya registrada${visitas ? ` · ${visitas} ${visitas === 1 ? "actividad anterior" : "actividades anteriores"}` : ""}. Confirma que sus datos sigan vigentes y pide su firma.</div>`;
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
    const conocida = registradas.find(p => p.curp === d.curp && p.id !== d.usuariaId);
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
  registradas.forEach(p => (p.visitas = asistencias.filter(x => x.usuariaId === p.id).length));

  const buscar = $("#buscar", c);
  if (buscar) buscar.addEventListener("input", () => {
    const q = normalizar(buscar.value).trim();
    const res = $("#resultados", c);
    if (q.length < 3) { res.hidden = true; return; }
    const palabras = q.split(/\s+/);
    const hallados = registradas.filter(p => palabras.every(w => normalizar(p.nombre).includes(w))).slice(0, 6);
    res.hidden = false;
    res.innerHTML = hallados.length
      ? hallados.map(p => `<button type="button" data-id="${p.id}"><b>${esc(p.nombre)}</b><small>${esc(p.curp || "Sin CURP")} · ${edad(p.fnac, act.fecha) ?? "?"} años</small></button>`).join("")
      : `<p class="hint">No hay ninguna usuaria con ese nombre. Captura sus datos abajo.</p>`;
    $$("button", res).forEach(b => (b.onclick = () => {
      reconocer(registradas.find(p => p.id === b.dataset.id));
      res.hidden = true;
      buscar.value = "";
    }));
  });

  $("#firmar", c).onclick = async () => {
    const nueva = await pedirFirma({ titulo: d.nombre.trim() ? `Firma de ${d.nombre.trim()}` : "Firma de la persona asistente", existente: firma });
    if (nueva) { firma = nueva; pintarFirma(); }
  };

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
    const imagenFirma = firma;
    if (!imagenFirma) e.push("Firma");

    // CURP repetida con otra usuaria
    const curp = d.sinCurp ? "" : d.curp;
    const duena = curp && registradas.find(p => p.curp === curp && p.id !== d.usuariaId);
    if (duena && existente) e.push(`Esa CURP ya pertenece a ${duena.nombre} en Usuarias`);
    errores($("#err", c), e, "El formato no admite espacios en blanco. Falta:");
    if (e.length) return;

    const datos = { curp, nombre, fnac: d.fnac, sexo: d.sexo, lugar: d.lugar.trim(), grupo: d.grupo, ocupacion: d.ocupacion.trim(), telefono: tel };
    let usuaria = (d.usuariaId && (await db.uno("usuarias", d.usuariaId))) || (duena && !existente ? duena : null);
    if (usuaria && yaEnLista.has(usuaria.id)) return errores($("#err", c), [`${usuaria.nombre} ya está registrada en esta actividad.`]);
    usuaria = { ...(usuaria || { id: db.uid(), creadaPor: yo.id }), ...datos };
    if (!curp) delete usuaria.curp;
    await db.guardar("usuarias", usuaria);

    const orden = existente?.orden ?? (await db.todos("asistencias", "actividadId", actividadId)).reduce((m, x) => Math.max(m, x.orden), 0) + 1;
    await db.guardar("asistencias", {
      ...(existente || { id: db.uid(), actividadId, registradaPor: yo.id }),
      usuariaId: usuaria.id, orden, datos, firma: imagenFirma,
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
    aviso("Usuaria quitada de la lista");
    ir(volver);
  });

  pintarCampos();
  if (!existente) (buscar || $("#curp", c)).focus({ preventScroll: true });
}
