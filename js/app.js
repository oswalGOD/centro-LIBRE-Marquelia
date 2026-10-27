// Arranque de la app: primer uso, inicio de sesión, menú y rutas.
// Para agregar una función nueva, crea un módulo en js/modulos/ que exporte
// { menu, rutas } y agrégalo a la lista MODULOS de abajo.

import * as db from "./core/db.js";
import { ROLES } from "./core/catalogos.js";
import { crearUsuaria, iniciarSesion, cerrarSesion, sesionActual, verificarPin, pinValido, esCoordinadora } from "./core/auth.js";
import { $, $$, esc, aviso, errores, leerCampos } from "./core/ui.js";
import actividades from "./modulos/actividades.js";
import padron from "./modulos/padron.js";
import estadisticas from "./modulos/estadisticas.js";
import usuarias from "./modulos/usuarias.js";
import ajustes from "./modulos/ajustes.js";

const MODULOS = [actividades, padron, estadisticas, usuarias, ajustes];

const raiz = document.getElementById("app");
let yo = null;

/** Pinta una pantalla dentro del marco de la app (barra superior y menú). */
function pintar(titulo, contenido, { atras, ancho } = {}) {
  const ruta = location.hash || "#/";
  const menu = MODULOS.flatMap(m => m.menu || []).filter(i => !i.soloCoordinadora || esCoordinadora(yo));
  raiz.innerHTML = `
    <header class="topbar">
      <div class="wrap">
        <a class="brand" href="#/"><span class="mark" aria-hidden="true">L</span><span><b>Centro LIBRE</b><small>Marquelia</small></span></a>
        <nav class="menu" aria-label="Secciones">
          ${menu.map(i => `<a href="${i.href}" ${i.activa.test(ruta) ? 'aria-current="page"' : ""}>${esc(i.texto)}</a>`).join("")}
        </nav>
        <div class="who"><span class="avatar" aria-hidden="true">${esc(yo.nombre[0] || "?")}</span><span><b>${esc(yo.nombre.split(" ")[0])}</b><small>${esc(yo.rol)}</small></span>
          <button class="btn small ghost" id="salir">Salir</button></div>
      </div>
    </header>
    <main class="wrap ${ancho ? "wide" : ""}">
      <div class="page-head">
        ${atras ? `<a class="back" href="${atras}">← Volver</a>` : ""}
        <h1>${esc(titulo)}</h1>
      </div>
      <div id="contenido" class="stack">${contenido}</div>
    </main>`;
  $("#salir").onclick = () => { cerrarSesion(); location.hash = "#/"; router(); };
  window.scrollTo({ top: 0 });
  return $("#contenido");
}

const contexto = () => ({ yo, pintar, ir: h => (location.hash = h), recargar: router });

async function router() {
  try {
    const lista = await db.todos("usuarias");
    if (!lista.length) return primerUso();
    yo = await sesionActual();
    if (!yo) return entrar(lista.filter(u => u.activa));
    const ruta = location.hash || "#/";
    for (const m of MODULOS) {
      for (const [patron, vista, opciones] of m.rutas) {
        const r = ruta.match(patron);
        if (!r) continue;
        if (opciones?.soloCoordinadora && !esCoordinadora(yo)) break;
        return await vista(contexto(), ...r.slice(1).map(v => v && decodeURIComponent(v)));
      }
    }
    location.hash = "#/";
  } catch (e) {
    console.error(e);
    raiz.innerHTML = `<main class="wrap"><div class="issues" role="alert"><b>Algo falló al abrir esta pantalla.</b><p>${esc(e.message)}</p><a class="btn" href="#/">Ir al inicio</a></div></main>`;
  }
}

