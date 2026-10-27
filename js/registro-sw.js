// Registro del service worker (funcionamiento sin internet) y aviso de versión nueva.
// Está en archivo aparte para que la política de seguridad no permita scripts dentro de la página.

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener("statechange", () => {
        if (nuevo.state === "installed" && navigator.serviceWorker.controller) document.getElementById("actualizar").hidden = false;
      });
    });
  });
  document.getElementById("recargar").onclick = () => {
    navigator.serviceWorker.getRegistration().then(r => r?.waiting?.postMessage("activar"));
  };
  // Recarga solo al actualizar una versión ya instalada, no en la primera visita
  const habiaVersion = !!navigator.serviceWorker.controller;
  let recargando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (habiaVersion && !recargando) { recargando = true; location.reload(); } });
}
