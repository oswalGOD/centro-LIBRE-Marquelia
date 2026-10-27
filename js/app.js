// Arranque de la app: primer uso, inicio de sesión, menú y rutas.
// Para agregar una función nueva, crea un módulo en js/modulos/ que exporte
// { menu, rutas } y agrégalo a la lista MODULOS de abajo.

import { anotar } from "./core/bitacora.js";
import * as db from "./core/db.js";
import { ROLES } from "./core/catalogos.js";
import { crearPerfil, iniciarSesion, cerrarSesion, sesionActual, sesionVigente, tocarSesion, verificarPin, pinValido, esCoordinadora, esperaPin, pinFallido, pinCorrecto } from "./core/auth.js";
import { $, $$, esc, aviso, errores, leerCampos } from "./core/ui.js";
import * as nube from "./core/sync.js";
import actividades from "./modulos/actividades.js";
import usuarias from "./modulos/usuarias.js";
import estadisticas from "./modulos/estadisticas.js";
import perfiles from "./modulos/perfiles.js";
import ajustes from "./modulos/ajustes.js";
import desarrollo from "./modulos/desarrollo.js";

const MODULOS = [actividades, usuarias, estadisticas, perfiles, ajustes, desarrollo];

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
        <div class="who"><a class="sync-pill" id="nube" href="#/ajustes" hidden></a><span class="avatar" aria-hidden="true">${esc(yo.nombre[0] || "?")}</span><span><b>${esc(yo.nombre.split(" ")[0])}</b><small>${esc(yo.rol)}</small></span>
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
  pintarNube();
  window.scrollTo({ top: 0 });
  return $("#contenido");
}

/** Indicador de sincronización en la barra superior. */
function pintarNube() {
  const el = $("#nube");
  if (!el) return;
  const e = nube.estado;
  el.hidden = !e.conectada;
  const [clase, texto] = e.enCurso ? ["busy", "Sincronizando…"]
    : e.sinInternet ? ["off", e.pendientes ? `Sin internet · ${e.pendientes} por enviar` : "Sin internet"]
    : e.error ? ["warn", "No se pudo sincronizar"]
    : e.pendientes ? ["busy", `${e.pendientes} por enviar`]
    : ["ok", "Sincronizado"];
  el.className = `sync-pill ${clase}`;
  el.innerHTML = `<span class="sync-text">${esc(texto)}</span>`;
  el.setAttribute("aria-label", texto);
  el.title = [texto, e.error || (e.ultima ? `Última sincronización: ${new Date(e.ultima).toLocaleString("es-MX")}` : "")].filter(Boolean).join(" · ");
}
nube.avisos.addEventListener("estado", pintarNube);

const contexto = () => ({ yo, pintar, ir: h => (location.hash = h), recargar: router });

async function router() {
  try {
    const lista = await db.todos("perfiles");
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
    anotar(e.message, location.hash);
    raiz.innerHTML = `<main class="wrap"><div class="issues" role="alert"><b>Algo falló al abrir esta pantalla.</b><p>${esc(e.message)}</p><a class="btn" href="#/">Ir al inicio</a></div></main>`;
  }
}

