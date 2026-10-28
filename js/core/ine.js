// Lectura de la credencial para votar (INE) con la cámara. Funciona sin internet: el texto se
// reconoce en el dispositivo con Tesseract y la foto no se guarda ni se envía a ningún lado.
//   Frente: la CURP impresa (se comprueba con su dígito verificador).
//   Reverso: las 3 líneas de la zona de lectura automática (MRZ): fecha de nacimiento, sexo y nombre.

import { leerCurp, hoy } from "./catalogos.js";

const DICCIONARIO = "0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";

/** Dígito verificador de la CURP (posición 18) a partir de las primeras 17 posiciones. */
export function digitoCurp(curp17) {
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += DICCIONARIO.indexOf(curp17[i]) * (18 - i);
  return String((10 - (suma % 10)) % 10);
}

// Confusiones típicas del reconocimiento de texto, según si en esa posición va letra o número
const A_LETRA = { 0: "O", 1: "I", 2: "Z", 4: "A", 5: "S", 6: "G", 8: "B" };
const A_NUMERO = { O: "0", D: "0", Q: "0", I: "1", L: "1", T: "1", Z: "2", A: "4", S: "5", G: "6", B: "8" };
const MOLDE_CURP = "LLLLNNNNNNLLLLLLXN"; // L letra, N número, X cualquiera

function ajustar(texto, molde) {
  return [...texto].map((ch, i) => (molde[i] === "L" ? A_LETRA[ch] || ch : molde[i] === "N" ? A_NUMERO[ch] || ch : ch)).join("");
}

/** Busca en un texto una CURP válida (formato, fecha y dígito verificador). Devuelve la CURP o null. */
export function buscarCurp(texto) {
  for (const linea of String(texto || "").toUpperCase().split("\n")) {
    const s = linea.replace(/[^A-Z0-9]/g, "");
    for (let i = 0; i + 18 <= s.length; i++) {
      const base = ajustar(s.slice(i, i + 18), MOLDE_CURP);
      // La posición 17 es número para nacidas antes del 2000 y letra después: se prueban ambas lecturas
      for (const p17 of new Set([base[16], A_NUMERO[base[16]], A_LETRA[base[16]]].filter(Boolean))) {
        const c = base.slice(0, 16) + p17 + base[17];
        const info = leerCurp(c);
        if (info && info.fnac <= hoy() && digitoCurp(c) === c[17]) return c;
      }
    }
  }
  return null;
}

/** Dígito verificador de la MRZ (pesos 7, 3, 1). */
function digitoMrz(s) {
  const valor = ch => (ch === "<" ? 0 : /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55);
  return String([...s].reduce((t, ch, i) => t + valor(ch) * [7, 3, 1][i % 3], 0) % 10);
}

/**
 * Línea 2 de la MRZ: AAMMDD + dígito + sexo + vigencia AAMMDD + dígito + MEX…
 * Devuelve { fnac, sexo } solo si los dígitos verificadores coinciden.
 */
export function leerLinea2(texto) {
  for (const linea of String(texto || "").toUpperCase().split("\n")) {
    const s = linea.replace(/\s/g, "");
    const m = /([0-9OQDILSZBG]{6})([0-9OQDILSZBG])([HMF<X])([0-9OQDILSZBG]{6})([0-9OQDILSZBG])M[E3]X/.exec(s);
    if (!m) continue;
    const [nac, dNac, sexo, vig, dVig] = [m[1], m[2], m[3], m[4], m[5]].map(x => ajustar(x, "NNNNNNN"));
    if (digitoMrz(nac) !== dNac || digitoMrz(vig) !== dVig) continue;
    const yy = Number(nac.slice(0, 2));
    const siglo = yy > new Date().getFullYear() % 100 ? 1900 : 2000;
    const fnac = `${siglo + yy}-${nac.slice(2, 4)}-${nac.slice(4, 6)}`;
    if (isNaN(new Date(fnac + "T12:00"))) continue;
    return { fnac, sexo: sexo === "M" || sexo === "F" ? "M" : sexo === "H" ? "H" : "" };
  }
  return null;
}

