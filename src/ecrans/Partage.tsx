// La liste de courses de quelqu'un d'autre.
//
// CET ÉCRAN N'ÉCRIT RIEN, ET C'EST SA PROPRIÉTÉ PRINCIPALE. Il reconstruit une
// semaine à partir du lien, la calcule, et l'affiche — sans jamais toucher à la
// base. Ouvrir le lien de son conjoint ne doit pas écraser sa propre semaine :
// c'est la seule garantie qui rend un partage sans serveur utilisable à deux.
//
// C'EST UN INSTANTANÉ, ET L'ÉCRAN LE DIT. Sans serveur, rien ne remonte : si
// elle coche un article ici, personne ne le voit. Un partage qui laisserait
// croire au contraire serait pire que pas de partage du tout — deux personnes
// rentreraient du magasin en croyant chacune que l'autre a pris le lait. D'où
// l'absence de cases à cocher : ce qu'on ne peut pas tenir, on ne l'offre pas.

import { useMemo } from "react";
import { useCatalogue } from "../db/hooks";
import { calculer } from "../model/calcul";
import { creerJeu } from "../model/jeu";
import { lirePartage } from "../model/partage";
import { Corps } from "../ui/Coquille";
import { fmt } from "../ui/format";
import { vueDesCourses } from "./courses.vue";

export function Partage({ charge }: { charge: string }) {
  const { catalogue } = useCatalogue();
  const partage = useMemo(() => lirePartage(charge), [charge]);

  const vue = useMemo(() => {
    if (!catalogue || !partage) return null;
    // LA SEMAINE SE REBÂTIT DEPUIS LA DATE DU LIEN, pas depuis aujourd'hui. Un
    // lien envoyé vendredi et ouvert lundi désignerait sinon d'autres jours, et
    // les décisions tomberaient à côté — ou dans le vide.
    const jeu = creerJeu(catalogue, 7, new Date(`${partage.depuis}T12:00:00`));
    let poses = 0;
    let ignores = 0;
    for (const d of partage.decisions) {
      const i = jeu.creneaux.findIndex((c) => {
        const j = jeu.jours[c.jour];
        if (!j) return false;
        const iso = `${j.date.getFullYear()}-${String(j.date.getMonth() + 1).padStart(2, "0")}-${String(j.date.getDate()).padStart(2, "0")}`;
        return iso === d.jour && c.repas === d.repas;
      });
      // Un plat que le catalogue ne connaît plus est SAUTÉ, pas inventé : le
      // lien peut être plus vieux que le corpus.
      if (i < 0 || !jeu.plats[d.plat]) {
        // ON COMPTE CE QU'ON N'A PAS PU POSER, ET ON LE DIT. Laisser tomber une
        // décision en silence produirait une liste plus courte que la vraie, et
        // c'est précisément le genre de manque qu'on ne voit pas au magasin.
        ignores += 1;
        continue;
      }
      jeu.choix[i] = d.plat;
      // Même règle que pour le plat : un accompagnement que le catalogue ne
      // connaît plus est sauté, pas inventé. Il ne compte pas dans les décisions
      // ignorées — le repas, lui, a bien été posé.
      jeu.accompagnements[i] = d.avec.filter((id) => jeu.plats[id]);
      if (d.parts != null) jeu.parts[i] = d.parts;
      poses += 1;
    }
    const calc = calculer(jeu);
    return { courses: vueDesCourses(catalogue, calc.panier, new Map()), poses, ignores, calc };
  }, [catalogue, partage]);

  if (!partage)
    return (
      <Corps plat>
        <div className="co-h">Ce lien n’est pas lisible</div>
        <p className="co-note">
          Il a peut-être été coupé en route&nbsp;— les messageries raccourcissent les adresses
          longues. Demandez qu’on vous le renvoie.
        </p>
      </Corps>
    );

  if (!vue) return null;

  return (
    <Corps plat>
      <div className="co-h" style={{ marginTop: "var(--space-2)" }}>La liste de courses</div>
      <div className="co-note" style={{ marginTop: "var(--space-1)" }}>
        Partagée depuis un autre téléphone, pour la semaine du {partage.depuis}.{" "}
        {vue.poses} repas posé{vue.poses > 1 ? "s" : ""}.
        {vue.ignores ? (
          <>
            {" "}
            {vue.ignores} décision{vue.ignores > 1 ? "s" : ""} du lien n’
            {vue.ignores > 1 ? "ont" : "a"} pas pu être relue{vue.ignores > 1 ? "s" : ""}
            {" "}— le lien est peut-être plus vieux que le catalogue.
          </>
        ) : null}
      </div>

      {vue.courses.articles.length ? (
        vue.courses.rayons.map((r) => (
          <div key={r.nom} style={{ marginBottom: "var(--space-3)" }}>
            <div className="co-kicker" style={{ marginBottom: "var(--space-1)" }}>{r.nom}</div>
            {r.articles.map((a) => (
              <div key={a.cle} className="co-art">
                <span style={{ flex: 1 }}>
                  <span className="nom">{a.ligne.nom}</span>
                  <div className="pour">{a.ligne.n > 1 ? `${a.ligne.n} plats` : "1 plat"}</div>
                </span>
                <span className="q">
                  {fmt(a.ligne.qty)} {a.ligne.unit}
                </span>
              </div>
            ))}
          </div>
        ))
      ) : (
        <div className="co-vide">Rien à acheter pour cette semaine.</div>
      )}

      {/* CE QUI NE PEUT PAS ÊTRE TENU N'EST PAS OFFERT. Pas de cases : sans
          serveur, cocher ici ne remonterait nulle part, et deux personnes
          rentreraient du magasin en croyant chacune que l'autre a pris le lait. */}
      <div className="co-encart" style={{ marginTop: "var(--space-3)" }}>
        <span>
          <b>C’est un instantané.</b> Cette liste a été calculée au moment du partage et ne se
          met pas à jour&nbsp;; rien de ce que vous faites ici n’est renvoyé à l’expéditeur.
          Pour une liste vivante, il faudrait un compte et un serveur&nbsp;— l’app n’en a pas,
          et c’est ce qui lui permet de marcher hors ligne.
        </span>
      </div>

      <a
        className="btn btn-secondary btn-block"
        href="#/cockpit"
        style={{ marginTop: "var(--space-3)" }}
      >
        Ouvrir mon intendance
      </a>
    </Corps>
  );
}
