// Ajustes → Desarrollo: herramientas de mantenimiento protegidas con contraseña.
// La contraseña se guarda como huella en js/core/config.js (CLAVE_DESARROLLO).

import * as db from "../core/db.js";
import * as nube from "../core/sync.js";
import * as bitacora from "../core/bitacora.js";
import { CLAVE_DESARROLLO } from "../core/config.js";
import { VERSION_APP } from "./ajustes.js";
import { $, esc, aviso, errores, descargar, dobleToque } from "../core/ui.js";

const ITERACIONES = 600000;
const ABIERTA_POR = 15 * 60 * 1000;
const CLAVE_SESION = "clm-desarrollo-hasta";
const ALMACENES_DATOS = ["perfiles", "usuarias", "actividades", "asistencias"];
let fallos = 0, bloqueoHasta = 0;

async function huella(clave, sal, iteraciones) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(sal), iterations: iteraciones, hash: "SHA-256" }, k, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const abierta = () => { try { return Number(sessionStorage.getItem(CLAVE_SESION)) > Date.now(); } catch { return false; } };
const abrir = () => { try { sessionStorage.setItem(CLAVE_SESION, String(Date.now() + ABIERTA_POR)); } catch {} };
const cerrar = () => { try { sessionStorage.removeItem(CLAVE_SESION); } catch {} };
const fecha = t => (t ? new Date(t).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }) : "—");

