// Le verdict de cellule, par promesse.
//
// UNE DATE FIXE PARTOUT. Un test qui lirait `new Date()` serait vert
// aujourd'hui et rouge le 1er octobre, quand la fenêtre de l'ail s'ouvre —
// le dépôt a déjà payé ce bug côté e2e (`fiche-provenance.spec.ts`), et un
// modèle dont TOUTES les règles sont des dates y est bien plus exposé.

import { describe, expect, test } from "vitest";
import { culture } from "./cultures";
import { cellule } from "./terrasse";
import { verdict, verdictsDe, type Raison } from "./verdict";

/** Le jour où ce ticket a été écrit : six semaines avant Perséphone, les
 *  tomates encore debout, la fenêtre de l'ail pas tout à fait ouverte. La
 *  journée la plus chargée de l'année pour ce modèle. */
const LE_24_SEPTEMBRE = new Date(2026, 8, 24);

const v = (idCellule: string, idCulture: string, d = LE_24_SEPTEMBRE) =>
  verdict(cellule(idCellule)!, culture(idCulture)!, d);

const textes = (raisons: Raison[]): string => raisons.map((r) => r.texte).join(" | ");
const axes = (raisons: Raison[]): string[] => raisons.map((r) => r.axe);

describe("rien n'est jamais bloqué — la règle classe, elle n'interdit pas", () => {
  test("une culture impossible sort quand même, avec ses conditions", () => {
    // La carotte ne tiendra jamais dans 20 cm. Elle est listée malgré tout :
    // un écran qui la cacherait n'apprendrait pas pourquoi elle manque.
    const r = v("pot-2", "carotte");
    expect(r.statut).toBe("jamais-ici");
    expect(textes(r.raisons)).toContain("40 cm de racine pour 20 cm de terre");
  });

  test("toutes les raisons sortent, jamais la première seule", () => {
    // Le kale du 24 septembre en cumule quatre. Les distiller apprendrait à
    // lever un obstacle pour en découvrir un deuxième.
    expect(v("bac2-a", "kale").raisons.length).toBeGreaterThanOrEqual(4);
  });
});

describe("ce qui manque, nommé par ce qui le lèverait", () => {
  test("la profondeur est un fait sur LA CELLULE, pas un manque du jardinier", () => {
    expect(v("pot-2", "kale").statut).toBe("jamais-ici");
    // La même culture, le même jour, dans les 70 cm du bac 2 : plus rien.
    expect(axes(v("bac2-a", "kale").raisons)).not.toContain("jamais-ici");
  });

  test("un meuble n'est pas une occupation temporaire", () => {
    // Le lilas ne libérera pas le bac 1 en octobre. Il ne le libérera jamais.
    const r = v("bac1", "mache");
    expect(r.statut).toBe("jamais-ici");
    expect(textes(r.raisons)).toContain("Occupée en permanence");
  });

  test("une fenêtre encore fermée est une DATE, et la raison la porte", () => {
    const r = v("pot-1", "ail");
    expect(r.statut).toBe("attendre");
    expect(textes(r.raisons)).toContain("1er octobre");
  });

  test("occupée trop tard pour la fenêtre : le manque devient un GESTE", () => {
    // LA RÈGLE QUI JUSTIFIE LE MODÈLE. Les tomates tiennent le carré jusqu'au
    // 15 octobre ; la fenêtre du kale ferme le 5. Attendre libère la cellule
    // APRÈS coup — conseiller d'attendre reviendrait à conseiller poliment de
    // rater la saison. Ce n'est donc pas « attendre », c'est « arracher ».
    const r = v("bac2-a", "kale");
    expect(r.statut).toBe("agir");
    expect(textes(r.raisons)).toContain("c'est l'un ou l'autre");
  });

  test("occupée dans les temps : c'est une date, et le statut redevient attendre", () => {
    // La fève, elle, se met en place à partir du 15 octobre — le jour même où
    // le carré se libère. Aucun arbitrage : on attend, c'est tout.
    const r = v("bac2-a", "feve");
    expect(r.statut).toBe("attendre");
    expect(textes(r.raisons)).not.toContain("c'est l'un ou l'autre");
  });
});

