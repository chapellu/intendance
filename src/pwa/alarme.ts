// L'alarme du minuteur — T82.
//
// LE MINUTEUR SONNE DEPUIS T12 SANS FAIRE DE BRUIT. Le modèle est sain — une
// ÉCHÉANCE et pas un compteur, écrit ainsi exprès pour survivre à un téléphone
// verrouillé — mais tout ce qu'il produisait à l'échéance était un encart
// « Minuteur terminé » : visible par quelqu'un qui regarde déjà l'écran,
// c'est-à-dire par quelqu'un qui n'a pas besoin qu'on le prévienne. Ce fichier
// est la moitié qui manquait, et ELLE SEULE — le modèle n'est pas touché.
//
// POURQUOI C'EST ICI ET PAS DANS `ecrans/`. « Quand armer » est une règle du
// minuteur et vit dans `cuisiner.vue.ts` (`aArmer`). « Comment un téléphone
// fait du bruit alors que l'app n'est plus au premier plan » est une capacité
// de plateforme, elle appartient au même dossier que le service worker et le
// manifeste, et c'est le seul endroit du dépôt qui ait le droit de connaître
// `AudioContext`.
//
// ═══ LE PROBLÈME, EN UNE PHRASE ═══
//
// Sur un iPhone, une PWA en arrière-plan ou écran verrouillé voit son JavaScript
// GELÉ. Un `setTimeout` de 30 minutes n'est donc pas une alarme : c'est une
// promesse tenue seulement dans le cas où l'on n'en avait pas besoin. Il faut
// que quelque chose d'autre que le fil JS porte l'échéance.
//
// ═══ TROIS COUCHES, TROIS RAISONS D'EXISTER ═══
//
// 1. LA SONNERIE EST PROGRAMMÉE DANS LE GRAPHE AUDIO, pas déclenchée par une
//    minuterie. `oscillateur.start(t)` est honoré par le THREAD AUDIO, qui n'est
//    pas le thread JS : les bips sont posés à l'arme, à la seconde près, et ils
//    partent même si plus une ligne de JavaScript ne s'exécute. C'est la seule
//    couche qui puisse prétendre au mot « alarme ».
//
// 2. UNE VEILLEUSE TIENT LA SORTIE AUDIO OUVERTE. Un contexte audio qui ne
//    produit rien se fait suspendre, et un contexte suspendu ne programme plus
//    rien du tout. On joue donc une boucle quasi muette pendant que le minuteur
//    court. C'EST LE COÛT DU TICKET ET IL EST RÉEL : le téléphone se croit en
//    train de lire de l'audio tant que le minuteur tourne — commandes sur
//    l'écran verrouillé, et de la musique en cours peut se faire interrompre.
//    Rien de moins cher n'a été trouvé : pour qu'un son sorte dans trente
//    minutes, la chaîne audio doit être vivante pendant ces trente minutes.
//
// 3. UN BANDEAU SYSTÈME, via le service worker, déclenché par la minuterie JS.
//    Redondant quand tout va bien, et c'est le but : il rattrape le téléphone en
//    mode silencieux, et il LAISSE UNE TRACE — revenu dix minutes plus tard, on
//    voit qu'il a sonné. Il ne remplace pas la couche 1, il ne survit pas mieux
//    qu'elle au gel.
//
// ═══ CE QUI N'EST PAS PROMIS, ET NE DOIT PAS L'ÊTRE ═══
//
// RIEN ICI NE SURVIT À UNE APP TUÉE PAR LE SYSTÈME. Si iOS récupère la mémoire
// de la PWA, les trois couches meurent ensemble et le minuteur ne préviendra
// plus — l'échéance, elle, reste en base et l'écran la retrouvera. Le seul
// mécanisme qui tienne ce cas est une notification POUSSÉE par un serveur, donc
// un serveur de push pour un minuteur de cuisine (Workspace#61 le pose comme la
// grosse réponse à la petite question). On ne l'écrit pas tant que la petite
// n'a pas été mesurée sur le téléphone.
//
// ET RIEN ICI N'A ÉTÉ MESURÉ SUR L'IPHONE DE LA MAISON. Le dépôt exige qu'une
// affirmation chiffrée se mesure avant de s'écrire ; celles de ce fichier sont
// des DÉCISIONS de conception appuyées sur le comportement documenté de WebKit,
// pas des relevés. `promesse()` existe pour que l'app dise à l'écran ce qu'elle
// sait vraiment de la plateforme sous elle, plutôt que de le supposer.

