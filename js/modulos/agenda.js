// Agenda de actividades: calendario común de las actividades de todos los perfiles.
// Cada perfil consulta qué se realizó y puede obtener su propia copia (con las mismas asistentes y firmas),
// que queda a su nombre como facilitadora y suma a las estadísticas globales. No muestra nombres de asistentes.

import * as db from "../core/db.js";
import { fechaLarga, mesCorto, normalizar } from "../core/catalogos.js";
import { puedeVer, puedeObtenerCopia, esDeAgenda } from "../core/permisos.js";
import { crearCopia, idCopiaAgenda, tiposDisponibles } from "../core/copias.js";
import { esProximo, estadoDe, cuandoEs, ordenarCursos } from "../core/cursos.js";
import { botonFiltros, conectarFiltros, paginar } from "../core/componentes.js";
import { tarjetas } from "../core/resumen.js";
import { $, $$, esc, aviso, plural, unaVez } from "../core/ui.js";

const OTRO = "__otro";
const filtros = { mes: "", tipo: "", facilitadoraId: "" };

async function agenda({ yo, pintar, ir }) {
  const todas = await db.todos("actividades");
  const acts = ordenarCursos(todas.filter(a => esDeAgenda(a) && !a.cancelado));
  const asis = await db.todos("asistencias");
  const cuenta = id => asis.filter(x => x.actividadId === id).length;
  const copiaDe = a => todas.find(x => x.id === idCopiaAgenda(a.id, yo.id) || (x.compartidas?.[0]?.origenId === a.id && (x.creadaPor === yo.id || x.facilitadoraId === yo.id)));
  const tipos = await tiposDisponibles();

  const propias = acts.filter(a => puedeVer(yo, a)).length;
  const conCopia = acts.filter(a => !puedeVer(yo, a) && copiaDe(a)).length;
  const porCopiar = acts.filter(a => puedeObtenerCopia(yo, a) && !copiaDe(a)).length;
  const opciones = (lista, actual) => lista.map(([v, t]) => `<option value="${esc(v)}" ${v === actual ? "selected" : ""}>${esc(t)}</option>`).join("");
  const meses = [...new Set(acts.map(a => a.fecha.slice(0, 7)))].map(m => [m, `${mesCorto(m + "-01")} ${m.slice(0, 4)}`]);
  const tiposUsados = [...new Set(acts.map(a => a.tipo))].sort((x, y) => x.localeCompare(y, "es")).map(t => [t, t]);
  const facilitadoras = [...new Map(acts.map(a => [a.facilitadoraId, a.facilitadora]))].sort((x, y) => x[1].localeCompare(y[1], "es"));
  const proxima = acts.find(a => esProximo(a));
  const muchas = acts.length > 6;

  const tarjeta = (a, i) => {
    const mia = puedeVer(yo, a), copia = !mia && copiaDe(a), puede = puedeObtenerCopia(yo, a) && !copia;
    const estado = estadoDe(a);
    const chip = mia ? `<span class="chip ok">Suya</span>` : copia ? `<span class="chip ok">Ya tiene su copia</span>` : estado === "programada" ? `<span class="chip prog">Programada</span>` : "";
    return `<section class="panel stack" data-buscar="${esc(normalizar(`${a.nombre} ${a.folio} ${a.lugar} ${a.tipo} ${a.facilitadora}`))}" data-mes="${a.fecha.slice(0, 7)}" data-tipo="${esc(a.tipo)}" data-facilitadora-id="${esc(a.facilitadoraId)}">
      <div class="row"><span class="date"><b>${Number(a.fecha.slice(8, 10))}</b><small>${mesCorto(a.fecha)}</small></span>
        <span class="body"><span class="name">${esc(a.nombre)}</span>
          <span class="meta"><span>${esc(a.tipo)}</span>${a.horaInicio ? `<span>${esc(a.horaInicio)}</span>` : ""}<span>${esc(a.lugar)}</span><span>${esc(a.facilitadora)}</span></span></span>
        <span class="end"><span class="big">${cuenta(a.id)}</span><small>asistentes</small>${chip}</span></div>
      ${mia ? `<div class="actions-bar"><a class="btn" href="#/actividad/${esc(a.id)}">Abrir</a></div>`
        : copia ? `<div class="actions-bar"><a class="btn" href="#/actividad/${esc(copia.id)}">Abrir su copia (${esc(copia.folio)})</a></div>`
        : puede ? `<details><summary class="btn primary">Obtener mi copia</summary>
          <div class="stack" style="margin-top:.75rem">
            <p class="hint">Se crea su propia copia, con las mismas asistentes y sus firmas, sin fotografías y con su propio folio. Usted figura como facilitadora. Cambiar el nombre es opcional; confirme o cambie el tipo de actividad.</p>
            <div class="field"><label for="g-nombre-${i}">Nombre de su actividad</label><input id="g-nombre-${i}" value="${esc(a.nombre)}" maxlength="150"></div>
            <div class="field"><label for="g-tipo-${i}">Tipo de actividad</label>
              <select id="g-tipo-${i}">${[...new Set([...tipos, a.tipo])].map(t => `<option ${t === a.tipo ? "selected" : ""}>${esc(t)}</option>`).join("")}<option value="${OTRO}">Otro tipo…</option></select>
              <input id="g-otro-${i}" aria-label="Ingrese el tipo de actividad" placeholder="Ingrese el tipo de actividad" autocomplete="off" hidden></div>
            <div class="actions-bar"><button type="button" class="btn primary" data-copiar="${i}">Obtener copia</button></div>
          </div></details>`
        : `<p class="hint">${estado === "programada" ? "Podrá obtener la copia cuando la actividad se realice." : ""}</p>`}
    </section>`;
  };

  const c = pintar("Agenda de actividades", `
    ${tarjetas([[acts.length, "Actividades", "ok"], [propias, "Suyas"], [conCopia, "Con su copia"], [porCopiar, "Por copiar", "gold"]], { etiqueta: "Resumen de la agenda" })}
    <div class="toolbar">
      ${muchas ? `<input type="search" id="buscar" class="search" placeholder="Buscar por nombre, folio, lugar o facilitadora" aria-label="Buscar actividad">${botonFiltros()}` : ""}
      <p class="hint" id="cuenta">${plural(acts.length, "actividad", "actividades")} de todos los perfiles. Aquí puede obtener su propia copia de cualquiera de ellas.</p>
    </div>
    ${proxima ? `<div class="aviso-proximo" role="status"><b>Próxima actividad ${esc(cuandoEs(proxima.fecha))}:</b> ${esc(proxima.nombre)}, ${esc(fechaLarga(proxima.fecha))}${proxima.horaInicio ? ` a las ${esc(proxima.horaInicio)}` : ""}, con ${esc(proxima.facilitadora)}.</div>` : ""}
    ${muchas ? `<div class="filters" id="filtros" hidden>
      <div class="field"><label for="f-mes">Mes</label><select id="f-mes" data-filtro="mes"><option value="">Todos</option>${opciones(meses, filtros.mes)}</select></div>
      <div class="field"><label for="f-tipo">Tipo</label><select id="f-tipo" data-filtro="tipo"><option value="">Todos</option>${opciones(tiposUsados, filtros.tipo)}</select></div>
      <div class="field"><label for="f-fac">Facilitadora</label><select id="f-fac" data-filtro="facilitadoraId"><option value="">Todas</option>${opciones(facilitadoras, filtros.facilitadoraId)}</select></div>
    </div>` : ""}
    ${acts.length ? `<div class="stack" id="lista">${acts.map(tarjeta).join("")}</div><div class="empty" id="sinResultados" hidden><b>Ninguna actividad coincide.</b><p>Modifique la búsqueda o los filtros.</p></div>`
      : `<div class="empty"><b>Aún no hay actividades en la agenda.</b><p>Cuando los perfiles registren o programen actividades, aparecerán aquí.</p></div>`}
  `, { atras: "#/asistencia" });

  const buscar = $("#buscar", c);
  const panel = conectarFiltros(c);
  function filtrar() {
    const q = normalizar(buscar?.value || "");
    let n = 0;
    $$("#lista > section", c).forEach(r => {
      r.hidden = !r.dataset.buscar.includes(q) || Object.entries(filtros).some(([k, v]) => v && r.dataset[k] !== v);
      if (!r.hidden) n++;
    });
    if ($("#sinResultados", c)) $("#sinResultados", c).hidden = n > 0 || !acts.length;
    panel?.contar(Object.values(filtros).filter(Boolean).length);
    pag?.refrescar();
  }
  const pag = paginar($("#lista", c), { selector: ":scope > section", singular: "actividad", plural: "actividades" });
  buscar?.addEventListener("input", filtrar);
  for (const k in filtros) filtros[k] = $(`[data-filtro=${k}]`, c)?.value || "";
  $$("[data-filtro]", c).forEach(el => el.addEventListener("change", () => { filtros[el.dataset.filtro] = el.value; filtrar(); }));
  if (muchas && Object.values(filtros).some(Boolean)) { $("#filtros", c).hidden = false; $("#verFiltros", c)?.setAttribute("aria-expanded", "true"); }
  filtrar();

  $$("[data-copiar]", c).forEach(b => {
    const i = b.dataset.copiar, a = acts[i];
    const tipo = $(`#g-tipo-${i}`, c), otro = $(`#g-otro-${i}`, c);
    tipo.addEventListener("change", () => { otro.hidden = tipo.value !== OTRO; if (!otro.hidden) otro.focus(); });
    b.onclick = unaVez(async () => {
      const nombre = $(`#g-nombre-${i}`, c).value.trim().replace(/\s+/g, " ");
      const tipoElegido = tipo.value === OTRO ? otro.value.trim().replace(/\s+/g, " ") : tipo.value;
      if (!nombre) return aviso("Ingrese el nombre de la actividad.");
      if (!tipoElegido) return aviso("Ingrese el tipo de actividad.");
      const origen = await db.uno("actividades", a.id);
      const copia = await crearCopia(yo, origen, idCopiaAgenda(origen.id, yo.id), nombre, tipoElegido, { de: origen.facilitadoraId, deNombre: origen.facilitadora, en: Date.now(), via: "agenda" });
      aviso(`Copia creada con folio ${copia.folio}`);
      ir(`#/actividad/${copia.id}`);
    });
  });
}

export default {
  menu: [],
  rutas: [[/^#\/agenda$/, agenda]],
};
