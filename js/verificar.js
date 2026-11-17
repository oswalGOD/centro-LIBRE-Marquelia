// Página pública de verificación de constancias (verificar.html). Consulta supabase/verificacion.sql con la clave pública.

import { SUPABASE_URL, SUPABASE_ANON } from "./core/config.js";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = f => `${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]} de ${f.slice(0, 4)}`;
const limpiar = t => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const el = id => document.getElementById(id);

function dato(rotulo, valor) {
  const d = document.createElement("div");
  const dt = document.createElement("dt"), dd = document.createElement("dd");
  dt.textContent = rotulo;
  dd.textContent = valor;
  d.append(dt, dd);
  return d;
}

function mostrar(clase, titulo, texto, datos) {
  const r = el("resultado");
  r.hidden = false;
  r.className = `resultado ${clase}`;
  r.replaceChildren();
  const h = document.createElement("h2");
  h.textContent = titulo;
  r.append(h);
  if (texto) { const p = document.createElement("p"); p.textContent = texto; r.append(p); }
  if (datos) { const l = document.createElement("dl"); datos.forEach(([a, b]) => l.append(dato(a, b))); r.append(l); }
}

async function verificar(codigo) {
  const c = limpiar(codigo);
  if (!/^[A-HJ-NP-Z2-9]{12}$/.test(c)) return mostrar("aviso", "Código no válido", "El enlace no es válido. Escanee de nuevo el código QR de la constancia.");
  mostrar("espera", "Consultando…", "");
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verificar_constancia`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_codigo: c }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const x = await r.json();
    if (!x) return mostrar("no", "No se encontró la constancia", "No hay ninguna constancia registrada con ese código. Si la constancia es reciente, es posible que aún no se haya registrado: intente de nuevo más tarde o consulte al Centro LIBRE Marquelia.");
    if (x.anulada) return mostrar("no", "Constancia anulada", "Esta constancia fue anulada y ya no es válida. Para más información, consulte al Centro LIBRE Marquelia.");
    const horas = Number(x.horas);
    mostrar("ok", "Constancia auténtica", "El Centro LIBRE Marquelia emitió esta constancia.", [
      ["Otorgada a", x.nombre],
      ["Curso", x.curso],
      ["Fecha", fechaLarga(x.fecha)],
      ["Duración", `${horas} ${horas === 1 ? "hora" : "horas"}`],
      ["Folio", x.folio],
    ]);
  } catch {
    mostrar("aviso", "No fue posible consultar", "Revise su conexión a internet e intente de nuevo.");
  }
}

const codigo = new URLSearchParams(location.search).get("c");
if (codigo) verificar(codigo);
else mostrar("aviso", "Escanee el código QR", "Esta página solo se abre al escanear el código QR impreso en la constancia.");