/** Candidatos a la línea 3 de la MRZ (APELLIDO<APELLIDO<<NOMBRE<NOMBRE<<<), ya normalizados a 30 caracteres. */
export function candidatosLinea3(texto) {
  const out = [];
  for (const linea of String(texto || "").toUpperCase().split("\n")) {
    const s = linea.replace(/\s/g, "");
    const m = /[A-Z]{2,}(?:[<A-Z]*)<<[A-Z][A-Z<]*/.exec(s);
    if (m && !/^IDMEX/.test(m[0])) out.push(m[0].slice(0, 30).padEnd(30, "<"));
  }
  return out;
}

/** Combina varias lecturas de la línea 3 eligiendo, en cada posición, el carácter más repetido. */
export function votar(candidatos) {
  if (!candidatos.length) return "";
  return Array.from({ length: 30 }, (_, i) => {
    const cuenta = {};
    for (const c of candidatos) cuenta[c[i]] = (cuenta[c[i]] || 0) + 1;
    return Object.entries(cuenta).sort((a, b) => b[1] - a[1] || (a[0] === "<" ? -1 : b[0] === "<" ? 1 : 0))[0][0];
  }).join("");
}

/** Separa la línea 3 en apellidos y nombres. Devuelve { apellidos: [], nombres: [] } o null. */
export function partirNombre(linea3) {
  const corte = linea3.indexOf("<<");
  if (corte < 2) return null;
  const apellidos = linea3.slice(0, corte).split("<").filter(Boolean);
  const nombres = linea3.slice(corte + 2).split("<<")[0].split("<").filter(Boolean);
  while (nombres.length > 1 && nombres.at(-1).length === 1) nombres.pop(); // relleno «<» mal leído
  if (!apellidos.length || !nombres.length) return null;
  return { apellidos, nombres };
}

/** Palabras en mayúsculas del frente de la credencial; sirven para corregir el nombre leído en el reverso. */
export function palabrasFrente(texto) {
  return [...new Set(String(texto || "").toUpperCase().match(/\b[A-ZÑ]{2,}\b/g) || [])];
}

/**
 * Corrige el nombre de la MRZ con las palabras del frente. El separador «<» a veces se lee como
 * otra letra (S, K, C…): «ANASLUCIA» se parte en ANA y LUCIA si el frente trae ambas palabras,
 * y «LUCIAS» queda como LUCIA.
 */
export function corregirConFrente(partes, palabras) {
  if (!partes || !palabras?.length) return partes;
  const conocidas = new Set(palabras.map(p => p.replace("Ñ", "N")));
  // palabra conocida seguida de relleno mal leído (1 a 3 letras)
  const conRelleno = t => [...conocidas].find(p => t.startsWith(p) && t.length - p.length <= 3);
  const arreglar = token => {
    if (conocidas.has(token)) return [token];
    for (let i = 2; i < token.length - 2; i++) {
      const a = token.slice(0, i), b = token.slice(i + 1);
      if (conocidas.has(a) && (conocidas.has(b) || conRelleno(b))) return [a, ...arreglar(b)];
    }
    const p = conRelleno(token);
    return [p || token];
  };
  return { apellidos: partes.apellidos.flatMap(arreglar), nombres: partes.nombres.flatMap(arreglar) };
}

const PRIMERA_VOCAL = s => (s.slice(1).match(/[AEIOU]/) || ["X"])[0];
const NOMBRES_COMUNES = ["MARIA", "MA", "JOSE", "J"];

/** Comprueba que el nombre concuerde con las iniciales de la CURP. */
export function nombreConcuerda(partes, curp) {
  if (!partes || !curp) return false;
  const [ap1, ap2 = "X"] = partes.apellidos;
  const nombre = partes.nombres.length > 1 && NOMBRES_COMUNES.includes(partes.nombres[0]) ? partes.nombres[1] : partes.nombres[0];
  return curp[0] === ap1[0] && curp[1] === PRIMERA_VOCAL(ap1) && curp[2] === ap2[0] && curp[3] === nombre[0];
}