import { enregistrer } from "./maj";

/* ──────────────────────────────────────────────────────────── ce qu'on entend */

/** Un bip : quand il part après le début de la sonnerie, à quelle hauteur, et
 *  combien de temps il dure. En secondes. */
export interface Bip {
  debut: number;
  hz: number;
  duree: number;
}

const BIP = 0.18;
const BLANC = 0.22;
const VOLEE = 4;
const PAUSE = 1.4;
const VOLEES = 8;

/**
 * Le motif de la sonnerie.
 *
 * Pur, et donc lisible par un test : c'est la seule partie de ce fichier qu'on
 * puisse vérifier sans un haut-parleur. Trois décisions y sont écrites.
 *
 * DEUX HAUTEURS QUI ALTERNENT, pas une note tenue. Un son continu s'entend
 * comme un appareil en panne — le frigo, la hotte — et une cuisine apprend en
 * quelques jours à ne plus l'entendre. Deux hauteurs font un motif, et un motif
 * reste un message.
 *
 * DES BLANCS ENTRE LES VOLÉES, pas un mur de son. On doit pouvoir parler
 * par-dessus, et surtout s'entendre dire « j'arrive » : une alarme qui empêche
 * la pièce de fonctionner se fait couper avant d'avoir servi.
 *
 * VINGT-DEUX SECONDES — 32 bips, 5,8 s de son, le reste en blancs — parce
 * qu'on n'est pas dans la pièce. C'est la seule raison d'être du ticket :
 * l'encart de T12 suffisait déjà à qui regardait l'écran, et le temps de
 * revenir d'une autre pièce est le temps qu'il faut tenir.
 * Elle s'éteint ensuite toute seule — une alarme qu'on doit courir arrêter est
 * une alarme qu'on désarme le lendemain.
 */
export function sonnerie(): Bip[] {
  const bips: Bip[] = [];
  const cycle = VOLEE * (BIP + BLANC) + PAUSE;
  for (let v = 0; v < VOLEES; v++)
    for (let n = 0; n < VOLEE; n++)
      bips.push({
        debut: v * cycle + n * (BIP + BLANC),
        hz: n % 2 ? 1046.5 : 880,
        duree: BIP,
      });
  return bips;
}

/** Combien de temps la sonnerie occupe, du premier bip au dernier silence. */
export function dureeSonnerie(): number {
  const bips = sonnerie();
  const dernier = bips[bips.length - 1]!;
  return dernier.debut + dernier.duree;
}

/* ─────────────────────────────────────────────── ce que la plateforme permet */

/** Ce que le téléphone sous l'app sait faire — relevé, pas supposé. */
export interface Plateforme {
  /** Un contexte audio existe : sans lui, aucune des trois couches ne sonne. */
  son: boolean;
  /** L'état du bandeau système. `absent` = l'API n'existe pas ici, ce qui sur
   *  iOS veut dire « ouvert dans un onglet et pas installé à l'écran d'accueil ». */
  bandeau: "accorde" | "refuse" | "a-demander" | "absent";
}