async function vista(ctx) {
  if (!abierta()) return candado(ctx);
  const { pintar } = ctx;

  const conteos = {};
  for (const a of ALMACENES_DATOS) {
    const lista = await db.crudos(a);
    conteos[a] = { vigentes: lista.filter(x => !x.borrado).length, borrados: lista.filter(x => x.borrado).length };
  }
  await nube.actualizarEstado();
  const e = nube.estado;
  const estimado = await navigator.storage?.estimate?.();
  const persistente = await navigator.storage?.persisted?.();
  const cachesActivas = (await caches?.keys?.()) || [];
  const sw = await navigator.serviceWorker?.getRegistration?.();
  const errs = bitacora.leer();
  const diagnostico = {
    app: VERSION_APP,
    cache: cachesActivas,
    serviceWorker: sw?.active ? "activo" : "no",
    dispositivo: await db.uuidDispositivo(),
    idDispositivo: await db.leerMeta("idDispositivo", "A"),
    navegador: navigator.userAgent,
    pantalla: `${screen.width}×${screen.height} @${devicePixelRatio}`,
    almacenamientoMB: estimado ? +(estimado.usage / 1048576).toFixed(2) : null,
    cuotaMB: estimado ? Math.round(estimado.quota / 1048576) : null,
    persistente: !!persistente,
    registros: conteos,
    nube: { conectada: e.conectada, cuenta: e.cuenta, pendientes: e.pendientes, error: e.error,
      ultimoEnvio: await db.leerMeta("ultimoEnvio"), ultimaRecepcion: await db.leerMeta("ultimaRecepcion"), ultimaSincronizacion: e.ultima },
    errores: errs,
    generado: new Date().toISOString(),
  };

  const c = pintar("Desarrollo", `
    <p class="hint">Herramientas de mantenimiento. Se cierran solas a los 15 minutos.</p>

    <section class="panel stack">
      <h2 class="h3">Diagnóstico</h2>
      <dl class="facts">
        <div><dt>Versión</dt><dd>${esc(VERSION_APP)}</dd></div>
        <div><dt>Caché instalada</dt><dd class="mono">${esc(cachesActivas.join(", ") || "ninguna")}</dd></div>
        <div><dt>Dispositivo</dt><dd>ID ${esc(diagnostico.idDispositivo)} · <span class="mono">${esc(diagnostico.dispositivo.slice(0, 8))}</span></dd></div>
        <div><dt>Espacio usado</dt><dd>${diagnostico.almacenamientoMB ?? "?"} MB de ${diagnostico.cuotaMB ?? "?"} MB</dd></div>
        <div><dt>Almacenamiento protegido</dt><dd>${persistente ? `<span class="chip ok">Sí</span>` : `<span class="chip warn">No</span>`}</dd></div>
        ${ALMACENES_DATOS.map(a => `<div><dt>${a}</dt><dd>${conteos[a].vigentes}${conteos[a].borrados ? ` <small class="hint">+ ${conteos[a].borrados} borrados</small>` : ""}</dd></div>`).join("")}
        <div><dt>Nube</dt><dd>${e.conectada ? esc(e.cuenta) : "Sin conectar"}</dd></div>
        <div><dt>Cambios por enviar</dt><dd>${e.pendientes}</dd></div>
        <div><dt>Último envío</dt><dd>${fecha(diagnostico.nube.ultimoEnvio)}</dd></div>
        <div><dt>Última recepción</dt><dd>${fecha(diagnostico.nube.ultimaRecepcion)}</dd></div>
      </dl>
      <div class="actions">
        <button class="btn" id="descargarDiag">Descargar diagnóstico</button>
        ${persistente ? "" : `<button class="btn" id="proteger">Proteger almacenamiento</button>`}
      </div>
      <p class="hint">El diagnóstico no incluye datos de usuarias ni firmas; sirve para revisar fallas a distancia.</p>
    </section>

    <section class="panel stack">
      <h2 class="h3">Errores recientes</h2>
      ${errs.length ? `<div class="list">${errs.map(x => `<div class="row"><span class="body"><span class="name">${esc(x.mensaje)}</span><span class="meta"><span>${fecha(x.hora)}</span>${x.lugar ? `<span class="mono">${esc(x.lugar)}</span>` : ""}${x.ruta ? `<span class="mono">${esc(x.ruta)}</span>` : ""}</span></span></div>`).join("")}</div>
        <div class="actions"><button class="btn" id="vaciarErrores">Vaciar lista</button></div>`
      : `<p class="hint">Sin errores registrados en este dispositivo.</p>`}
    </section>

    <section class="panel stack">
      <h2 class="h3">Sincronización</h2>
      <p class="hint">Útil si un dispositivo quedó desfasado. No borra nada: solo vuelve a enviar o a pedir los registros.</p>
      <div class="actions">
        <button class="btn" id="reenviar" ${e.conectada ? "" : "disabled"}>Volver a enviar todo</button>
        <button class="btn" id="recibir" ${e.conectada ? "" : "disabled"}>Volver a recibir todo</button>
      </div>
    </section>

    <section class="panel stack">
      <h2 class="h3">Actualización</h2>
      <p class="hint">Borra los archivos guardados de la app y la descarga de nuevo. Los datos no se tocan. Necesita internet.</p>
      <div class="actions"><button class="btn" id="forzar">Forzar actualización</button></div>
    </section>

    <section class="panel stack">
      <h2 class="h3">Restablecer la app</h2>
      <p class="hint">Borra <b>todo</b> lo guardado en este dispositivo (perfiles, usuarias, actividades, firmas y ajustes) y la deja como recién instalada. No borra nada de la nube; si el dispositivo estaba sincronizado, al volver a conectarlo recupera los datos. Descarga un respaldo antes.</p>
      <div class="field"><label for="confirmar">Escribe RESTABLECER para confirmar</label><input id="confirmar" class="upper" autocomplete="off"></div>
      <div id="errReset"></div>
      <div class="actions"><button class="btn danger" id="restablecer">Restablecer este dispositivo</button></div>
    </section>

    <div class="actions"><button class="btn ghost" id="cerrar">Cerrar sección de desarrollo</button></div>
  `, { atras: "#/ajustes" });

  $("#descargarDiag", c).onclick = () => descargar(`diagnostico-${diagnostico.idDispositivo}-${diagnostico.generado.slice(0, 10)}.json`, JSON.stringify(diagnostico, null, 2));
  $("#proteger", c)?.addEventListener("click", async () => {
    const ok = await navigator.storage?.persist?.();
    aviso(ok ? "Almacenamiento protegido" : "El navegador no lo permitió. Instalar la app suele ayudar.");
    vista(ctx);
  });
  $("#vaciarErrores", c)?.addEventListener("click", () => { bitacora.vaciar(); vista(ctx); });

  const sincronizarDeNuevo = async (clave, valor, texto) => {
    await db.escribirMeta(clave, valor);
    try { await nube.sincronizar(); aviso(texto); } catch (err) { aviso(err.message); }
    vista(ctx);
  };
  $("#reenviar", c).onclick = () => sincronizarDeNuevo("ultimoEnvio", 0, "Se volvió a enviar todo");
  $("#recibir", c).onclick = () => sincronizarDeNuevo("ultimaRecepcion", null, "Se volvió a recibir todo");

  dobleToque($("#forzar", c), "Toca otra vez para actualizar", async () => {
    if (!navigator.onLine) return aviso("Necesitas internet para descargar la app de nuevo.");
    await Promise.all((await caches.keys()).map(k => caches.delete(k)));
    await Promise.all((await navigator.serviceWorker?.getRegistrations?.() || []).map(r => r.unregister()));
    location.reload();
  });

  $("#restablecer", c).onclick = async () => {
    if ($("#confirmar", c).value.trim().toUpperCase() !== "RESTABLECER") return errores($("#errReset", c), ["Escribe RESTABLECER en el campo para confirmar."]);
    await db.eliminarTodo();
    try { localStorage.clear(); sessionStorage.clear(); } catch {}
    await Promise.all((await caches?.keys?.() || []).map(k => caches.delete(k)));
    await Promise.all((await navigator.serviceWorker?.getRegistrations?.() || []).map(r => r.unregister()));
    location.replace(location.pathname);
  };

  $("#cerrar", c).onclick = () => { cerrar(); ctx.ir("#/ajustes"); };
}

