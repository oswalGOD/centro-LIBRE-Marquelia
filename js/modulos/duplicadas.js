// Posibles usuarias duplicadas: la Coordinadora revisa cada pareja y une las fichas o las marca como distintas.

import * as db from "../core/db.js";
import { buscarDuplicadas, planificarFusion, unirUsuarias, marcarDistintas, CAMPOS_FICHA } from "../core/duplicados.js";
import { estadoVacio, paginar } from "../core/componentes.js";
import { fechaLarga, etiquetaSexo, etiquetaGrupo } from "../core/catalogos.js";
import { $, $$, esc, aviso, dobleToque, plural } from "../core/ui.js";

const ETIQUETAS = { curp: "CURP", nombre: "Nombre", fnac: "Nacimiento", lugar: "Lugar de nacimiento", sexo: "Sexo", grupo: "Grupo", ocupacion: "Ocupación", telefono: "Teléfono" };
const mostrar = (c, v) => (v === undefined || v === "" ? "—" : c === "fnac" ? fechaLarga(v) : c === "sexo" ? etiquetaSexo(v) : c === "grupo" ? `${v}) ${etiquetaGrupo(v)}` : v);

async function vista({ pintar, recargar }) {
  const [usuarias, asis, acts] = await Promise.all([db.todos("usuarias"), db.todos("asistencias"), db.todos("actividades")]);
  const visitas = id => asis.filter(x => x.usuariaId === id).length;
  const pares = buscarDuplicadas(usuarias);

  const tarjeta = ({ a, b, motivo }, i) => {
    const plan = planificarFusion(a, b, visitas);
    const fila = c => {
      const dif = plan.diferencias.includes(c);
      return `<tr><th scope="row">${ETIQUETAS[c]}</th><td class="${c === "curp" ? "mono" : ""}">${esc(mostrar(c, a[c]))}</td><td class="${c === "curp" ? "mono" : ""}">${esc(mostrar(c, b[c]))}</td><td class="${c === "curp" ? "mono" : ""}"><b>${esc(mostrar(c, plan.datos[c]))}</b>${dif ? ' <span class="chip warn">cambia</span>' : ""}</td></tr>`;
    };
    return `<section class="panel stack" data-par="${esc(a.id)}|${esc(b.id)}" aria-label="Pareja ${i + 1}">
      <div class="section-head"><h2 class="h3">${esc(plan.queda.nombre)}</h2><p class="hint">${esc(motivo)}.</p></div>
      <div class="table-scroll"><table class="data">
        <thead><tr><th></th><th>Ficha 1</th><th>Ficha 2</th><th>Quedaría</th></tr></thead>
        <tbody>${CAMPOS_FICHA.map(fila).join("")}
          <tr><th scope="row">Asistencias</th><td>${visitas(a.id)}</td><td>${visitas(b.id)}</td><td><b>${visitas(a.id) + visitas(b.id)}</b></td></tr></tbody>
      </table></div>
      <p class="hint">Al unir, se conserva una sola ficha con los datos más recientes de cada campo y las asistencias de ambas pasan a ella. Si ambas estaban en una misma actividad, queda una sola asistencia.</p>
      <div class="actions"><button class="btn primary" data-unir>Unir fichas</button><button class="btn ghost" data-distintas>Son personas distintas</button></div>
    </section>`;
  };

  const c = pintar("Posibles duplicadas", `
    <p class="hint">Fichas del padrón con nombre y fecha de nacimiento muy parecidos. Revise los datos antes de unirlas: la unión no se puede deshacer desde la app.</p>
    ${pares.length ? `<p class="hint"><b>${plural(pares.length, "pareja por revisar", "parejas por revisar")}.</b></p>${pares.map(tarjeta).join("")}`
      : estadoVacio("No hay posibles duplicadas.", "Si dos dispositivos registran a la misma persona sin CURP, aparecerá aquí tras sincronizar.")}
  `, { atras: "#/usuarias" });

  paginar(c, { selector: "[data-par]", porPagina: 10, dentro: true, singular: "pareja", plural: "parejas" });
  $$("[data-par]", c).forEach(caja => {
    const [a, b] = caja.dataset.par.split("|");
    dobleToque($("[data-unir]", caja), "Toque nuevamente para unir", async () => {
      try {
        await unirUsuarias(a, b);
        aviso("Fichas unidas");
      } catch (e) { aviso(e.message); }
      recargar();
    });
    $("[data-distintas]", caja).onclick = async () => {
      await marcarDistintas(a, b);
      aviso("Se marcaron como personas distintas");
      recargar();
    };
  });
}

export default {
  menu: [],
  rutas: [[/^#\/usuarias\/duplicadas$/, vista, { soloCoordinadora: true }]],
};