/**
 * Ce que l'app peut annoncer, en une phrase — ou rien du tout.
 *
 * C'EST LA DOCTRINE DE T78 APPLIQUÉE À UNE CAPACITÉ. « On ne retire pas une
 * proposition pour une lacune, on l'annonce » : ici la lacune n'est pas dans le
 * corpus mais sous l'app, et la mauvaise réponse serait la même — cacher le
 * minuteur là où il ne peut pas sonner, ou pire, le laisser promettre une
 * alarme que le téléphone n'a pas.
 *
 * MUETTE QUAND TOUT VA BIEN, et c'est la moitié du travail. Cet écran se lit à
 * bout de bras, tout ce qui n'est pas l'étape en cours y est du bruit : une
 * ligne qui dirait « l'alarme est armée » à chaque minuteur serait lue trois
 * fois puis jamais plus, et elle aurait coûté deux lignes de l'étape.
 *
 * LE CAS `absent` NOMME LE GESTE QUI LE RÉPARE. Sur iOS, l'API des
 * notifications n'existe QUE dans une app installée à l'écran d'accueil ; dire
 * « les notifications ne sont pas disponibles » laisserait l'utilisateur devant
 * une fatalité alors qu'il est à deux touches de la lever.
 */
export function promesse(p: Plateforme): string | null {
  if (!p.son) return "Ce navigateur ne sait pas sonner — le minuteur ne prévient qu’à l’écran.";
  if (p.bandeau === "refuse")
    return "Elle sonnera, sans bandeau : les notifications sont refusées dans les réglages du téléphone.";
  if (p.bandeau === "absent")
    return "Elle sonnera, sans bandeau : installe l’app à l’écran d’accueil pour avoir les notifications.";
  return null;
}

/** Le relevé, côté navigateur. Ne rend jamais d'exception : appelée pendant un
 *  rendu, sur des API que la moitié des navigateurs n'ont pas. */
export function plateforme(): Plateforme {
  const son =
    typeof window !== "undefined" &&
    !!(window.AudioContext ?? (window as Fenetre).webkitAudioContext);
  if (typeof Notification === "undefined") return { son, bandeau: "absent" };
  const p = Notification.permission;
  return { son, bandeau: p === "granted" ? "accorde" : p === "denied" ? "refuse" : "a-demander" };
}

/**
 * Demander le bandeau — À APPELER DANS LE GESTE, jamais ailleurs.
 *
 * iOS refuse `requestPermission()` hors d'une interaction, et un refus par
 * défaut d'iOS est DÉFINITIF : il ne se redemande pas, il se répare dans les
 * réglages du téléphone. D'où le moment choisi : le premier doigt sur le
 * minuteur, où la question a une réponse évidente, et pas à l'ouverture de
 * l'app, où elle ressemblerait à une quête de permission.
 */
export function demanderBandeau(): void {
  if (typeof Notification === "undefined" || Notification.permission !== "default") return;
  void Notification.requestPermission();
}

/* ─────────────────────────────────────────────────────────── l'armement */

interface Armee {
  /** L'échéance, en horloge murale. C'est elle qui rend `armer` idempotente. */
  fin: number;
  noeuds: AudioScheduledSourceNode[];
  minuteries: ReturnType<typeof setTimeout>[];
}

type Fenetre = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
type Session = Navigator & { audioSession?: { type: string } };

const armees = new Map<string, Armee>();
let ctx: AudioContext | null = null;
let veilleuse: HTMLAudioElement | null = null;
let urlVeilleuse: string | null = null;

/**
 * Armer l'alarme d'un minuteur.
 *
 * `avecSon` DIT SI L'APPEL VIENT D'UN DOIGT. Programmer du son exige un geste
 * — c'est la politique d'autoplay, et elle ne se contourne pas —, mais le
 * bandeau, lui, n'en demande aucun : au remontage de l'écran sur un minuteur
 * qui courait déjà (l'app rouverte, la page rechargée), on arme ce qu'on peut
 * plutôt que rien. Une alarme à moitié vaut mieux qu'un silence complet, à
 * condition que `promesse()` ne prétende pas le contraire.
 *
 * IDEMPOTENTE SUR L'ÉCHÉANCE. Le même minuteur est armé par le geste PUIS par
 * l'effet de montage qui le voit courir ; sans ce garde-fou, le second appel
 * désarmerait les bips que le premier venait de programmer, et l'alarme
 * n'existerait que dans le cas où personne ne regarde.
 */
