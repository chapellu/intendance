// PROTOTYPE — à jeter. VARIANTE C : « Le plateau ».
//
// LA THÈSE : l'horizon n'est pas un nombre, c'est une SÉLECTION. On touche les
// créneaux qu'on veut planifier sur la grille de la semaine — trois touches
// font trois dîners — et tout ce qu'on n'a pas touché est hors du plan, ce qui
// résout le « créneau vide qui se lit comme un trou » par construction plutôt
// que par un état de plus : le silence est le défaut, et le plan est
// l'exception qu'on désigne.
//
// LE RAIL N'EST PAS LINÉAIRE. La grille reste à l'écran, l'app CONSEILLE le
// créneau le plus contraint (celui qui a le moins de cartes jouables : le
// remplir en dernier, c'est se retrouver sans main), mais rien n'oblige. Il n'y
// a donc pas de « retour en arrière » — tout est toujours atteignable.
//
// TROISIÈME POSITION SUR LES QUESTIONS : ni un pas (A), ni un bandeau (B). Un
// TIROIR que l'usager ouvre quand il veut, avec son compteur. L'app ne demande
// jamais d'elle-même ; elle signale qu'elle a des doutes et les range.

import { useMemo, useState } from "react";
import { offre } from "../../model/scoring";
import type { PropsVariante } from "./ProtoRail";
import { quand } from "./ProtoRail";
import { CarteRail, QuestionRail, Recap } from "./PiecesRail";
import {
  etatDuSlot,
  mainDuRail,
  questionOuverte,
  questionsDeLaMain,
  slotsJouables,
} from "./rail";

export function VarianteC(p: PropsVariante) {
  const { jeu, calc, catalogue, placard, st, actes, reglages, cuisinesRecentes } = p;
  const [phase, setPhase] = useState<"selection" | "plateau" | "fin">("selection");
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [tiroir, setTiroir] = useState(false);

  const jouables = useMemo(() => slotsJouables(jeu), [jeu]);
  const retenus = useMemo(() => jouables.filter((i) => st.retenus.has(i)), [jouables, st.retenus]);

  // LE PLUS CONTRAINT D'ABORD. `offre()` coûte 1 ms (T17) ; le mesurer sur les
  // créneaux retenus encore vides coûte donc moins qu'un rendu.
  const conseille = useMemo(() => {
    const vides = retenus.filter((i) => etatDuSlot(st, i) === "vide");
    if (!vides.length) return null;
    let meilleur = vides[0]!;
    let min = Infinity;
    for (const i of vides) {
      const n = offre({ ...jeu, choix: st.choix, slot: i }, st.choix, i).length;
      if (n < min) { min = n; meilleur = i; }
    }
    return meilleur;
  }, [jeu, st, retenus]);

  // Toutes les questions que les mains des créneaux retenus feraient naître —
  // le tiroir les rassemble au lieu de les faire surgir une par une.
  const questions = useMemo(() => {
    const vides = retenus.filter((i) => etatDuSlot(st, i) === "vide").slice(0, 4);
    const vues = new Set<string>();
    return vides
      .flatMap((i) => questionsDeLaMain(catalogue, placard, mainDuRail(jeu, st, i, reglages, cuisinesRecentes)))
      .filter((q) => questionOuverte(st, q) && !vues.has(q.cle) && (vues.add(q.cle), true));
  }, [jeu, st, retenus, catalogue, placard, reglages, cuisinesRecentes]);

  if (phase === "fin") {
    return (
      <div className="co-corps">
        <Recap
          catalogue={catalogue}
          calc={calc}
          poses={retenus
            .filter((i) => etatDuSlot(st, i) === "pose")
            .map((i) => ({ quand: quand(jeu, i), titre: jeu.plats[st.choix[i] as string]?.titre ?? "?" }))}
          hors={jouables.length - retenus.length}
          questions={Object.keys(st.reponses).length}
        />
        <button className="btn btn-secondary btn-block" onClick={() => setPhase("plateau")}>
          Revenir au plateau
        </button>
      </div>
    );
  }

  const selection = phase === "selection";

  return (
    <div className="co-corps">
      <div className="co-h">{selection ? "Quels repas ?" : "Le plateau"}</div>
      <p className="co-note">
        {selection
          ? "Touchez les créneaux que vous voulez planifier. Les autres ne sont pas des trous : ils restent hors du plan, et l’app n’en reparlera pas."
          : `${retenus.filter((i) => etatDuSlot(st, i) === "pose").length} posés sur ${retenus.length} retenus · ${calc.panier.size} articles`}
      </p>

      <Grille
        jeu={jeu}
        st={st}
        jouables={jouables}
        selection={selection}
        conseille={conseille}
        ouvert={ouvert}
        toucher={(i) => (selection ? actes.retenir(i) : setOuvert(ouvert === i ? null : i))}
      />

      {selection ? (
        <button
          className="btn btn-primary btn-block"
          style={{ marginTop: "var(--space-3)" }}
          disabled={!retenus.length}
          onClick={() => { setPhase("plateau"); setOuvert(conseille); }}
        >
          {retenus.length ? `Planifier ces ${retenus.length} repas` : "Choisissez au moins un repas"}
        </button>
      ) : (
        <>
          {/* LE TIROIR. Fermé, il ne dit qu'un chiffre ; ouvert, il pose les
              questions. Rien ne surgit. */}
          <button
            className="btn btn-secondary btn-block"
            style={{ marginTop: "var(--space-3)" }}
            onClick={() => setTiroir((v) => !v)}
            disabled={!questions.length}
          >
            {questions.length
              ? `À préciser (${questions.length}) ${tiroir ? "▲" : "▼"}`
              : "Rien à préciser"}
          </button>
          {tiroir
            ? questions.map((q) => (
                <QuestionRail
                  key={q.cle}
                  q={q}
                  repondre={(v) => actes.repondre(q.cle, v)}
                  ecarter={() => actes.ecarter(q.cle)}
                />
              ))
            : null}

          {ouvert !== null ? (
            <div style={{ marginTop: "var(--space-3)" }}>
              <div className="co-h" style={{ fontSize: "1rem" }}>
                {quand(jeu, ouvert)}
                {ouvert === conseille ? " — le plus contraint" : ""}
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", margin: "var(--space-2) 0", flexWrap: "wrap" }}>
                <button className="btn btn-secondary" onClick={() => actes.sauter(ouvert)}>
                  On ne mange pas là
                </button>
                <button className="btn btn-secondary" onClick={() => { actes.horsPlan(ouvert); actes.retenir(ouvert); setOuvert(conseille); }}>
                  Retirer du plan
                </button>
                <button className="btn btn-ghost" onClick={() => actes.repiocher(ouvert)}>
                  Repiocher ⟳
                </button>
              </div>
              {mainDuRail(jeu, st, ouvert, reglages, cuisinesRecentes).map((c) => (
                <CarteRail
                  key={c.plat.id}
                  carte={c}
                  poser={() => { actes.poser(ouvert, c.plat.id); setOuvert(conseille); }}
                />
              ))}
            </div>
          ) : (
            <div className="co-vide" style={{ marginTop: "var(--space-3)" }}>
              Touchez un créneau du plateau. {conseille !== null ? `Le plus contraint est ${quand(jeu, conseille)}.` : "Tout est posé."}
            </div>
          )}

          <button
            className="btn btn-primary btn-block"
            style={{ marginTop: "var(--space-3)" }}
            onClick={() => setPhase("fin")}
          >
            Terminer
          </button>
        </>
      )}
    </div>
  );
}

