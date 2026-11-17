// Teclado numérico propio para los campos de PIN en iPad.
// Safari de iPad no ofrece un teclado solo de números para páginas web (aun con
// inputmode="numeric" muestra el teclado completo en su página de cifras), así que en iPad
// los campos de PIN se marcan con inputmode="none" (sin teclado del sistema) y se muestra
// este teclado en la parte inferior de la pantalla. En computadora, teléfono y Android no se
// usa: ahí inputmode="numeric" ya muestra el teclado de números.

const esIPad = () => /iPad/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const CANDIDATO = 'input[type="password"][inputmode="numeric"]';
const MARCADO = "input[data-teclado-pin]";

let panel = null;
let campo = null;

function marcar(raiz) {
  raiz.querySelectorAll(CANDIDATO).forEach(i => {
    i.dataset.tecladoPin = "1";
    i.setAttribute("inputmode", "none");
  });
}

function construir() {
  panel = document.createElement("div");
  panel.className = "teclado-pin no-print";
  panel.hidden = true;
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Teclado numérico para el PIN");
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "borrar", "0", "listo"];
  panel.innerHTML = teclas.map(t => t === "borrar"
    ? `<button type="button" class="tecla tecla-accion" data-tecla="borrar" aria-label="Borrar un dígito">⌫</button>`
    : t === "listo"
      ? `<button type="button" class="tecla tecla-accion" data-tecla="listo">Listo</button>`
      : `<button type="button" class="tecla" data-tecla="${t}">${t}</button>`).join("");
  // Evita que tocar una tecla quite el foco del campo.
  panel.addEventListener("pointerdown", e => e.preventDefault());
  panel.addEventListener("mousedown", e => e.preventDefault());
  panel.addEventListener("click", e => {
    const b = e.target.closest("[data-tecla]");
    if (!b || !campo) return;
    pulsar(b.dataset.tecla);
  });
  document.body.appendChild(panel);
}

function pulsar(t) {
  const i = campo;
  if (t === "borrar") i.value = i.value.slice(0, -1);
  else if (t === "listo") return terminar(i);
  else if (!i.maxLength || i.maxLength < 0 || i.value.length < i.maxLength) i.value += t;
  i.dispatchEvent(new Event("input", { bubbles: true }));
}

function terminar(i) {
  const f = i.form;
  const ambito = f || i.closest(".field")?.parentElement;
  const pines = ambito ? [...ambito.querySelectorAll(MARCADO)].filter(x => x.offsetParent) : [i];
  const sig = pines[pines.indexOf(i) + 1];
  if (sig) { sig.focus(); return; }          // Hay otro campo de PIN (p. ej. confirmar): pasar a él.
  i.blur();
  // Formularios de un solo PIN (entrar, salir del modo captura, abrir casos): enviar.
  if (f && pines.length === 1 && typeof f.requestSubmit === "function") f.requestSubmit();
}

function mostrar(i) {
  if (!panel) construir();
  campo = i;
  panel.hidden = false;
  document.body.classList.add("con-teclado-pin");
  setTimeout(() => { try { i.scrollIntoView({ block: "center", behavior: "smooth" }); } catch { /* sin efecto */ } }, 60);
}

function ocultar() {
  if (panel) panel.hidden = true;
  campo = null;
  document.body.classList.remove("con-teclado-pin");
}

export function iniciarTecladoPin() {
  if (!esIPad()) return;
  marcar(document);
  new MutationObserver(() => marcar(document)).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("focusin", e => {
    const i = e.target;
    if (i?.matches?.(CANDIDATO)) {          // Recibió el foco antes de ser marcado: reiniciar para quitar el teclado del sistema.
      marcar(document);
      i.blur();
      i.focus({ preventScroll: true });
      return;
    }
    if (i?.matches?.(MARCADO)) mostrar(i);
  });
  document.addEventListener("focusout", e => {
    if (!e.target?.matches?.(MARCADO)) return;
    setTimeout(() => { if (!document.activeElement?.matches?.(MARCADO)) ocultar(); }, 0);
  });
}