export function armer(cle: string, fin: number, avecSon: boolean): void {
  if (armees.get(cle)?.fin === fin) return;
  desarmer(cle);

  const dans = fin - Date.now();
  if (dans <= 0) return;

  const a: Armee = { fin, noeuds: [], minuteries: [] };
  const c = avecSon ? ouvrir() : ctx;
  if (c) {
    a.noeuds = programmer(c, dans / 1000);
    if (avecSon) veiller();
  }

  a.minuteries.push(setTimeout(() => void bandeau(cle), dans));
  // La veilleuse s'éteint quand la sonnerie a fini de sonner : une boucle
  // muette laissée tourner toute la nuit tiendrait la sortie audio du téléphone
  // en otage pour un minuteur que plus personne n'attend.
  a.minuteries.push(setTimeout(() => arreter(), dans + dureeSonnerie() * 1000 + 500));
  armees.set(cle, a);
}

/** Le minuteur a été mis en pause, relancé, ou n'a plus lieu d'être. */
export function desarmer(cle: string): void {
  const a = armees.get(cle);
  if (!a) return;
  taire(a);
  armees.delete(cle);
  if (!armees.size) eteindre();
}

/**
 * Faire taire ce qui sonne MAINTENANT, sans toucher à ce qui est encore armé.
 *
 * Deux minuteurs peuvent courir ensemble — c'est même la situation normale
 * d'une recette à étapes parallèles. Tout couper au premier « Arrêter »
 * emporterait l'alarme du second, silencieusement, et ce genre de perte ne se
 * remarque qu'une fois le plat brûlé.
 */
export function arreter(): void {
  const maintenant = Date.now();
  for (const [cle, a] of armees)
    if (a.fin <= maintenant) {
      taire(a);
      armees.delete(cle);
    }
  if (!armees.size) eteindre();
}

function taire(a: Armee): void {
  for (const m of a.minuteries) clearTimeout(m);
  for (const n of a.noeuds) {
    // `stop()` sur un nœud programmé mais pas encore parti l'annule ; sur un
    // nœud déjà fini, il lève. Les deux cas arrivent dans la même boucle.
    try {
      n.stop();
    } catch {
      /* déjà terminé */
    }
    n.disconnect();
  }
}

/* ────────────────────────────────────────────────────────────── le graphe */

function ouvrir(): AudioContext | null {
  const F = window.AudioContext ?? (window as Fenetre).webkitAudioContext;
  if (!F) return null;
  ctx ??= new F();
  // Un contexte créé hors geste naît suspendu, et un contexte suspendu ne
  // programme rien : on le réveille à chaque armement plutôt qu'une fois pour
  // toutes, parce qu'iOS le rendort de son côté à chaque interruption.
  void ctx.resume();
  // Safari 16.4+ : dire que c'est de la LECTURE et pas de l'ambiance. C'est ce
  // qui autorise le son écran verrouillé et lui fait ignorer l'interrupteur de
  // sonnerie — et c'est aussi ce qui peut interrompre la musique en cours.
  // Pour une alarme de cuisine, se taire parce qu'un interrupteur physique est
  // sur « silencieux » serait la pire des deux erreurs.
  const s = navigator as Session;
  if (s.audioSession) s.audioSession.type = "playback";
  return ctx;
}

/** Les bips, posés dans le graphe à l'instant de l'armement. Le thread audio
 *  les tiendra sans nous. */
