// Registro de una persona en una actividad: datos, reconocimiento de usuarias que ya vinieron y firma.

import * as db from "../core/db.js";
import { botonIcono } from "../core/iconos.js";
import { aMayusculas, aCapital, FORMATOS, GRUPOS, SEXOS, leerCurp, limpiarCurp, edad, rangoDe, etiquetaRango, normalizar, fechaLarga } from "../core/catalogos.js";
import { puedeVer, puedeEditar } from "../core/permisos.js";
import { pedirFirma } from "../core/firma.js";
import { escanearCurp } from "../core/escaner.js";
import { escanearIne } from "../core/ine.js";
import { $, $$, esc, aviso, errores, dobleToque, unaVez } from "../core/ui.js";

const MOTIVOS_SIN_FIRMA = ["Menor de edad", "Otro motivo"];
const CAMPOS = ["curp", "nombre", "fnac", "sexo", "lugar", "grupo", "ocupacion", "telefono"];

/** La sesión anterior: la actividad de la que se repitió o, si no, la última con el mismo nombre. */
async function sesionAnterior(yo, act) {
  const previa = act.anteriorId && (await db.uno("actividades", act.anteriorId));
  if (previa && puedeVer(yo, previa)) return previa;
  const nombre = normalizar(act.nombre).trim();
  return (await db.todos("actividades"))
    .filter(a => a.id !== act.id && puedeVer(yo, a) && normalizar(a.nombre).trim() === nombre && (a.fecha < act.fecha || (a.fecha === act.fecha && a.creado < act.creado)))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado)[0] || null;
}

/**
 * Con kiosko = true es el «modo captura de datos»: la propia usuaria llena su registro. No se muestran
 * sugerencias, búsquedas ni datos de otras usuarias, y no hay forma de salir de la pantalla.
 */
