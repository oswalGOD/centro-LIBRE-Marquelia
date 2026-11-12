// Panel del desarrollador (panel.html).
//
// Página aparte de la app, solo con internet. Se entra con una cuenta de Supabase que esté en la lista
// `cuentas_desarrollo` (supabase/panel-desarrollo.sql). Esa cuenta solo puede leer el estado técnico
// que reportan las tabletas y conteos de la nube; Supabase le niega los datos del Centro (usuarias,
// firmas, perfiles, actividades). La sesión se guarda solo en esta pestaña y se cierra al cerrarla.

import { SUPABASE_URL, SUPABASE_ANON } from "./core/config.js";
import { $, $$, esc, errores, dobleToque, plural } from "./core/ui.js";

const raiz = $("#app");
const CLAVE_SESION = "clm-panel-sesion";
const LIMITE_GRATIS_MB = 500; // base de datos del plan gratuito de Supabase
const DESFASE_TOLERADO = 5 * 60 * 1000;
const DIA = 24 * 60 * 60 * 1000;
const REPO = "oswalgod/centro-libre-marquelia";
const NOMBRES = { perfiles: "Perfiles", usuarias: "Usuarias", actividades: "Actividades", asistencias: "Asistencias", evidencias: "Evidencias fotográficas" };

/* ---------- Sesión ---------- */
const leerSesion = () => { try { return JSON.parse(sessionStorage.getItem(CLAVE_SESION)); } catch { return null; } };
const guardarSesion = s => { try { s ? sessionStorage.setItem(CLAVE_SESION, JSON.stringify(s)) : sessionStorage.removeItem(CLAVE_SESION); } catch {} };

async function leerJson(r) {
  const t = await r.text().catch(() => "");
  try { return t ? JSON.parse(t) : null; } catch { return null; }
}

async function pedirToken(cuerpo, tipo) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${tipo}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const j = (await leerJson(r)) || {};
  if (!r.ok) {
    if (r.status === 400 && tipo === "password") throw new Error("Correo o contraseña incorrectos.");
    throw Object.assign(new Error(j.error_description || j.msg || `El servidor respondió ${r.status}.`), { status: r.status });
  }
  const s = { cuenta: j.user?.email || cuerpo.email, acceso: j.access_token, renovar: j.refresh_token, expira: Date.now() + j.expires_in * 1000 };
  guardarSesion(s);
  return s;
}

async function token() {
  let s = leerSesion();
  if (!s) throw Object.assign(new Error("Inicie sesión."), { sinSesion: true });
  if (s.expira - 60000 < Date.now()) {
    try { s = await pedirToken({ refresh_token: s.renovar }, "refresh_token"); }
    catch (e) { guardarSesion(null); throw Object.assign(new Error("La sesión ha caducado. Vuelva a ingresar."), { sinSesion: true }); }
  }
  return s.acceso;
}

async function rpc(nombre, args = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const j = await leerJson(r);
  if (!r.ok) {
    if (j?.code === "42501") throw Object.assign(new Error("Esta cuenta no corresponde a desarrollo. Ingrese con su cuenta de desarrollador, no con la del Centro."), { sinPermiso: true });
    if (j?.code === "PGRST202" || r.status === 404) throw new Error("Falta ejecutar supabase/panel-desarrollo.sql en Supabase.");
    throw new Error(j?.message || `El servidor respondió ${r.status}.`);
  }
  return j;
}