describe("le pot est l'échappatoire à la rotation, et c'est mécanique", () => {
  test("un bac retient la famille, un pot ne la retient pas", () => {
    // Du basilic a poussé dans le carré A cette année : les lamiacées n'y
    // reviennent pas avant 2027.
    expect(textes(v("bac2-a", "basilic").raisons)).toContain("ne reviennent pas avant 2027");
    // Le même basilic, le même jour, dans un pot posé à côté : rien.
    expect(textes(v("pot-1", "basilic").raisons)).not.toContain("ne reviennent pas");
  });

  test("le pot DIT qu'il n'a pas de rotation, au lieu de rester muet", () => {
    // Une cellule sans ligne de rotation ressemble à une cellule dont on
    // n'aurait pas l'historique. Ce n'est pas la même chose.
    expect(textes(v("pot-1", "mache").raisons)).toContain("la rotation ne s'applique pas");
  });
});

describe("ce qu'on attend — une bande, et elle n'est pas le statut", () => {
  test("une culture peut être PRÊTE et attendue MAIGRE", () => {
    // Les trois tomates du bac 2, qui ont fait écrire tout le modèle : 3 h de
    // soleil pour 6 demandées. Rien ne manque, et la récolte sera pauvre.
    const r = v("bac2-b", "tomate", new Date(2030, 4, 20));
    expect(r.statut).toBe("prete");
    expect(r.bande).toBe("maigre");
    expect(textes(r.raisons)).toContain("3 h de soleil direct pour 6 h demandées");
  });

  test("une bande ne remonte jamais : chaque règle ne peut que rabaisser", () => {
    const r = v("bac2-a", "kale");
    // L'arc sud inconnu plafonne à « correcte » ; rien ne la relève ensuite.
    expect(r.bande).toBe("correcte");
  });
});

describe("ce qu'on ne sait pas se demande, il ne s'invente pas", () => {
  test("l'arc sud non relevé devient une DEMANDE D'OBSERVATION", () => {
    const r = v("bac2-a", "kale");
    expect(r.confiance).toBe("a-observer");
    expect(axes(r.raisons)).toContain("observer");
    expect(textes(r.raisons)).toContain("Sept mesures au téléphone");
  });

  test("une culture viable à 1 h ne demande aucune mesure", () => {
    // La mâche passe quel que soit l'arc sud. Lui coller une demande
    // d'observation diluerait la seule qui compte.
    const r = v("bac2-a", "mache");
    expect(r.confiance).toBe("estimation");
    expect(axes(r.raisons)).not.toContain("observer");
  });

  test("l'ail se juge sur le PRINTEMPS, pas sur le soleil de décembre", () => {
    // Il est en terre d'octobre à juin, mais l'hiver il s'enracine sans rien
    // demander. Le juger sur décembre le condamnerait à tort.
    expect(v("pot-1", "ail").bande).toBe("belle");
  });
});

describe("le 4 novembre choisit la forme d'achat", () => {
  test("41 jours avant Perséphone, le kale se vend en godet et pas en sachet", () => {
    // C'est la réponse qu'on cherche DEVANT LE RAYON, et elle ne se lit nulle
    // part sur un sachet de graines : 75 jours de semis contre 41 disponibles.
    const r = v("bac2-a", "kale");
    expect(r.forme).toBe("godet");
    expect(textes(r.raisons)).toContain("En godet, pas en graine");
  });

  test("la mâche tient encore en semis, de justesse — 40 jours pour 41", () => {
    expect(v("bac2-a", "mache").forme).toBe("graine");
  });

  test("passé l'échéance, aucune forme ne tient et la bande tombe à échec", () => {
    const r = v("pot-1", "kale", new Date(2026, 9, 20));
    expect(r.forme).toBeNull();
    expect(r.bande).toBe("echec");
    expect(textes(r.raisons)).toContain("L'hiver se tient, il ne se rattrape pas");
  });
});

describe("l'ombre portée — la seule interaction de voisinage qui reste", () => {
  test("un pied haut porte une consigne de placement, pas une dégradation", () => {
    const r = v("bac2-a", "kale");
    expect(textes(r.raisons)).toContain("le plus éloigné du sud");
    // Elle ne touche PAS la bande : le kale reste « correcte ».
    expect(r.bande).toBe("correcte");
  });

  test("un pot seul n'a pas de voisine : pas de consigne d'ombre", () => {
    expect(textes(v("pot-1", "laitue-hiver").raisons)).not.toContain("le plus éloigné du sud");
  });
});

describe("la terrasse entière", () => {
  test("chaque cellule rend un verdict par culture, toujours le même nombre", () => {
    // Un écran ne choisit jamais ses cultures : il serait le second endroit à
    // savoir lesquelles existent, et le premier à s'en désaligner.
    expect(verdictsDe(cellule("bac2-a")!, LE_24_SEPTEMBRE)).toHaveLength(10);
    expect(verdictsDe(cellule("bac1")!, LE_24_SEPTEMBRE)).toHaveLength(10);
  });
});