// ---------- Reconocimiento en el navegador ----------

const BASE = new URL("../vendor/tesseract/", import.meta.url).href;
// Prueba de soporte de WebAssembly SIMD (todos los celulares recientes); si no hay, se usa la versión normal
const SIMD = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

let trabajador;
function cargarLector() {
  trabajador ??= new Promise((ok, mal) => {
    const listo = () => window.Tesseract.createWorker("eng", 1, {
      workerPath: BASE + "worker.min.js",
      corePath: BASE + (WebAssembly.validate(SIMD) ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js"),
      langPath: BASE.replace(/\/$/, ""),
      workerBlobURL: false,
      gzip: true,
      cacheMethod: "none", // los archivos ya los guarda el service worker
    }).then(ok, mal);
    if (window.Tesseract) return listo();
    const s = document.createElement("script");
    s.src = BASE + "tesseract.min.js";
    s.onload = listo;
    s.onerror = () => mal(new Error("No se pudo cargar el lector de texto."));
    document.head.append(s);
  }).catch(e => { trabajador = null; throw e; });
  return trabajador;
}

/** Dibuja una parte de la imagen en un lienzo en escala de grises y con más contraste (o en blanco y negro). */
function lienzo(imagen, { x = 0, y = 0, w = imagen.width, h = imagen.height }, ancho, alto, binario = false) {
  const c = document.createElement("canvas");
  c.width = Math.round(ancho);
  c.height = Math.round(alto);
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(imagen, x, y, w, h, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const k = 255 / Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = (d[i] - min) * k;
  if (binario) {
    // Umbral de Otsu: separa tinta y fondo
    const hist = new Array(256).fill(0);
    for (let i = 0; i < d.length; i += 4) hist[Math.round(d[i])]++;
    const total = d.length / 4;
    let suma = 0, sumaB = 0, pesoB = 0, mejor = 0, umbral = 128;
    for (let t = 0; t < 256; t++) suma += t * hist[t];
    for (let t = 0; t < 256; t++) {
      pesoB += hist[t];
      if (!pesoB || pesoB === total) continue;
      sumaB += t * hist[t];
      const mB = sumaB / pesoB, mF = (suma - sumaB) / (total - pesoB);
      const v = pesoB * (total - pesoB) * (mB - mF) ** 2;
      if (v > mejor) { mejor = v; umbral = t; }
    }
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] > umbral ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const TODO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<";

/**
 * Lee una foto de la INE (frente o reverso). Devuelve lo que encontró:
 * { curp?, fnac?, sexo?, partes?: { apellidos, nombres } }
 */
export async function leerFotoIne(archivo, avisar = () => {}) {
  avisar("Preparando el lector…");
  const w = await cargarLector();
  const foto = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  try {
    // 1) Toda la foto a 1600 px de ancho para encontrar la CURP o la zona MRZ
    avisar("Leyendo la credencial…");
    const k = foto.width / 1600;
    await w.setParameters({ tessedit_char_whitelist: "", tessedit_pageseg_mode: "3" });
    const r = await w.recognize(lienzo(foto, {}, 1600, foto.height / k), {}, { text: true, blocks: true });
    const texto = r.data.text;
    const res = {};
    const curp = buscarCurp(texto);
    if (curp) {
      res.curp = curp;
      res.palabras = palabrasFrente(texto);
    }
    const l2 = leerLinea2(texto);
    if (l2) Object.assign(res, l2);
    const lineas3 = candidatosLinea3(texto);

    // 2) Si hay zona MRZ, se vuelve a leer la línea del nombre recortada y a varios tamaños
    const palabras = (r.data.blocks || []).flatMap(b => b.paragraphs.flatMap(p => p.lines.flatMap(l => l.words)));
    const nombre = palabras.find(p => /^[A-Z]{2,}(?:<+[A-Z]+)*<<[A-Z]/.test(p.text) && !/^IDMEX/.test(p.text));
    const l2Palabra = palabras.find(p => /\d{7}[HMF<]\d{7}M/.test(p.text.replace(/[OQD]/g, "0")));
    if (nombre || l2Palabra || lineas3.length) {
      avisar("Leyendo el nombre…");
      const ref = nombre || l2Palabra;
      if (ref) {
        const b = ref.bbox, h = b.y1 - b.y0;
        // la línea del nombre, o la siguiente a la línea 2 si el nombre no se encontró
        const y0 = nombre ? b.y0 : b.y1 + h * 0.15;
        const zona = { x: Math.max(0, (b.x0 - h) * k), y: Math.max(0, (y0 - h * 0.35) * k), w: (b.x1 - b.x0 + 4 * h) * k, h: h * 1.7 * k };
        zona.w = Math.min(zona.w, foto.width - zona.x);
        zona.h = Math.min(zona.h, foto.height - zona.y);
        await w.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ<", tessedit_pageseg_mode: "7" });
        for (const [alto, binario] of [[64, false], [80, false], [96, false], [64, true], [96, true]]) {
          const escala = (alto * 1.7) / zona.h;
          const t = (await w.recognize(lienzo(foto, zona, zona.w * escala, alto * 1.7, binario))).data.text;
          lineas3.push(...candidatosLinea3(t));
        }
      }
      if (!res.fnac && l2Palabra) {
        const b = l2Palabra.bbox, h = b.y1 - b.y0;
        const zona = { x: Math.max(0, (b.x0 - h) * k), y: Math.max(0, (b.y0 - h * 0.35) * k), w: Math.min(foto.width - Math.max(0, (b.x0 - h) * k), (b.x1 - b.x0 + 2 * h) * k), h: h * 1.7 * k };
        await w.setParameters({ tessedit_char_whitelist: TODO, tessedit_pageseg_mode: "7" });
        for (const alto of [40, 56]) {
          const l = leerLinea2((await w.recognize(lienzo(foto, zona, zona.w * (alto * 1.7) / zona.h, alto * 1.7))).data.text);
          if (l) { Object.assign(res, l); break; }
        }
      }
      const partes = partirNombre(votar(lineas3));
      if (partes) res.partes = partes;
    }
    return res;
  } finally {
    foto.close?.();
  }
}

// ---------- Ventana «Escanear INE» ----------

const NOMBRE_SEXO = { H: "Hombre", M: "Mujer", Otro: "Otro" };

/**
 * Pide una foto del frente y otra del reverso de la INE y devuelve
 * { curp, nombre, fnac, sexo, nombreVerificado } con lo que se pudo leer, o null si se cancela.
 */
export function escanearIne() {
  return new Promise(resolve => {
    const previo = document.activeElement;
    const capa = document.createElement("div");
    capa.className = "sig-modal scan-modal ine-modal";
    capa.innerHTML = `
      <div class="sig-sheet" role="dialog" aria-modal="true" aria-labelledby="ineTitulo">
        <div class="sig-head"><h2 id="ineTitulo">Escanear INE</h2>
          <p class="hint">Toma una foto de cada lado, de cerca, derecha y con buena luz. Del frente se lee la CURP y del reverso, el nombre. La foto no se guarda.</p></div>
        <div class="ine-cuerpo stack">
          <div class="ine-lados">
            <label class="btn" for="ineFrente">Foto del frente</label><input type="file" id="ineFrente" accept="image/*" capture="environment" class="visually-hidden" data-lado="frente">
            <label class="btn" for="ineReverso">Foto del reverso</label><input type="file" id="ineReverso" accept="image/*" capture="environment" class="visually-hidden" data-lado="reverso">
          </div>
          <p class="hint" id="ineEstado" role="status"></p>
          <dl class="facts" id="ineDatos"></dl>
          <p class="note warn" id="ineAviso" hidden></p>
        </div>
        <div class="actions">
          <button type="button" class="btn primary" data-accion="usar" disabled>Usar estos datos</button>
          <button type="button" class="btn ghost push" data-accion="cancelar">Cancelar</button>
        </div>
      </div>`;
    const desbordePrevio = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.append(capa);
    const $c = s => capa.querySelector(s);
    const datos = {};
    let ocupado = false;

    function cerrar(valor) {
      removeEventListener("keydown", tecla);
      document.documentElement.style.overflow = desbordePrevio;
      capa.remove();
      previo?.focus?.({ preventScroll: true });
      resolve(valor);
    }
    const tecla = e => { if (e.key === "Escape" && !ocupado) cerrar(null); };
    addEventListener("keydown", tecla);
    $c("[data-accion=cancelar]").onclick = () => cerrar(null);

    function resultado() {
      const partes = corregirConFrente(datos.partes, datos.palabras);
      const info = datos.curp ? leerCurp(datos.curp) : null;
      return {
        curp: datos.curp || "",
        nombre: partes ? [...partes.nombres, ...partes.apellidos].join(" ") : "",
        fnac: info?.fnac || datos.fnac || "",
        sexo: info?.sexo || datos.sexo || "",
        nombreVerificado: !!partes && nombreConcuerda(partes, datos.curp),
      };
    }

    function pintar() {
      const r = resultado();
      const fila = (t, v) => `<div><dt>${t}</dt><dd>${v ? v.replace(/[&<>"]/g, ch => `&#${ch.charCodeAt(0)};`) : `<span class="chip warn">Falta</span>`}</dd></div>`;
      $c("#ineDatos").innerHTML = fila("CURP", r.curp) + fila("Nombre", r.nombre) + fila("Fecha de nacimiento", r.fnac.split("-").reverse().join("/")) + fila("Sexo", NOMBRE_SEXO[r.sexo]);
      const aviso = !r.curp && r.nombre ? "Falta la CURP: toma la foto del frente o escríbela en el formulario."
        : r.curp && !r.nombre ? "Para el nombre, toma la foto del reverso. También puedes escribirlo en el formulario."
        : r.nombre && !r.nombreVerificado ? "Revisa que el nombre esté bien escrito: no coincide del todo con la CURP."
        : "";
      $c("#ineAviso").textContent = aviso;
      $c("#ineAviso").hidden = !aviso;
      $c("[data-accion=usar]").disabled = !(r.curp || r.nombre || r.fnac);
    }

    capa.querySelectorAll("input[type=file]").forEach(input => (input.onchange = async () => {
      const archivo = input.files[0];
      input.value = "";
      if (!archivo || ocupado) return;
      ocupado = true;
      capa.querySelectorAll(".ine-lados .btn, [data-accion]").forEach(b => b.classList.add("disabled"));
      const estado = $c("#ineEstado");
      try {
        const r = await leerFotoIne(archivo, t => (estado.textContent = t));
        if (r.curp) { datos.curp = r.curp; datos.palabras = r.palabras; }
        if (r.fnac) { datos.fnac = r.fnac; datos.sexo = r.sexo; }
        if (r.partes) datos.partes = r.partes;
        estado.textContent = r.curp || r.partes || r.fnac
          ? `Listo: se leyó ${[r.curp && "la CURP", r.partes && "el nombre", !r.partes && r.fnac && "la fecha de nacimiento"].filter(Boolean).join(" y ")}.`
          : `No se pudo leer esta foto. Tómala más de cerca, sin reflejos y con la credencial derecha.`;
        pintar();
      } catch (e) {
        estado.textContent = e.message || "No se pudo leer la foto.";
      } finally {
        ocupado = false;
        capa.querySelectorAll(".disabled").forEach(b => b.classList.remove("disabled"));
      }
    }));
    $c("[data-accion=usar]").onclick = () => cerrar(resultado());
    pintar();
    $c("label[for=ineFrente]").focus?.();
  });
}