async function salir() {
  const s = leerSesion();
  guardarSesion(null);
  if (s?.acceso) await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method: "POST", headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${s.acceso}` } }).catch(() => {});
  entrar();
}

/* ---------- Formato ---------- */
const fecha = t => (t ? new Date(t).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—");
function hace(t) {
  if (!t) return "nunca";
  const min = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  if (min < 48 * 60) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} días`;
}
const mb = bytes => (bytes / 1048576).toFixed(1);
function reloj(ms) {
  const min = Math.round(Math.abs(ms) / 60000);
  if (Math.abs(ms) < DESFASE_TOLERADO) return "Bien";
  const cuanto = min >= 2880 ? `${Math.round(min / 1440)} días` : min >= 120 ? `${Math.round(min / 60)} h` : `${min} min`;
  return `${ms > 0 ? "Adelantado" : "Atrasado"} ${cuanto}`;
}
function equipo(ua = "") {
  const so = /iPad/.test(ua) ? "iPad" : /iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Otro";
  const nav = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "otro navegador";
  return `${so} · ${nav}`;
}
const chip = (texto, tipo = "") => `<span class="chip ${tipo}">${esc(texto)}</span>`;
const medidor = (pct, aviso) => `<div class="meter ${aviso ? "warn" : ""}" role="img" aria-label="${Math.round(pct)} %"><span style="--w:${Math.min(100, Math.max(1, pct)).toFixed(1)}%"></span></div>`;

/* ---------- Pantalla de entrada ---------- */
function entrar(mensaje = "") {
  raiz.innerHTML = `
  <main class="auth">
    <form class="auth-card stack" id="f" novalidate>
      <div class="auth-brand"><img class="mark" src="icons/icon-192.png" alt="" aria-hidden="true"><div><h1>Panel del desarrollador</h1><p class="hint">Centro LIBRE Marquelia</p></div></div>
      <p class="hint">Ingrese con su cuenta de desarrollo de Supabase (no con la del Centro). Este panel solo muestra datos técnicos de las tabletas; no otorga acceso a usuarias, firmas ni perfiles.</p>
      <div class="grid">
        <div class="field span-2"><label for="correo">Correo</label><input id="correo" type="email" autocomplete="username" required></div>
        <div class="field span-2"><label for="clave">Contraseña</label><input id="clave" type="password" autocomplete="current-password" required></div>
      </div>
      <div id="err"></div>
      <div class="actions"><button class="btn primary" id="entrar">Ingresar</button></div>
    </form>
  </main>`;
  if (mensaje) errores($("#err"), [mensaje], "No fue posible abrir el panel.");
  $("#f").onsubmit = async ev => {
    ev.preventDefault();
    const correo = $("#correo").value.trim(), clave = $("#clave").value;
    if (!correo || !clave) return errores($("#err"), ["Ingrese el correo y la contraseña."]);
    const b = $("#entrar");
    b.disabled = true; b.textContent = "Ingresando…";
    try {
      await pedirToken({ email: correo, password: clave }, "password");
      await panel();
    } catch (e) {
      b.disabled = false; b.textContent = "Ingresar";
      errores($("#err"), [e.message], "No fue posible ingresar.");
    }
  };
  $("#correo").focus();
}

/* ---------- Datos externos ---------- */
async function versionPublicada() {
  try {
    const t = await (await fetch("sw.js", { cache: "no-store" })).text();
    return /const VERSION = "clm-v([^"]+)"/.exec(t)?.[1] || null;
  } catch { return null; }
}

