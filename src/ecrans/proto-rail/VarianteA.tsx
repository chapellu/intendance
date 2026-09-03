// PROTOTYPE — à jeter. VARIANTE A : « Le fil ».
//
// LA THÈSE : on annonce l'horizon d'abord, puis le rail avance d'un pas à la
// fois, plein écran. N est un nombre qu'on choisit ; le fil est linéaire ; on
// revient en arrière en touchant un pas déjà franchi.
//
// UN SEUL BUDGET. Une question n'est pas une interruption : c'est un PAS du
// fil, avec son propre point de progression. Répondre à trois questions et
// poser quatre plats, c'est sept pas — et le plafond des ~5 de #35 se compte
// sur ce total, pas sur les questions seules. C'est la position que cette
// variante défend, et B défend l'inverse.

import { useMemo, useState } from "react";
import type { PropsVariante } from "./ProtoRail";
import { quand } from "./ProtoRail";
import { CarteRail, QuestionRail, Recap } from "./PiecesRail";
import {
  etatDuSlot,
  itineraire,
  mainDuRail,
  questionOuverte,
  questionsDeLaMain,
} from "./rail";

const HORIZONS = [1, 3, 5, 7, 14];

export function VarianteA(p: PropsVariante) {
  const { jeu, calc, catalogue, placard, st, actes, reglages, cuisinesRecentes } = p;
  const [n, setN] = useState<number | null>(null);
  const [pas, setPas] = useState(0);

  const route = useMemo(() => (n ? itineraire(jeu, st, n) : []), [jeu, st, n]);

  if (n === null) return <Horizon jeu={jeu} st={st} choisir={setN} />;

  const fini = pas >= route.length;
  if (fini) {
    return (
      <div className="co-corps">
        <Recap
          catalogue={catalogue}
          calc={calc}
          poses={route
            .filter((i) => etatDuSlot(st, i) === "pose")
            .map((i) => ({ quand: quand(jeu, i), titre: jeu.plats[st.choix[i] as string]?.titre ?? "?" }))}
          hors={route.filter((i) => etatDuSlot(st, i) === "hors-plan").length}
          questions={Object.keys(st.reponses).length}
        />
        <button className="btn btn-secondary btn-block" onClick={() => setPas(route.length - 1)}>
          Revenir au dernier pas
        </button>
      </div>
    );
  }

  const i = route[pas]!;
  const cartes = mainDuRail(jeu, st, i, reglages, cuisinesRecentes);
  const question = questionsDeLaMain(catalogue, placard, cartes).find((q) => questionOuverte(st, q));

  const avancer = () => setPas((v) => v + 1);

  return (
    <div className="co-corps">
      {/* LA PROGRESSION EST LE FIL LUI-MÊME : un point par pas, et le point est
          le bouton du retour en arrière. Pas de flèche « précédent » — on ne
          recule pas d'un cran, on retourne à un endroit nommé. */}
      <div className="co-crans" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
        {route.map((s, k) => {
          const e = etatDuSlot(st, s);
          return (
            <button
              key={s}
              className={`co-pilule${k === pas ? " actif" : ""}`}
              onClick={() => setPas(k)}
              title={quand(jeu, s)}
              style={{
                opacity: k > pas ? 0.4 : 1,
                fontWeight: k === pas ? 700 : 400,
                borderBottom: k === pas ? "2px solid var(--color-accent-700)" : "2px solid transparent",
              }}
            >
              {k === pas ? quand(jeu, s) : e === "pose" ? "●" : e === "saute" ? "◇" : e === "hors-plan" ? "·" : "○"}
            </button>
          );
        })}
        {question ? (
          <span className="co-pilule" style={{ fontWeight: 700 }}>
            ?
          </span>
        ) : null}
      </div>

      <div className="co-h">{quand(jeu, i)}</div>
      <p className="co-note">
        pas {pas + 1} sur {route.length} · {calc.panier.size} articles au panier pour l’instant
      </p>

      {question ? (
        // LE PAS EST LA QUESTION. Les cartes attendent : répondre change la
        // main qui suit, donc la montrer avant serait montrer une main fausse.
        <>
          <QuestionRail
            q={question}
            repondre={(v) => actes.repondre(question.cle, v)}
            ecarter={() => actes.ecarter(question.cle)}
          />
          <div className="co-note">La main se redistribue avec la réponse.</div>
        </>
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--space-2)", margin: "var(--space-2) 0" }}>
            <button className="btn btn-secondary" onClick={() => { actes.sauter(i); avancer(); }}>
              On ne mange pas là
            </button>
            <button className="btn btn-secondary" onClick={() => { actes.horsPlan(i); avancer(); }}>
              Je ne planifie pas celui-là
            </button>
            <button className="btn btn-ghost" onClick={() => actes.repiocher(i)}>
              Repiocher ⟳
            </button>
          </div>

          {cartes.length ? (
            cartes.map((c) => (
              <CarteRail key={c.plat.id} carte={c} poser={() => { actes.poser(i, c.plat.id); avancer(); }} />
            ))
          ) : (
            <div className="co-vide">Plus de cartes pour ce créneau.</div>
          )}
        </>
      )}
    </div>
  );
}

function Horizon({
  jeu,
  st,
  choisir,
}: {
  jeu: PropsVariante["jeu"];
  st: PropsVariante["st"];
  choisir: (n: number) => void;
}) {
  return (
    <div className="co-corps">
      <div className="co-h">Combien de repas ?</div>
      <p className="co-note">
        Ce soir un, dimanche sept. Le reste de la semaine ne devient pas un trou&nbsp;: il reste
        hors du plan, et l’app n’en reparle pas.
      </p>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", margin: "var(--space-3) 0" }}>
        {HORIZONS.map((n) => (
          <button
            key={n}
            className="btn btn-primary"
            style={{ minWidth: 72, fontSize: "1.25rem", padding: "var(--space-3)" }}
            onClick={() => choisir(n)}
            disabled={itineraire(jeu, st, n).length === 0}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="co-note">
        {itineraire(jeu, st, 14).length} créneaux principaux disponibles sur les sept jours à venir.
      </div>
    </div>
  );
}