function Grille({
  jeu,
  st,
  jouables,
  selection,
  conseille,
  ouvert,
  toucher,
}: {
  jeu: PropsVariante["jeu"];
  st: PropsVariante["st"];
  jouables: number[];
  selection: boolean;
  conseille: number | null;
  ouvert: number | null;
  toucher: (i: number) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {jeu.jours.map((j, ij) => (
        <div key={ij} style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
          <span className="co-kicker" style={{ minWidth: 74, alignSelf: "center" }}>
            {j.nom}
          </span>
          {jouables
            .filter((i) => jeu.creneaux[i]?.jour === ij)
            .map((i) => {
              const e = etatDuSlot(st, i);
              const retenu = st.retenus.has(i);
              const dedans = selection ? retenu : retenu;
              return (
                <button
                  key={i}
                  onClick={() => toucher(i)}
                  disabled={!selection && !retenu}
                  style={{
                    flex: 1, minHeight: 44, borderRadius: 8, cursor: "pointer",
                    padding: "4px 6px", fontSize: ".72rem", lineHeight: 1.2, textAlign: "left",
                    border: i === ouvert
                      ? "2px solid var(--color-accent-700)"
                      : i === conseille && !selection
                        ? "2px dashed var(--color-accent-700)"
                        : "1px solid var(--color-neutral-300, #ddd)",
                    background: dedans
                      ? e === "pose" ? "var(--color-accent-100, #e7efe6)" : "#fff"
                      : "transparent",
                    color: dedans ? "inherit" : "var(--color-neutral-700)",
                    opacity: dedans ? 1 : 0.55,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{jeu.creneaux[i]?.label}</div>
                  <div>
                    {!dedans
                      ? selection
                        ? "toucher pour ajouter"
                        : "hors plan"
                      : selection
                        ? "retenu"
                        : e === "pose"
                        ? jeu.plats[st.choix[i] as string]?.titre
                        : e === "saute"
                          ? "on ne mange pas là"
                          : "à poser"}
                  </div>
                </button>
              );
            })}
        </div>
      ))}
    </div>
  );
}
