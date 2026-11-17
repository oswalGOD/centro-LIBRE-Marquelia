// Registro del service worker (funcionamiento sin internet) y aviso de versión nueva.
// Está en archivo aparte para que la política de seguridad no permita scripts dentro de la página.

if ("serviceWorker" in navigator) {
  const aviso = document.getElementById("actualizar");
  const boton = document.getElementById("recargar");
  const mensaje = aviso?.firstChild; // nodo de texto del aviso
  const textoOriginal = mensaje?.textContent;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // Recarga solo al actualizar una versión ya instalada, no en la primera visita
  const habiaVersion = !!navigator.serviceWorker.controller;
  let recargando = false;
  const recargar = () => { if (!recargando) { recargando = true; location.reload(); } };
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (habiaVersion) recargar(); });

  let registro = null;
  const avisar = () => { if (navigator.serviceWorker.controller && aviso) aviso.hidden = false; };

  navigator.serviceWorker.register("sw.js").then(reg => {
    registro = reg;
    // La versión nueva pudo descargarse mientras la app estaba cerrada: ya está esperando
    if (reg.waiting) avisar();
    reg.addEventListener("updatefound", () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener("statechange", () => { if (nuevo.state === "installed") avisar(); });
    });
    // Una app instalada casi nunca se recarga: busca versión nueva al volver a ella y cada 30 minutos
    const buscar = () => reg.update().catch(() => {});
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") buscar(); });
    setInterval(buscar, 30 * 60 * 1000);
  });

  // Espera a que la versión nueva termine de descargarse (hasta «limite» ms) y devuelve el worker en espera
  async function esperarVersion(reg, limite) {
    const fin = Date.now() + limite;
    while (Date.now() < fin) {
      if (reg.waiting) return reg.waiting;
      if (!reg.installing) { try { await reg.update(); } catch {} if (reg.waiting) return reg.waiting; if (!reg.installing) return null; }
      await sleep(250);
    }
    return reg.waiting;
  }

  if (boton) boton.onclick = async () => {
    if (boton.disabled) return;
    boton.disabled = true;
    boton.textContent = "Actualizando…";
    if (mensaje) mensaje.textContent = "Se está instalando la versión nueva. La aplicación se reiniciará en unos segundos. ";
    try {
      const reg = registro || await navigator.serviceWorker.getRegistration();
      const espera = reg && await esperarVersion(reg, 15000);
      if (espera) {
        espera.postMessage("activar");
        // Algunos navegadores (sobre todo iOS en aplicación instalada) no avisan el cambio: se recarga de todos modos
        await sleep(2500);
      }
    } catch {}
    // Respaldo: si no hubo aviso de cambio, recarga igualmente; la versión nueva ya queda activa
    recargar();
  };
}
