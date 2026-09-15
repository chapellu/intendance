// L'alarme, par ses promesses — T82.
//
// ON NE TESTE PAS ICI QUE LE TÉLÉPHONE SONNE. Aucun test de ce dépôt ne peut le
// faire : ce qui décide qu'un son sort d'un iPhone verrouillé est WebKit et le
// réglage de sonnerie de l'appareil, pas ce code. Ce qui se vérifie, c'est ce
// que le code DÉCIDE — le motif qu'il joue, et ce qu'il dit à l'écran quand la
// plateforme ne tient pas tout. Le reste se mesure sur le téléphone de la
// maison (Workspace#61), et ce fichier ne prétend pas le remplacer.

import { describe, expect, test } from "vitest";
import { dureeSonnerie, promesse, sonnerie, type Plateforme } from "./alarme";

describe("le motif de la sonnerie", () => {
  test("elle tient assez longtemps pour qu'on revienne d'une autre pièce", () => {
    // C'est la raison d'être du ticket. L'encart « Minuteur terminé » de T12
    // suffisait déjà à qui regardait l'écran ; ce qu'on ajoute ne sert qu'à
    // celui qui est ailleurs, et trois bips ne le font pas revenir.
    expect(dureeSonnerie()).toBeGreaterThanOrEqual(20);
    // Et pas davantage : passé une demi-minute, une alarme qu'on n'a pas
    // entendue ne s'entendra pas plus, elle ne fait que se faire désarmer.
    expect(dureeSonnerie()).toBeLessThanOrEqual(40);
  });

  test("DEUX HAUTEURS QUI ALTERNENT — une note tenue s'entend comme une panne", () => {
    // Le frigo, la hotte : une cuisine apprend en quelques jours à ne plus
    // entendre un son continu. Deux hauteurs font un motif, et un motif reste
    // un message.
    const bips = sonnerie();
    expect(new Set(bips.map((b) => b.hz)).size).toBe(2);
    for (let i = 1; i < bips.length; i++) expect(bips[i]!.hz).not.toBe(bips[i - 1]!.hz);
  });

  test("elle laisse plus de blanc que de son : on doit pouvoir parler par-dessus", () => {
    // Une alarme qui empêche la pièce de fonctionner se fait couper avant
    // d'avoir servi — y compris par quelqu'un qui n'est pas celui qui cuisine.
    const bips = sonnerie();
    const son = bips.reduce((a, b) => a + b.duree, 0);
    expect(son).toBeLessThan(dureeSonnerie() / 2);
  });

  test("les bips se suivent sans jamais se chevaucher", () => {
    // Deux oscillateurs qui se recouvrent ne font pas deux bips, ils font un
    // accord — et l'enveloppe du second claque dans la queue du premier.
    const bips = sonnerie();
    for (let i = 1; i < bips.length; i++)
      expect(bips[i]!.debut).toBeGreaterThanOrEqual(bips[i - 1]!.debut + bips[i - 1]!.duree);
  });

  test("le premier bip part à l'échéance, pas après", () => {
    // Les débuts sont relatifs à l'échéance : un décalage ici ferait sonner en
    // retard sans que rien ne le signale.
    expect(sonnerie()[0]!.debut).toBe(0);
  });
});

describe("ce que l'app avoue de la plateforme", () => {
  const tout: Plateforme = { son: true, bandeau: "accorde" };

  test("quand la plateforme tient tout, l'écran ne dit RIEN", () => {
    // La moitié du travail. Cet écran se lit à bout de bras et tout ce qui
    // n'est pas l'étape en cours y est du bruit : une ligne « alarme armée »
    // affichée à chaque minuteur serait lue trois fois puis jamais plus.
    expect(promesse(tout)).toBeNull();
    expect(promesse({ son: true, bandeau: "a-demander" })).toBeNull();
  });

  test("un bandeau refusé se dit, parce que ça se répare dans les réglages", () => {
    // Sur iOS un refus est définitif — il ne se redemande pas. Se taire
    // laisserait quelqu'un croire que l'app est cassée alors que c'est le
    // téléphone qui a répondu non, une fois, il y a trois semaines.
    const d = promesse({ son: true, bandeau: "refuse" });
    expect(d).toContain("sonnera");
    expect(d).toContain("réglages");
  });

  test("un bandeau absent NOMME LE GESTE QUI LE REND POSSIBLE", () => {
    // C'est le cas d'un onglet Safari : l'API n'existe que dans une app
    // installée à l'écran d'accueil. Dire « indisponible » présenterait comme
    // une fatalité ce qui est à deux touches d'être levé.
    const d = promesse({ son: true, bandeau: "absent" });
    expect(d).toContain("écran d’accueil");
  });

  test("sans son, c'est le minuteur ENTIER qui change de promesse", () => {
    // Et ça passe devant l'état du bandeau : un bandeau accordé ne rachète pas
    // une alarme muette, et promettre le bandeau seul ferait croire à une
    // alarme. L'aveu doit porter sur ce qui manque le plus.
    const d = promesse({ son: false, bandeau: "accorde" });
    expect(d).toContain("ne sait pas sonner");
    expect(promesse({ son: false, bandeau: "refuse" })).toBe(d);
  });

  test("les quatre états du bandeau ont tous une réponse", () => {
    // Un `switch` qui oublie un cas rend `undefined`, et une phrase
    // `undefined` ne s'affiche pas : la panne serait silencieuse.
    for (const b of ["accorde", "refuse", "a-demander", "absent"] as const)
      expect(promesse({ son: true, bandeau: b })).not.toBeUndefined();
  });
});