async function tareaMantener() {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/mantener-supabase.yml/runs?per_page=1`, { headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return null;
    const run = (await r.json()).workflow_runs?.[0];
    return run ? { estado: run.status, resultado: run.conclusion, hora: run.run_started_at || run.created_at, url: run.html_url } : { nunca: true };
  } catch { return null; }
}

/* ---------- Revisión de cada tableta ---------- */
function problemas(d, ultima) {
  const e = d.estado || {};
  const lista = [];
  if (ultima && e.version && e.version !== ultima) lista.push(["Versión vieja", "warn"]);
  const sinReportar = Date.now() - new Date(d.reportado).getTime();
  if (sinReportar > 3 * DIA) lista.push([`Sin reportar ${hace(d.reportado).replace("hace ", "")}`, "warn"]);
  if (e.pendientes > 0 && (!e.ultimaSincronizacion || Date.now() - e.ultimaSincronizacion > DIA)) lista.push([plural(e.pendientes, "cambio sin enviar", "cambios sin enviar"), "warn"]);
  if (Math.abs(e.desfaseMs || 0) >= DESFASE_TOLERADO) lista.push(["Reloj desfasado", "warn"]);
  if (e.error) lista.push(["Error al sincronizar", "warn"]);
  if (e.cuotaMB && e.almacenamientoMB / e.cuotaMB > 0.8) lista.push(["Poco espacio", "warn"]);
  return lista;
}

function tarjetaTableta(d, ultima, nube) {
  const e = d.estado || {};
  const prob = problemas(d, ultima);
  const locales = e.registrosLocales || {};
  const enNube = nube.conteos || {};
  const filas = Object.keys(NOMBRES).map(a => {
    const local = locales[a] ?? null;
    const remoto = enNube[a] ? enNube[a].vigentes + enNube[a].borrados : 0;
    const dif = local !== null && local !== remoto;
    return `<tr><th scope="row">${NOMBRES[a]}</th><td class="num">${local ?? "—"}</td><td class="num">${remoto}</td><td>${dif ? chip(local < remoto ? `Le faltan ${remoto - local}` : `${local - remoto} más que la nube`, "warn") : chip("Igual", "ok")}</td></tr>`;
  }).join("");
  const cambios = nube.por_dispositivo?.[d.dispositivo];
  const errs = e.errores || [];
  const uso = e.cuotaMB ? (e.almacenamientoMB / e.cuotaMB) * 100 : 0;
  return `
  <article class="panel tablet" data-disp="${esc(d.dispositivo)}">
    <div class="tablet-head">
      <h3>Tableta ${esc(d.id_corto || "?")} <small class="hint mono">${esc(d.dispositivo.slice(0, 8))}</small></h3>
      <div class="chips">${prob.length ? prob.map(([t, c]) => chip(t, c)).join("") : chip("Todo bien", "ok")}</div>
    </div>
    <dl class="facts">
      <div><dt>Versión</dt><dd>${esc(e.version || "?")}${e.instalada ? " · instalada" : " · en navegador"}</dd></div>
      <div><dt>Último reporte</dt><dd title="${esc(fecha(d.reportado))}">${hace(d.reportado)}</dd></div>
      <div><dt>Última sincronización</dt><dd title="${esc(fecha(e.ultimaSincronizacion))}">${hace(e.ultimaSincronizacion)}</dd></div>
      <div><dt>Cambios por enviar</dt><dd>${e.pendientes ?? "?"}</dd></div>
      <div><dt>Reloj</dt><dd>${reloj(e.desfaseMs || 0)}</dd></div>
      <div><dt>Equipo</dt><dd>${esc(equipo(e.navegador))}</dd></div>
      <div><dt>Pantalla</dt><dd class="mono">${esc(e.pantalla || "?")}</dd></div>
      <div><dt>Cambios enviados a la nube</dt><dd>${cambios ? `${cambios.cambios} · último ${hace(cambios.ultimo)}` : "—"}</dd></div>
      <div><dt>Espacio en el equipo</dt><dd>${e.almacenamientoMB ?? "?"} MB de ${e.cuotaMB ?? "?"} MB ${e.persistente ? chip("Protegido", "ok") : chip("Sin proteger")}</dd>${e.cuotaMB ? medidor(uso, uso > 80) : ""}</div>
    </dl>
    ${e.error ? `<div class="issues"><b>Último error al sincronizar</b><p>${esc(e.error)}</p></div>` : ""}
    <details class="dev">
      <summary>Registros: tableta frente a la nube</summary>
      <div class="table-scroll"><table class="data"><thead><tr><th>Tipo</th><th class="num">En la tableta</th><th class="num">En la nube</th><th>Estado</th></tr></thead><tbody>${filas}</tbody></table></div>
      <p class="hint">Cuenta también los borrados. Una diferencia pequeña mientras hay cambios por enviar o recibir es normal.</p>
    </details>
    <details class="dev">
      <summary>${errs.length ? `Errores recientes (${errs.length})` : "Sin errores recientes"}</summary>
      ${errs.length ? listaErrores(errs) : `<p class="hint">Esta tableta no ha registrado errores.</p>`}
    </details>
    <div class="actions"><button class="btn small ghost" data-olvidar="${esc(d.dispositivo)}">Quitar del panel</button></div>
  </article>`;
}

const listaErrores = (lista, conTableta = false) => `<ul class="dev-errors">${lista.map(x => `
  <li><span>${esc(x.mensaje)}</span><span class="meta">${conTableta ? `<b>Tableta ${esc(x.tableta)}</b>` : ""}<span>${fecha(x.hora)}</span>${x.lugar ? `<span class="mono">${esc(x.lugar)}</span>` : ""}${x.ruta ? `<span class="mono">${esc(x.ruta)}</span>` : ""}</span></li>`).join("")}</ul>`;

/* ---------- Panel ---------- */
async function panel() {
  const s = leerSesion();
  if (!s) return entrar();
  raiz.innerHTML = `<main class="auth"><p class="hint">Consultando Supabase…</p></main>`;
  const inicio = performance.now();
  let nube;
  try {
    nube = await rpc("resumen_panel");
  } catch (e) {
    if (e.sinSesion || e.sinPermiso) { if (e.sinPermiso) await salir(); return entrar(e.message); }
    raiz.innerHTML = `<main class="wrap"><div class="issues" role="alert"><b>No fue posible consultar Supabase.</b><p>${esc(e.message)}</p><p>Si indica que no hay conexión o tarda demasiado, es posible que el proyecto esté en pausa: reactívelo en supabase.com.</p><button class="btn" id="otra">Reintentar</button> <button class="btn ghost" id="salir">Salir</button></div></main>`;
    $("#otra").onclick = panel;
    $("#salir").onclick = salir;
    return;
  }
  const latencia = Math.round(performance.now() - inicio);
  const [ultima, tarea] = await Promise.all([versionPublicada(), tareaMantener()]);

  const disp = nube.dispositivos || [];
  const conProblemas = disp.filter(d => problemas(d, ultima).length).length;
  const usoBase = (nube.base_bytes / 1048576 / LIMITE_GRATIS_MB) * 100;
  const conteos = nube.conteos || {};
  const vigentes = Object.values(conteos).reduce((n, c) => n + c.vigentes, 0);
  const ultimoCambio = Object.values(conteos).map(c => c.ultimo).sort().pop();
  const desfasePanel = Date.now() - new Date(nube.hora_servidor).getTime() - latencia / 2;
  const reportan = new Set(disp.map(d => d.dispositivo));
  const callados = Object.entries(nube.por_dispositivo || {}).filter(([id]) => !reportan.has(id));
  const todosErrores = disp.flatMap(d => (d.estado?.errores || []).map(x => ({ ...x, tableta: d.id_corto || "?" })))
    .sort((a, b) => String(b.hora).localeCompare(String(a.hora))).slice(0, 40);

  const tareaTexto = !tarea ? `<dd>No fue posible consultar GitHub · <a href="https://github.com/${REPO}/actions/workflows/mantener-supabase.yml" target="_blank" rel="noopener">ver en GitHub</a></dd>`
    : tarea.nunca ? `<dd>${chip("No ha corrido", "warn")}</dd>`
    : `<dd>${tarea.estado !== "completed" ? chip("Corriendo") : tarea.resultado === "success" ? chip("Bien", "ok") : chip("Falló", "warn")} ${hace(tarea.hora)} · <a href="${esc(tarea.url)}" target="_blank" rel="noopener">detalle</a></dd>`;

  raiz.innerHTML = `
  <main class="wrap wide">
    <div class="stack">
      <div class="dev-head">
        <div class="auth-brand"><img class="mark" src="icons/icon-192.png" alt="" aria-hidden="true"><div><h1>Panel del desarrollador</h1><p class="hint">Centro LIBRE Marquelia · ${esc(s.cuenta)}</p></div></div>
        <div class="actions"><button class="btn" id="recargar">Actualizar</button><button class="btn ghost" id="salir">Salir</button></div>
      </div>
      <p class="hint">Actualizado ${fecha(Date.now())}. Las tabletas reportan al sincronizar (como mucho cada 30 minutos, o antes si hay un error nuevo). Versión publicada: <b>${esc(ultima || "?")}</b>.</p>

      <div class="tiles">
        <div class="tile"><span class="label">Tabletas</span><span class="value">${disp.length}</span><span class="sub">${callados.length ? `${callados.length} más sin reportar` : "todas reportan"}</span></div>
        <div class="tile ${conProblemas ? "warn" : ""}"><span class="label">Con observaciones</span><span class="value">${conProblemas}</span><span class="sub">de ${disp.length}</span></div>
        <div class="tile ${usoBase > 80 ? "warn" : ""}"><span class="label">Base de datos</span><span class="value">${mb(nube.base_bytes)} MB</span><span class="sub">de ${LIMITE_GRATIS_MB} MB del plan gratis</span></div>
        <div class="tile"><span class="label">Registros en la nube</span><span class="value">${vigentes}</span><span class="sub">último cambio ${hace(ultimoCambio)}</span></div>
      </div>

      <section class="panel stack">
        <h2 class="h3">Salud de Supabase</h2>
        <dl class="facts">
          <div><dt>Responde</dt><dd>${chip("Sí", "ok")} en ${latencia} ms</dd></div>
          <div><dt>Espacio de la base</dt><dd>${mb(nube.base_bytes)} MB (${usoBase.toFixed(1)} %)</dd>${medidor(usoBase, usoBase > 80)}</div>
          <div><dt>Tabla de registros</dt><dd>${mb(nube.registros_bytes)} MB</dd></div>
          <div><dt>Tarea «Mantener activo»</dt>${tareaTexto}</div>
          <div><dt>Reloj de esta computadora</dt><dd>${reloj(desfasePanel)}</dd></div>
        </dl>
        <div class="table-scroll"><table class="data">
          <thead><tr><th>Tipo</th><th class="num">Vigentes</th><th class="num">Borrados</th><th>Último cambio</th></tr></thead>
          <tbody>${Object.keys(NOMBRES).map(a => `<tr><th scope="row">${NOMBRES[a]}</th><td class="num">${conteos[a]?.vigentes ?? 0}</td><td class="num">${conteos[a]?.borrados ?? 0}</td><td>${conteos[a] ? hace(conteos[a].ultimo) : "—"}</td></tr>`).join("")}</tbody>
        </table></div>
        <p class="hint">Solo números: este panel no puede leer el contenido de los registros.</p>
      </section>

      <section class="stack">
        <h2>Tabletas</h2>
        ${disp.length ? disp.map(d => tarjetaTableta(d, ultima, nube)).join("") : `<p class="panel hint">Aún ninguna tableta ha enviado reportes. Reportan al sincronizar, una vez que tienen la versión 0.14 o posterior.</p>`}
        ${callados.length ? `<section class="panel stack"><h3>Dispositivos que envían datos pero no reportan</h3>
          <p class="hint">Probablemente tienen una versión anterior a la 0.14. Se resuelve al actualizar la aplicación en ese equipo.</p>
          <div class="table-scroll"><table class="data"><thead><tr><th>Dispositivo</th><th class="num">Cambios enviados</th><th>Último cambio</th></tr></thead>
          <tbody>${callados.map(([id, c]) => `<tr><th scope="row" class="mono">${esc(id.slice(0, 8))}</th><td class="num">${c.cambios}</td><td>${hace(c.ultimo)}</td></tr>`).join("")}</tbody></table></div></section>` : ""}
      </section>

      <section class="panel stack">
        <h2 class="h3">Errores recientes de todas las tabletas</h2>
        ${todosErrores.length ? listaErrores(todosErrores, true) : `<p class="hint">Ninguna tableta ha registrado errores.</p>`}
      </section>
    </div>
  </main>`;

  $("#recargar").onclick = panel;
  $("#salir").onclick = salir;
  $$("[data-olvidar]").forEach(b => dobleToque(b, "Toque nuevamente para quitarla", async () => {
    try { await rpc("olvidar_dispositivo", { p_dispositivo: b.dataset.olvidar }); } catch (e) { alertaEn(b, e.message); return; }
    panel();
  }));
}

function alertaEn(boton, mensaje) {
  const p = document.createElement("p");
  p.className = "issues";
  p.textContent = mensaje;
  boton.closest(".actions").after(p);
  boton.disabled = false;
}

leerSesion() ? panel() : entrar();
