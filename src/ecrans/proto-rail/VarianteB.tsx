// PROTOTYPE — à jeter. VARIANTE B : « La pioche ».
//
// LA THÈSE : on ne choisit pas N. On ne l'annonce nulle part. L'app distribue
// le créneau suivant, on pose ou on passe, et elle en distribue un autre —
// jusqu'à « j'arrête là ». L'horizon est ÉMERGENT : il vaut ce qu'on a eu envie
// de faire, ce qui est exactement la phrase du 2026-08-30 prise au pied de la
// lettre (« lancer une planification quand je veux »), sans le second geste de
// devoir dire combien.
//
// DEUX BUDGETS, et c'est la position opposée à A. Une question ne consomme pas
// un pas : elle vit dans un bandeau au-dessus de la main, une seule à la fois,
// et on peut poser un plat sans y avoir répondu. Le plafond des questions est
// donc distinct du nombre de repas posés.
//
// LE REÇU EST L'HISTORIQUE ET LE RETOUR EN ARRIÈRE : ce qui est posé s'empile
// au-dessus, et toucher une ligne rouvre ce créneau. Il n'y a pas de bouton
// « précédent » parce qu'il n'y a pas de séquence — juste une pile.

import { useMemo, useState } from "react";
import type { PropsVariante } from "./ProtoRail";
import { quand } from "./ProtoRail";
import { CarteRail, QuestionRail, Recap } from "./PiecesRail";
import {
  etatDuSlot,
  mainDuRail,
  prochain,
  questionOuverte,
  questionsDeLaMain,
  slotsPrincipaux,
} from "./rail";

export function VarianteB(p: PropsVariante) {
  const { jeu, calc, catalogue, placard, st, actes, reglages, cuisinesRecentes } = p;
  const [courant, setCourant] = useState<number | null>(null);
  const [arrete, setArrete] = useState(false);

  const i = courant ?? prochain(jeu, st) ?? null;

  const touches = useMemo(
    () => slotsPrincipaux(jeu).filter((s) => etatDuSlot(st, s) !== "vide"),
    [jeu, st],
  );

  if (arrete || i === null) {
    return (
      <div className="co-corps">
        <Recap
          catalogue={catalogue}
          calc={calc}
          poses={touches
            .filter((s) => etatDuSlot(st, s) === "pose")
            .map((s) => ({ quand: quand(jeu, s), titre: jeu.plats[st.choix[s] as string]?.titre ?? "?" }))}
          hors={touches.filter((s) => etatDuSlot(st, s) === "hors-plan").length}
          questions={Object.keys(st.reponses).length}
        />
        <button className="btn btn-secondary btn-block" onClick={() => { setArrete(false); setCourant(null); }}>
          Reprendre la pioche
        </button>
      </div>
    );
  }

  const cartes = mainDuRail(jeu, st, i, reglages, cuisinesRecentes);
  const questions = questionsDeLaMain(catalogue, placard, cartes).filter((q) => questionOuverte(st, q));
  const question = questions[0];

  const suivant = () => setCourant(prochain(jeu, st, i));

  return (
    <div className="co-corps">
      {/* LE REÇU. Il pousse vers le bas au fil de la passe : ce qu'on vient de
          poser reste sous les yeux, et c'est ce qui remplace le compteur
          « 3 sur 5 » de A — on voit ce qu'on a fait, pas ce qu'il reste. */}
      {touches.length ? (
        <div className="card" style={{ marginBottom: "var(--space-3)", padding: "var(--space-2)" }}>
          <div className="co-kicker">cette passe</div>
          {touches.map((s) => {
            const e = etatDuSlot(st, s);
            return (
              <button
                key={s}
                onClick={() => setCourant(s)}
                style={{
                  display: "flex", width: "100%", gap: 8, textAlign: "left",
                  background: "none", border: 0, padding: "4px 0", cursor: "pointer",
                  color: e === "hors-plan" ? "var(--color-neutral-700)" : "inherit",
                }}
              >
                <span className="co-kicker" style={{ minWidth: 108 }}>{quand(jeu, s)}</span>
                <span style={{ flex: 1 }}>
                  {e === "pose"
                    ? jeu.plats[st.choix[s] as string]?.titre
                    : e === "saute"
                      ? "on ne mange pas là"
                      : "hors du plan"}
                </span>
                <span className="co-note">changer</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="co-h">{quand(jeu, i)}</div>
      <p className="co-note">
        {touches.length ? `${touches.length} créneau${touches.length > 1 ? "x" : ""} décidé${touches.length > 1 ? "s" : ""}` : "rien de posé pour l’instant"}
        {" · "}{calc.panier.size} articles au panier
      </p>

      {/* LE BANDEAU DE QUESTION — au-dessus de la main, jamais à sa place. Le
          compteur dit qu'il y en a d'autres sans les empiler à l'écran. */}
      {question ? (
        <>
          <QuestionRail
            q={question}
            repondre={(v) => actes.repondre(question.cle, v)}
            ecarter={() => actes.ecarter(question.cle)}
          />
          {questions.length > 1 ? (
            <div className="co-note" style={{ marginTop: -8, marginBottom: "var(--space-2)" }}>
              {questions.length - 1} autre{questions.length > 2 ? "s" : ""} en attente — elles ne
              bloquent rien.
            </div>
          ) : null}
        </>
      ) : null}

      <div style={{ display: "flex", gap: "var(--space-2)", margin: "var(--space-2) 0", flexWrap: "wrap" }}>
        <button className="btn btn-secondary" onClick={() => { actes.sauter(i); suivant(); }}>
          On ne mange pas là
        </button>
        <button className="btn btn-secondary" onClick={() => { actes.horsPlan(i); suivant(); }}>
          Passer
        </button>
        <button className="btn btn-ghost" onClick={() => actes.repiocher(i)}>
          Repiocher ⟳
        </button>
      </div>

      {cartes.length ? (
        cartes.map((c) => (
          <CarteRail
            key={c.plat.id}
            carte={c}
            dense
            poser={() => { actes.poser(i, c.plat.id); setCourant(prochain(jeu, st, i)); }}
          />
        ))
      ) : (
        <div className="co-vide">Plus de cartes pour ce créneau.</div>
      )}

      <button
        className="btn btn-primary btn-block"
        style={{ marginTop: "var(--space-3)" }}
        onClick={() => setArrete(true)}
      >
        J’arrête là
      </button>
    </div>
  );
}