/* ---------- Primer uso: crear a la Coordinadora ---------- */
function primerUso() {
  raiz.innerHTML = `
  <main class="auth">
    <div class="auth-card stack">
      <div class="auth-brand"><span class="mark" aria-hidden="true">L</span><div><h1>Centro LIBRE Marquelia</h1><p class="hint">Listas de asistencia</p></div></div>
      <h2>Configura este dispositivo</h2>
      <p class="hint">Crea la cuenta de la Coordinadora. Después ella podrá dar de alta a la Psicóloga y a la Abogada.</p>
      <div class="grid" id="f">
        <div class="field span-2"><label for="c-nombre">Nombre completo de la Coordinadora</label><input id="c-nombre" data-campo="nombre" autocomplete="name"></div>
        <div class="field"><label for="c-pin">PIN de 4 a 6 números</label><input id="c-pin" data-campo="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="field"><label for="c-pin2">Repite el PIN</label><input id="c-pin2" data-campo="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
        <div class="field"><label for="c-prefijo">Prefijo de folio</label><input id="c-prefijo" data-campo="prefijo" class="upper" value="MAR" maxlength="5"></div>
        <div class="field"><label for="c-codigo">Letra de este dispositivo</label><input id="c-codigo" data-campo="codigo" class="upper" value="A" maxlength="1"><span class="note">Usa otra letra en cada tableta o computadora (A, B, C…) para que los folios nunca se repitan.</span></div>
      </div>
      <div id="err"></div>
      <div class="actions"><button class="btn primary" id="crear">Crear cuenta y empezar</button></div>
      <details class="restore"><summary>¿Ya tienes un respaldo de otro dispositivo?</summary>
        <p class="hint">Elige el archivo de respaldo (.json) para cargar usuarias, padrón y actividades.</p>
        <input type="file" id="archivo" accept="application/json,.json">
      </details>
    </div>
  </main>`;
  $("#crear").onclick = async () => {
    const d = leerCampos($("#f"));
    const e = [];
    if (d.nombre.split(" ").filter(Boolean).length < 2) e.push("Escribe nombre y apellido.");
    if (!pinValido(d.pin)) e.push("El PIN debe tener de 4 a 6 números.");
    else if (d.pin !== d.pin2) e.push("Los dos PIN no coinciden.");
    if (!/^[A-Z]{2,5}$/i.test(d.prefijo)) e.push("El prefijo de folio debe tener de 2 a 5 letras.");
    if (!/^[A-Z]$/i.test(d.codigo)) e.push("La letra del dispositivo debe ser una sola letra.");
    errores($("#err"), e);
    if (e.length) return;
    await db.escribirMeta("prefijoFolio", d.prefijo.toUpperCase());
    await db.escribirMeta("codigoDispositivo", d.codigo.toUpperCase());
    const u = await crearUsuaria({ nombre: d.nombre, rol: "Coordinadora", pin: d.pin });
    iniciarSesion(u);
    aviso("Cuenta creada");
    location.hash = "#/";
    router();
  };
  $("#archivo").onchange = async ev => {
    try {
      await db.importar(JSON.parse(await ev.target.files[0].text()));
      aviso("Respaldo cargado. Entra con tu PIN.");
      router();
    } catch (e) {
      errores($("#err"), [e.message || "No se pudo leer el archivo."]);
    }
  };
}

/* ---------- Inicio de sesión ---------- */
let intentosFallidos = 0, bloqueoHasta = 0;

function entrar(lista) {
  lista.sort((a, b) => ROLES.indexOf(a.rol) - ROLES.indexOf(b.rol) || a.nombre.localeCompare(b.nombre));
  raiz.innerHTML = `
  <main class="auth">
    <div class="auth-card stack">
      <div class="auth-brand"><span class="mark" aria-hidden="true">L</span><div><h1>Centro LIBRE Marquelia</h1><p class="hint">Listas de asistencia</p></div></div>
      <h2>¿Quién va a capturar?</h2>
      <div class="people">${lista.map(u => `<button class="person-btn" data-id="${u.id}"><span class="avatar">${esc(u.nombre[0])}</span><span><b>${esc(u.nombre)}</b><small>${esc(u.rol)}</small></span></button>`).join("")}</div>
      <form id="pinForm" class="stack" hidden>
        <div class="field"><label for="pin" id="pinLabel">PIN</label><input id="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password"></div>
        <div id="err"></div>
        <div class="actions"><button class="btn primary" type="submit">Entrar</button></div>
      </form>
    </div>
  </main>`;
  let elegida = null;
  $$(".person-btn").forEach(b => (b.onclick = () => {
    elegida = lista.find(u => u.id === b.dataset.id);
    $$(".person-btn").forEach(x => x.setAttribute("aria-pressed", x === b));
    $("#pinForm").hidden = false;
    $("#pinLabel").textContent = `PIN de ${elegida.nombre.split(" ")[0]}`;
    $("#pin").value = "";
    $("#pin").focus();
  }));
  if (lista.length === 1) $(".person-btn").click();
  $("#pinForm").onsubmit = async ev => {
    ev.preventDefault();
    if (Date.now() < bloqueoHasta) return errores($("#err"), [`Demasiados intentos. Espera ${Math.ceil((bloqueoHasta - Date.now()) / 1000)} segundos.`]);
    if (await verificarPin(elegida, $("#pin").value)) {
      intentosFallidos = 0;
      iniciarSesion(elegida);
      router();
    } else {
      intentosFallidos++;
      if (intentosFallidos >= 5) { bloqueoHasta = Date.now() + 30000; intentosFallidos = 0; }
      errores($("#err"), ["PIN incorrecto."]);
      $("#pin").select();
    }
  };
}

window.addEventListener("hashchange", router);
navigator.storage?.persist?.();
router();