function programmer(c: AudioContext, dans: number): AudioScheduledSourceNode[] {
  const t0 = c.currentTime + dans;
  const sortie = c.createGain();
  sortie.gain.value = 0.9;
  sortie.connect(c.destination);

  return sonnerie().map(({ debut, hz, duree }) => {
    const t = t0 + debut;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = hz;
    // Une enveloppe et non un créneau : un signal qui démarre à pleine
    // amplitude claque dans le haut-parleur, et le claquement s'entend plus
    // que la note.
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.012);
    g.gain.setValueAtTime(1, t + duree - 0.012);
    g.gain.linearRampToValueAtTime(0, t + duree);
    o.connect(g);
    g.connect(sortie);
    o.start(t);
    o.stop(t + duree + 0.02);
    return o;
  });
}

function veiller(): void {
  if (veilleuse) return;
  urlVeilleuse ??= URL.createObjectURL(quasiSilence());
  const a = new Audio(urlVeilleuse);
  a.loop = true;
  // Sans ça, iOS peut traiter la lecture comme un média à afficher.
  a.setAttribute("playsinline", "");
  void a.play().catch(() => {
    // Refusée par la politique d'autoplay : la sonnerie programmée reste, elle,
    // valide tant que l'app ne passe pas en arrière-plan. On ne casse rien.
    veilleuse = null;
  });
  veilleuse = a;
}

function eteindre(): void {
  veilleuse?.pause();
  veilleuse = null;
}

/**
 * Une seconde de presque-silence, bouclée : le carburant de la veilleuse.
 *
 * PRESQUE, ET PAS TOUT À FAIT. Le signal vaut ±1 sur 32 768, c'est-à-dire
 * −90 dBFS — inaudible sur n'importe quel haut-parleur — mais ce n'est pas du
 * silence NUMÉRIQUE, et c'est délibéré : une piste d'octets nuls est ce qu'une
 * pile audio a le plus de raisons d'optimiser, et une lecture optimisée ne tient
 * plus rien ouvert. Précaution de conception, pas mesure.
 *
 * FABRIQUÉE ICI ET PAS LIVRÉE DANS `public/`. Le service worker précache
 * l'ENSEMBLE FINI du build ; un fichier audio de plus y entrerait pour cent
 * octets de contenu utile. Quarante lignes de RIFF coûtent moins que ça, et
 * elles ne peuvent pas manquer hors ligne.
 */
function quasiSilence(): Blob {
  const taux = 8000;
  const n = taux;
  const o = new ArrayBuffer(44 + n * 2);
  const v = new DataView(o);
  const texte = (pos: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(pos + i, s.charCodeAt(i));
  };
  texte(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  texte(8, "WAVEfmt ");
  v.setUint32(16, 16, true); // taille du bloc de format
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, taux, true);
  v.setUint32(28, taux * 2, true); // octets par seconde
  v.setUint16(32, 2, true); // octets par trame
  v.setUint16(34, 16, true); // bits par échantillon
  texte(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i % 2 ? 1 : -1, true);
  return new Blob([o], { type: "audio/wav" });
}

/* ───────────────────────────────────────────────────────────── le bandeau */

/**
 * Le bandeau système, par le service worker.
 *
 * PAR LE WORKER ET PAS PAR `new Notification()` : iOS ne connaît que celui-ci.
 * `enregistrer()` rend `null` en développement — le worker y est délibérément
 * désinscrit — et le bandeau y est donc muet, ce qui est le bon comportement :
 * la couche qui s'y teste est la sonnerie.
 */
async function bandeau(cle: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const r = await enregistrer();
  await r?.showNotification("Minuteur terminé", {
    body: "C’est prêt — reviens à l’étape en cours.",
    // Le `tag` remplace au lieu d'empiler : relancer trois fois le même minuteur
    // ne doit pas laisser trois bandeaux à balayer.
    tag: `minuteur|${cle}`,
    icon: "/icones/icone-192.png",
    // Il reste jusqu'à ce qu'on le touche. C'est tout l'intérêt : revenu dix
    // minutes plus tard, on doit voir QUE ça a sonné, pas le deviner.
    requireInteraction: true,
  } as NotificationOptions);
}