/** Pide la contraseña. Si todavía no hay una configurada, ayuda a generar su huella. */
function candado(ctx) {
  const c = ctx.pintar("Desarrollo", CLAVE_DESARROLLO ? `
    <section class="panel stack">
      <p class="hint">Esta sección es para mantenimiento de la app.</p>
      <form id="f" class="stack">
        <div class="field"><label for="clave">Contraseña de desarrollo</label><input id="clave" type="password" autocomplete="current-password"></div>
        <div id="err"></div>
        <div class="actions"><button class="btn primary" type="submit">Entrar</button></div>
      </form>
    </section>` : `
    <section class="panel stack">
      <h2 class="h3">Todavía no hay contraseña de desarrollo</h2>
      <p class="hint">Escribe la contraseña que quieras usar (al menos 10 caracteres; mejor una frase). La app genera su huella para guardarla en <span class="mono">js/core/config.js</span>. La contraseña nunca se guarda.</p>
      <form id="g" class="stack">
        <div class="grid">
          <div class="field"><label for="n1">Contraseña nueva</label><input id="n1" type="password" autocomplete="new-password"></div>
          <div class="field"><label for="n2">Repítela</label><input id="n2" type="password" autocomplete="new-password"></div>
        </div>
        <div id="err"></div>
        <div class="actions"><button class="btn primary" type="submit">Generar huella</button></div>
      </form>
      <div id="resultado" hidden class="stack">
        <p class="hint">Reemplaza en <span class="mono">js/core/config.js</span> la línea <span class="mono">export const CLAVE_DESARROLLO = null;</span> por esta:</p>
        <textarea id="linea" class="mono" rows="4" readonly></textarea>
        <div class="actions"><button class="btn" type="button" id="copiar">Copiar</button></div>
      </div>
    </section>`, { atras: "#/ajustes" });

  $("#f", c)?.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (Date.now() < bloqueoHasta) return errores($("#err", c), [`Demasiados intentos. Espera ${Math.ceil((bloqueoHasta - Date.now()) / 1000)} segundos.`]);
    const boton = $("button", ev.target);
    boton.disabled = true;
    const { sal, huella: esperada, iteraciones } = CLAVE_DESARROLLO;
    const ok = (await huella($("#clave", c).value, sal, iteraciones)) === esperada;
    boton.disabled = false;
    if (!ok) {
      if (++fallos >= 5) { fallos = 0; bloqueoHasta = Date.now() + 60000; }
      bitacora.anotar("Contraseña de desarrollo incorrecta", "desarrollo");
      return errores($("#err", c), ["Contraseña incorrecta."]);
    }
    fallos = 0;
    abrir();
    vista(ctx);
  });

  $("#g", c)?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const n1 = $("#n1", c).value, n2 = $("#n2", c).value;
    const e = [];
    if (n1.length < 10) e.push("Usa al menos 10 caracteres.");
    if (n1 !== n2) e.push("Las dos contraseñas no coinciden.");
    errores($("#err", c), e);
    if (e.length) return;
    const sal = db.uid();
    const valor = { sal, huella: await huella(n1, sal, ITERACIONES), iteraciones: ITERACIONES };
    $("#linea", c).value = `export const CLAVE_DESARROLLO = ${JSON.stringify(valor)};`;
    $("#resultado", c).hidden = false;
    $("#n1", c).value = $("#n2", c).value = "";
  });
  $("#copiar", c)?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("#linea", c).value); aviso("Copiado"); }
    catch { $("#linea", c).select(); aviso("Selecciona el texto y cópialo"); }
  });
}

export default {
  rutas: [[/^#\/desarrollo$/, vista]],
};