/* ---------- Primer uso ---------- */
// Ningún dispositivo se puede configurar sin la cuenta del Centro: la contraseña la verifica
// el servidor (Supabase), así que tener el enlace de la app no basta para usarla.
async function primerUso() {
  const conectada = !!(await db.leerMeta("nube"));
  raiz.innerHTML = `
  <main class="auth">
    <div class="auth-card stack">
      <div class="auth-brand"><span class="mark" aria-hidden="true">L</span><div><h1>Centro LIBRE Marquelia</h1><p class="hint">Listas de asistencia</p></div></div>
      <h2>Configura este dispositivo</h2>

      <section class="stack" data-paso="cuenta" ${conectada ? "hidden" : ""}>
        <p class="hint">Entra con la cuenta del Centro. Solo la Coordinadora debe conocer esta contraseña. Se necesita internet solo para este paso.</p>
        <div class="grid">
          <div class="field span-2"><label for="n-correo">Correo de la cuenta del Centro</label><input id="n-correo" type="email" autocomplete="username"></div>
          <div class="field span-2"><label for="n-clave">Contraseña</label><input id="n-clave" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="c-codigo">Letra de este dispositivo</label><input id="c-codigo" class="upper" value="A" maxlength="1">
            <span class="note">Una letra distinta en cada tableta o computadora (A, B, C…). Va en el folio para que nunca se repita.</span></div>
        </div>
        <div class="actions"><button class="btn primary" id="unir">Entrar</button></div>
      </section>

      <section class="stack" data-paso="coordinadora" ${conectada ? "" : "hidden"}>
        <p class="hint">La cuenta del Centro todavía no tiene perfiles. Crea el de la Coordinadora; después ella podrá dar de alta a la Psicóloga y a la Abogada.</p>
        <div class="grid" id="f">
          <div class="field span-2"><label for="c-nombre">Nombre completo de la Coordinadora</label><input id="c-nombre" data-campo="nombre" autocomplete="name"></div>
          <div class="field"><label for="c-pin">PIN de 4 a 6 números</label><input id="c-pin" data-campo="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
          <div class="field"><label for="c-pin2">Repite el PIN</label><input id="c-pin2" data-campo="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></div>
          <div class="field"><label for="c-prefijo">Prefijo de folio</label><input id="c-prefijo" data-campo="prefijo" class="upper" value="MAR" maxlength="5"></div>
        </div>
        <div class="actions"><button class="btn primary" id="crear">Crear perfil y empezar</button></div>
      </section>
      <div id="err"></div>
    </div>
  </main>`;

  $("#unir").onclick = async ev => {
    const letra = $("#c-codigo").value.trim().toUpperCase();
    if (!/^[A-Z]$/.test(letra)) return errores($("#err"), ["La letra del dispositivo debe ser una sola letra."]);
    ev.target.disabled = true;
    ev.target.textContent = "Conectando…";
    try {
      await db.escribirMeta("codigoDispositivo", letra);
      await nube.conectar($("#n-correo").value, $("#n-clave").value);
      await nube.sincronizar();
      if ((await db.todos("perfiles")).length) {
        aviso("Datos descargados. Entra con tu PIN.");
        return router();
      }
      $("#err").innerHTML = "";
      $("[data-paso=cuenta]").hidden = true;
      $("[data-paso=coordinadora]").hidden = false;
      $("#c-nombre").focus();
    } catch (e) {
      errores($("#err"), [e.message]);
      ev.target.disabled = false;
      ev.target.textContent = "Entrar";
    }
  };

  $("#crear").onclick = async () => {
    const d = leerCampos($("#f"));
    const e = [];
    if (d.nombre.split(" ").filter(Boolean).length < 2) e.push("Escribe nombre y apellido.");
    if (!pinValido(d.pin)) e.push("El PIN debe tener de 4 a 6 números.");
    else if (d.pin !== d.pin2) e.push("Los dos PIN no coinciden.");
    if (!/^[A-Z]{2,5}$/i.test(d.prefijo)) e.push("El prefijo de folio debe tener de 2 a 5 letras.");
    errores($("#err"), e);
    if (e.length) return;
    await db.escribirMeta("prefijoFolio", d.prefijo.toUpperCase());
    const u = await crearPerfil({ nombre: d.nombre, rol: "Coordinadora", pin: d.pin });
    iniciarSesion(u);
    aviso("Perfil creado");
    location.hash = "#/";
    router();
  };
}

/* ---------- Inicio de sesión ---------- */
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
    const espera = esperaPin();
    if (espera) return errores($("#err"), [`Demasiados intentos. Espera ${espera > 90000 ? `${Math.ceil(espera / 60000)} minutos` : `${Math.ceil(espera / 1000)} segundos`}.`]);
    if (await verificarPin(elegida, $("#pin").value)) {
      pinCorrecto();
      iniciarSesion(elegida);
      router();
    } else {
      pinFallido();
      anotar(`PIN incorrecto (${elegida.nombre.split(" ")[0]})`, "entrar");
      errores($("#err"), ["PIN incorrecto."]);
      $("#pin").select();
    }
  };
}

window.addEventListener("hashchange", router);

// Tras 30 minutos sin usarla, la app vuelve a pedir el PIN
["pointerdown", "keydown"].forEach(t => addEventListener(t, tocarSesion, { passive: true }));
setInterval(() => { if (yo && !sesionVigente()) { yo = null; router(); } }, 30000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && yo && !sesionVigente()) { yo = null; router(); } });
navigator.storage?.persist?.();
router();

// Si llegan datos de otro dispositivo, se refresca la pantalla salvo que se esté llenando un formulario
nube.iniciarAutomatica(() => {
  if (!/(registrar|editar|nueva|ajustes|perfiles|desarrollo)/.test(location.hash) && !document.querySelector("#pinForm:not([hidden])")) router();
});