export async function captura({ yo, pintar, ir, kiosko = false }, actividadId, asistenciaId) {
  const act = await db.uno("actividades", actividadId);
  if (!act || !puedeEditar(yo, act)) return ir(`#/actividad/${actividadId}`);
  const existente = asistenciaId ? await db.uno("asistencias", asistenciaId) : null;
  if (asistenciaId && !existente) return ir(`#/actividad/${actividadId}`);
  const registradas = await db.todos("usuarias");
  const yaEnLista = new Set((await db.todos("asistencias", "actividadId", actividadId)).filter(x => x.id !== asistenciaId).map(x => x.usuariaId));
  const anterior = existente || kiosko ? null : await sesionAnterior(yo, act);
  const deAntes = anterior
    ? (await db.todos("asistencias", "actividadId", anterior.id)).sort((x, y) => x.orden - y.orden)
        .map(x => registradas.find(p => p.id === x.usuariaId)).filter(p => p && !yaEnLista.has(p.id))
    : [];

  // Borrador de la persona que se está capturando
  const d = existente
    ? { ...existente.datos, usuariaId: existente.usuariaId }
    : { curp: "", nombre: "", fnac: "", sexo: "", lugar: "", grupo: "", ocupacion: "", telefono: "", usuariaId: null };

  const volver = `#/actividad/${actividadId}`;
  const c = pintar(existente ? "Editar asistente" : kiosko ? "Registro de asistencia" : "Registrar asistente", `
    ${kiosko ? `<p class="hint context">${esc(act.nombre)}</p>` : `<div class="card-head"><p class="hint context">${esc(act.nombre)} · <span class="mono">${esc(act.folio)}</span></p>
      <span class="icon-row">${botonIcono("salir", "Cancelar", { href: volver, clase: "quieto" })}${existente ? botonIcono("eliminar", "Quitar", { id: "quitar", clase: "quieto danger", titulo: "Quitar de esta lista" }) : ""}</span></div>`}
    ${kiosko ? `<p class="hint">Complete sus datos, firme y toque «Guardar mi registro». La CURP y la firma son opcionales; los demás campos son obligatorios.</p>` : ""}
    ${deAntes.length ? `
    <section class="panel stack" id="deAntes">
      <div><h2 class="h3">Asistentes de la sesión anterior</h2>
        <p class="hint">${esc(anterior.nombre)} · ${fechaLarga(anterior.fecha)}. Seleccione a la persona para completar sus datos; solo resta confirmarlos y solicitar su firma.</p></div>
      <div class="results">${deAntes.map(p => `<button type="button" data-id="${esc(p.id)}"><b>${esc(p.nombre)}</b><small>${esc(p.curp || "Sin CURP")} · ${edad(p.fnac, act.fecha) ?? "?"} años</small></button>`).join("")}</div>
    </section>` : ""}
    <section class="panel stack">
      ${existente || kiosko ? "" : `
      <div class="field search-field"><label for="buscar">Buscar usuaria por nombre</label>
        <input id="buscar" type="search" autocomplete="off" placeholder="Para quien ya asistió antes y no presenta su CURP">
        <div class="results" id="resultados" hidden></div></div>`}
      <div class="grid">
        <div class="field span-2"><label for="curp">CURP (opcional)</label>
          <div class="input-row"><input id="curp" class="upper" maxlength="18" autocomplete="off" spellcheck="false" placeholder="18 caracteres" value="${esc(d.curp)}">
            ${existente ? "" : `${botonIcono("escaner", "CURP", { id: "escanear", titulo: "Escanear CURP" })}${botonIcono("identificacion", "INE", { id: "escanearIne", titulo: "Escanear INE" })}`}</div>
          <span class="note" id="curpNota">Opcional. Si no la tiene a la mano, puede capturarla después.</span></div>
        <div id="reconocida" class="span-2" hidden></div>
        <div class="field span-2"><label for="nombre">Nombre completo</label><input id="nombre" data-c="nombre" data-formato="mayus" autocomplete="off" placeholder="Nombre(s) y apellidos, sin abreviaturas"></div>
        <div class="field"><label for="fnac">Fecha de nacimiento</label><input id="fnac" type="date" data-c="fnac"><span class="note ok" id="edadNota"></span></div>
        <div class="field"><label for="lugar">Lugar de nacimiento</label><input id="lugar" data-c="lugar" data-formato="capital" autocomplete="off"></div>
        <div class="field"><label for="ocupacion">Ocupación</label><input id="ocupacion" data-c="ocupacion" autocomplete="off"></div>
        <div class="field"><label for="telefono">Teléfono</label><input id="telefono" type="tel" inputmode="tel" data-c="telefono" autocomplete="off" placeholder="10 dígitos"></div>
      </div>
      <div class="field"><span class="legend">Sexo</span><div class="choices" data-elegir="sexo">${SEXOS.map(([v, t]) => `<button type="button" class="choice" data-v="${v}">${t}</button>`).join("")}</div></div>
      <div class="field"><span class="legend">Grupo</span><div class="choices" data-elegir="grupo">${GRUPOS.map(([v, t]) => `<button type="button" class="choice" data-v="${v}"><b>${v})</b> ${t}</button>`).join("")}</div></div>
      <div class="field"><span class="legend">Firma (opcional)</span>
        <div class="sig-row"><div class="sig-preview" id="firmaVista"></div>
          <button type="button" class="btn" id="firmar"></button></div>
        <label class="check"><input type="checkbox" id="omitirFirma"> Omitir la firma</label>
        <div class="choices" id="motivoFirma" hidden>${MOTIVOS_SIN_FIRMA.map(m => `<button type="button" class="choice" data-v="${esc(m)}">${esc(m)}</button>`).join("")}</div>
        <span class="note" id="firmaNota"></span></div>
      <div id="faltan" aria-live="polite"></div>
      <div id="err"></div>
      ${kiosko ? `<div class="actions"><button class="btn primary" id="guardar">Guardar mi registro</button></div>` : ""}
    </section>
    ${kiosko ? "" : `<div class="barra-fija"><button class="btn primary" id="guardar">${existente ? "Guardar cambios" : "Guardar asistente"}</button>${existente ? "" : `<button class="btn" id="guardarOtra">Guardar y registrar otra</button>`}</div>`}`, { atras: volver, kiosko });

  let firma = existente?.firma || "";
  let sinFirma = existente?.sinFirma || ""; // motivo por el que no se firma (vacío = sí firma)
  let omitir = !!sinFirma;
  function pintarFirma() {
    const vista = $("#firmaVista", c);
    vista.innerHTML = firma ? `<img src="${esc(firma)}" alt="Firma capturada">` : `<span>${omitir ? esc(sinFirma || "Firma omitida") : "Sin firma"}</span>`;
    vista.classList.toggle("vacia", !firma);
    $("#firmar", c).textContent = firma ? "Volver a firmar" : "Firmar";
    $("#omitirFirma", c).checked = omitir;
    $("#omitirFirma", c).disabled = !!firma;
    $("#motivoFirma", c).hidden = !omitir || !!firma;
    $$("#motivoFirma .choice", c).forEach(b => b.setAttribute("aria-pressed", b.dataset.v === sinFirma));
    pintarFirmaNota();
  }
  function pintarFirmaNota() {
    const e = edad(d.fnac, act.fecha);
    $("#firmaNota", c).textContent = !firma && !omitir && e != null && e >= 0 && e < 18
      ? "La persona es menor de edad: puede omitir la firma indicando el motivo." : "";
  }

  // Tras escanear la CURP o la INE se resaltan los datos obligatorios que aún faltan;
  // el resaltado de cada campo desaparece en cuanto se llena.
  let resaltar = false;
  function camposFaltantes() {
    const f = [];
    if (d.curp && !leerCurp(d.curp)) f.push(["curp", "#curp", "CURP válida (o déjela vacía)"]);
    if (d.nombre.trim().replace(/\s+/g, " ").split(" ").length < 2) f.push(["nombre", "#nombre", "Nombre completo"]);
    if (!d.fnac) f.push(["fnac", "#fnac", "Fecha de nacimiento"]);
    if (!d.sexo) f.push(["sexo", "[data-elegir=sexo]", "Sexo"]);
    if (!d.lugar.trim()) f.push(["lugar", "#lugar", "Lugar de nacimiento"]);
    if (!d.grupo) f.push(["grupo", "[data-elegir=grupo]", "Grupo"]);
    if (!d.ocupacion.trim()) f.push(["ocupacion", "#ocupacion", "Ocupación"]);
    if (d.telefono.replace(/\D/g, "").length !== 10) f.push(["telefono", "#telefono", "Teléfono de 10 dígitos"]);
    return f;
  }
  function pintarFaltantes() {
    const faltan = resaltar ? camposFaltantes() : [];
    const claves = new Set(faltan.map(x => x[0]));
    [["curp", "#curp"], ["nombre", "#nombre"], ["fnac", "#fnac"], ["sexo", "[data-elegir=sexo]"], ["lugar", "#lugar"],
      ["grupo", "[data-elegir=grupo]"], ["ocupacion", "#ocupacion"], ["telefono", "#telefono"]].forEach(([k, sel]) => {
      const el = $(sel, c);
      const campo = el?.closest(".field");
      if (!campo) return;
      campo.classList.toggle("falta", claves.has(k));
      if (el.matches("input")) el.toggleAttribute("aria-invalid", claves.has(k));
    });
    const aviso = $("#faltan", c);
    aviso.innerHTML = faltan.length
      ? `<div class="issues falta-aviso"><b>Faltan ${faltan.length === 1 ? "un dato" : faltan.length + " datos"} para completar el registro:</b> ${faltan.map(x => esc(x[2])).join(", ")}.</div>`
      : resaltar ? `<div class="recognized">Datos completos. Solo resta guardar el registro.</div>` : "";
  }
  pintarFirma();

  function pintarCampos() {
    d.nombre = aMayusculas(d.nombre);
    d.lugar = aCapital(d.lugar);
    $("#curp", c).value = d.curp;
    $$("[data-c]", c).forEach(el => (el.value = d[el.dataset.c] || ""));
    $$("[data-elegir]", c).forEach(g => $$(".choice", g).forEach(b => b.setAttribute("aria-pressed", d[g.dataset.elegir] === b.dataset.v)));
    const e = edad(d.fnac, act.fecha);
    $("#edadNota", c).textContent = e == null || e < 0 ? "" : `${e} años el día de la actividad · Rango ${rangoDe(e)}) ${etiquetaRango(rangoDe(e))}`;
    pintarFirmaNota();
    pintarFaltantes();
  }

  function reconocer(p) {
    CAMPOS.forEach(k => (d[k] = p[k] || ""));
    d.usuariaId = p.id;
    const visitas = p.visitas ?? 0;
    const r = $("#reconocida", c);
    r.hidden = false;
    r.innerHTML = yaEnLista.has(p.id)
      ? `<div class="issues"><b>${esc(p.nombre)} ya está registrada en esta actividad.</b></div>`
      : `<div class="recognized">Usuaria ya registrada${visitas ? ` · ${visitas} ${visitas === 1 ? "actividad anterior" : "actividades anteriores"}` : ""}. Confirme que sus datos sigan vigentes y solicite su firma.</div>`;
    pintarCampos();
  }

  $$("[data-c]", c).forEach(el => el.addEventListener("input", ev => {
    const f = FORMATOS[el.dataset.formato];
    if (f && !ev.isComposing) {
      const pos = el.selectionStart, antes = el.value, nuevo = f(antes);
      if (nuevo !== antes) {
        el.value = nuevo;
        const p = Math.max(0, pos - (antes.length - nuevo.length));
        try { el.setSelectionRange(p, p); } catch {}
      }
    }
    d[el.dataset.c] = el.value;
    if (el.dataset.c === "fnac") pintarCampos(); else pintarFaltantes();
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
    pintarFaltantes();
    const nota = $("#curpNota", c);
    nota.className = "note";
    if (d.curp.length < 18) { nota.textContent = d.curp ? `${d.curp.length} de 18 caracteres` : ""; return; }
    const info = leerCurp(d.curp);
    if (!info) { nota.className = "note warn"; nota.textContent = "La CURP no tiene un formato válido. Verifique letras y números."; return; }
    const conocida = registradas.find(p => p.curp === d.curp && p.id !== d.usuariaId);
    if (conocida && !existente && !kiosko) {
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

  // El QR de la constancia trae la CURP y el nombre completo
  $("#escanear", c)?.addEventListener("click", async () => {
    const r = await escanearCurp();
    if (!r) return;
    resaltar = true;
    $("#curp", c).value = r.curp;
    $("#curp", c).dispatchEvent(new Event("input"));
    if (!kiosko && registradas.some(p => p.curp === r.curp)) return; // ya vino antes: se llenaron sus datos guardados
    d.nombre = r.nombre;
    if (leerCurp(r.curp)) $("#curpNota", c).textContent = "Nombre, fecha de nacimiento, sexo y estado tomados de la constancia de CURP.";
    pintarCampos();
    $("#ocupacion", c).focus();
  });

  // La INE: CURP del frente; nombre, fecha de nacimiento y sexo del reverso
  $("#escanearIne", c)?.addEventListener("click", async () => {
    const r = await escanearIne();
    if (!r) return;
    resaltar = true;
    if (r.curp) {
      $("#curp", c).value = r.curp;
      $("#curp", c).dispatchEvent(new Event("input"));
      if (!kiosko && registradas.some(p => p.curp === r.curp)) return; // ya vino antes: se llenaron sus datos guardados
    } else {
      if (r.fnac) d.fnac = r.fnac;
      if (r.sexo) d.sexo = r.sexo;
    }
    if (r.nombre) d.nombre = r.nombre;
    const nota = $("#curpNota", c);
    nota.className = r.nombre && !r.nombreVerificado ? "note warn" : "note ok";
    nota.textContent = r.nombre && !r.nombreVerificado
      ? "Datos tomados de la INE. Verifique que el nombre esté correctamente escrito."
      : r.curp ? "Datos tomados de la INE." : "Datos tomados de la INE. Falta ingresar la CURP.";
    pintarCampos();
    $(r.curp ? "#ocupacion" : "#curp", c).focus();
  });

  $("#omitirFirma", c).addEventListener("change", ev => {
    omitir = ev.target.checked;
    if (!omitir) sinFirma = "";
    else if (!sinFirma) sinFirma = (edad(d.fnac, act.fecha) ?? 18) < 18 ? MOTIVOS_SIN_FIRMA[0] : "";
    pintarFirma();
  });
  $("#motivoFirma", c).addEventListener("click", ev => {
    const b = ev.target.closest(".choice");
    if (!b) return;
    sinFirma = b.dataset.v;
    pintarFirma();
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
      ? hallados.map(p => `<button type="button" data-id="${esc(p.id)}"><b>${esc(p.nombre)}</b><small>${esc(p.curp || "Sin CURP")} · ${edad(p.fnac, act.fecha) ?? "?"} años</small></button>`).join("")
      : `<p class="hint">No se encontró ninguna usuaria con ese nombre. Capture sus datos a continuación.</p>`;
    $$("button", res).forEach(b => (b.onclick = () => {
      reconocer(registradas.find(p => p.id === b.dataset.id));
      res.hidden = true;
      buscar.value = "";
    }));
  });

  $$("#deAntes button", c).forEach(b => (b.onclick = () => {
    reconocer(registradas.find(p => p.id === b.dataset.id));
    $$("#deAntes button", c).forEach(x => x.removeAttribute("aria-current"));
    b.setAttribute("aria-current", "true");
    $("#firmar", c).scrollIntoView({ block: "center", behavior: "smooth" });
  }));

  $("#firmar", c).onclick = async () => {
    const nueva = await pedirFirma({ titulo: d.nombre.trim() ? `Firma de ${d.nombre.trim()}` : "Firma de la persona asistente", existente: firma });
    if (nueva) { firma = nueva; omitir = false; sinFirma = ""; pintarFirma(); }
  };

  const guardar = unaVez(async otra => {
    const e = [];
    if (d.curp && !leerCurp(d.curp)) e.push("CURP válida de 18 caracteres (o déjela vacía para capturarla después)");
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
    if (!imagenFirma && omitir && !sinFirma) e.push("Motivo por el que se omite la firma (o capture la firma)");

    // CURP repetida con otra usuaria
    const curp = d.curp;
    const duena = curp && registradas.find(p => p.curp === curp && p.id !== d.usuariaId);
    if (duena && existente) e.push(`Esa CURP ya pertenece a ${duena.nombre} en Usuarias`);
    errores($("#err", c), e, "Falta completar:");
    if (e.length) return;

    const datos = { curp, nombre, fnac: d.fnac, sexo: d.sexo, lugar: d.lugar.trim(), grupo: d.grupo, ocupacion: d.ocupacion.trim(), telefono: tel };
    let usuaria = (d.usuariaId && (await db.uno("usuarias", d.usuariaId))) || (duena && !existente ? duena : null);
    if (usuaria && yaEnLista.has(usuaria.id)) return errores($("#err", c), [kiosko ? "Esta persona ya quedó registrada en esta actividad. Si considera que es un error, avise a la facilitadora." : `${usuaria.nombre} ya está registrada en esta actividad.`]);
    usuaria = { ...(usuaria || { id: db.uid(), creadaPor: yo.id }), ...datos };
    if (!curp) delete usuaria.curp;
    await db.guardar("usuarias", usuaria);

    const orden = existente?.orden ?? (await db.todos("asistencias", "actividadId", actividadId)).reduce((m, x) => Math.max(m, x.orden), 0) + 1;
    await db.guardar("asistencias", {
      ...(existente || { id: db.uid(), actividadId, registradaPor: yo.id }),
      usuariaId: usuaria.id, orden, datos, firma: imagenFirma, sinFirma: imagenFirma ? "" : sinFirma,
    });
    if (curp) await db.completarCurp(usuaria.id, curp);
    if (kiosko) return confirmarKiosko({ yo, pintar, ir, kiosko }, actividadId);
    aviso(existente ? "Cambios guardados" : `${nombre.split(" ")[0]} quedó registrada`);
    if (otra) captura({ yo, pintar, ir }, actividadId); // la ruta no cambia: se abre un formulario en blanco
    else ir(volver);
  });
  $("#guardar", c).onclick = () => guardar(false);
  $("#guardarOtra", c)?.addEventListener("click", () => guardar(true));

  const quitar = $("#quitar", c);
  if (quitar) dobleToque(quitar, "Toque nuevamente para quitarla", async () => {
    await db.borrar("asistencias", existente.id);
    aviso("Usuaria quitada de la lista");
    ir(volver);
  });

  pintarCampos();
  if (!existente) (buscar || $("#curp", c)).focus({ preventScroll: true });
}

/** Pantalla que sigue a un registro del modo captura: no muestra datos y deja el equipo listo para la siguiente persona. */
function confirmarKiosko(ctx, actividadId) {
  const c = ctx.pintar("Registro guardado", `
    <section class="panel stack kiosko-fin">
      <h2 class="h3">Su registro quedó guardado. Gracias.</h2>
      <p class="hint">Entregue el equipo a la siguiente asistente y toque el botón para abrir un formulario en blanco.</p>
      <div class="actions"><button class="btn primary" id="siguiente">Siguiente asistente</button></div>
    </section>`, { kiosko: true });
  $("#siguiente", c).onclick = () => captura(ctx, actividadId);
  $("#siguiente", c).focus({ preventScroll: true });
}
