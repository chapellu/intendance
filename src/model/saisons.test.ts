import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { lireCatalogue } from "./catalogue";
import { creerJeu } from "./jeu";
import { deSaison, deSaisonCeMois, horsSaison } from "./saisons";
import { offre } from "./scoring";
import type { Catalogue, Plat } from "./types";

const catalogue: Catalogue = lireCatalogue(
  JSON.parse(readFileSync("public/cuisine-data.json", "utf8")) as unknown,
);
const poids = catalogue.equilibre.poids;

const platAvec = (ids: string[]): Plat =>
  ({
    id: "essai",
    ingredients: ids.map((id) => ({
      id, ref: id, nom: id, qty: 1, unit: "u", base: false, assaisonnement: false,
    })),
  }) as unknown as Plat;

describe("trois états, jamais deux", () => {
  test("de saison, hors saison, et inconnu", () => {
    expect(deSaison(catalogue, "tomates", 8)).toBe(true);
    expect(deSaison(catalogue, "tomates", 2)).toBe(false);
    // LE TROISIÈME ÉTAT EST CELUI QUI COMPTE. Le calendrier est un calendrier de
    // POTAGER : il ne porte aucun fruit et ignore la courgette. Réduire à un
    // booléen ferait de « je ne sais pas » un « pas de saison », et pénaliserait
    // trente ingrédients sur la seule foi d'une lacune.
    expect(deSaison(catalogue, "courgettes", 8)).toBeNull();
    expect(deSaison(catalogue, "fraises", 6)).toBeNull();
  });

  test("un ingrédient inconnu n'est jamais pénalisé", () => {
    expect(horsSaison(catalogue, platAvec(["courgettes", "fraises"]), 1, poids)).toMatchObject({
      score: 0,
      noms: [],
    });
  });

  test("les alias tombent sur la même fenêtre", () => {
    const [id, cible] = Object.entries(catalogue.rayons.aliases)[0]!;
    expect(deSaison(catalogue, id, 7)).toBe(deSaison(catalogue, cible, 7));
  });
});

describe("on ne paie que ce qui disparaît vraiment", () => {
  test("la tomate en février se paie", () => {
    const h = horsSaison(catalogue, platAvec(["tomates"]), 2, poids);
    expect(h.noms).toEqual(["tomates"]);
    expect(h.score).toBe(poids["hors_saison"]);
  });

  test("la tomate en août ne se paie pas", () => {
    expect(horsSaison(catalogue, platAvec(["tomates"]), 8, poids).score).toBe(0);
  });

  test("L'OIGNON NE SE PAIE JAMAIS — récolte n'est pas disponibilité", () => {
    // LE GARDE-FOU DE CE MODULE. L'oignon se récolte de mai à août et se mange
    // toute l'année parce qu'il se garde. La première version le pénalisait, et
    // punissait 56 plats sur 64 en février — dont les lentilles paysannes et le
    // curry de pois chiches. Une app qui déconseille l'oignon en hiver n'est pas
    // rigoureuse, elle est inutilisable.
    expect(deSaison(catalogue, "oignon", 2)).toBe(false);
    for (const m of [1, 2, 3, 11, 12])
      expect(horsSaison(catalogue, platAvec(["oignon", "ail", "pomme-de-terre"]), m, poids).score).toBe(0);
  });

  test("un plat, un coût — le hors-saison ne se cumule pas", () => {
    // Un plat n'est pas deux fois plus hors-saison parce qu'il cite deux légumes
    // d'été en janvier. Cumuler avantagerait les recettes courtes.
    const un = horsSaison(catalogue, platAvec(["tomates"]), 1, poids);
    const trois = horsSaison(catalogue, platAvec(["tomates", "concombre", "aubergine"]), 1, poids);
    expect(trois.score).toBe(un.score);
    expect(trois.noms).toHaveLength(3);
  });

  test("aucune récompense pour l'en-saison", () => {
    // La dissymétrie est le cœur du modèle : sans elle, la tomate d'août
    // gagnerait contre la courgette d'août faute de connaître la seconde.
    expect(horsSaison(catalogue, platAvec(["tomates"]), 8, poids).score).toBe(0);
    expect(horsSaison(catalogue, platAvec([]), 8, poids).score).toBe(0);
  });
});

describe("dans la proposition", () => {
  const cartes = (iso: string) => {
    const jeu = creerJeu(catalogue, 7, new Date(iso));
    const slot = jeu.creneaux.findIndex((c) => c.repas === "diner");
    return offre(jeu, jeu.choix, slot);
  };

  test("l'hiver punit plus que l'été, et pas tout le monde", () => {
    const ete = cartes("2026-08-17T12:00:00Z").filter((c) => c.horsSaison.length);
    const hiver = cartes("2026-02-16T12:00:00Z").filter((c) => c.horsSaison.length);
    expect(hiver.length).toBeGreaterThan(ete.length);
    // Mais jamais tout le monde : un hiver qui condamne 56 plats sur 64 n'aide
    // personne à choisir.
    expect(hiver.length).toBeLessThan(cartes("2026-02-16T12:00:00Z").length / 2);
  });

  test("la tarte aux tomates coule en février et pas en août", () => {
    const rang = (l: ReturnType<typeof cartes>) => l.findIndex((c) => c.plat.id === "tarte-tomates-moutarde");
    expect(rang(cartes("2026-02-16T12:00:00Z"))).toBeGreaterThan(rang(cartes("2026-08-17T12:00:00Z")));
  });

  test("le mois est celui du CRÉNEAU, pas celui d'aujourd'hui", () => {
    // Une semaine posée le 28 août court jusqu'au 3 septembre. Juger le dîner du
    // 2 septembre avec le calendrier d'août serait faux d'un mois — sans que
    // rien n'échoue.
    const jeu = creerJeu(catalogue, 7, new Date("2026-08-28T12:00:00Z"));
    const dernier = jeu.creneaux.length - 1;
    expect(offre(jeu, jeu.choix, dernier).length).toBeGreaterThan(0);
  });
});

describe("ce qui est de saison, pour l'écran", () => {
  test("la liste change avec le mois et reste lisible", () => {
    const aout = deSaisonCeMois(catalogue, 8);
    const fevrier = deSaisonCeMois(catalogue, 2);
    expect(aout.length).toBeGreaterThan(fevrier.length);
    expect(aout).toContain("tomates");
    expect(fevrier).not.toContain("tomates");
    expect(aout.every((n) => !n.includes("-"))).toBe(true);
  });
});
