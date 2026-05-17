/**
 * ZIG-ON — Polling Rate Analyzer
 * polling-script.js
 *
 * Diagnostic engine: CPU interrupt load × game engine compatibility
 * → computes a stutter risk score and renders the full diagnostic UI.
 */

'use strict';

const $ = id => document.getElementById(id);

/* ═══════════════════════════════════════════════
   KNOWLEDGE BASE
   Each matrix entry defines:
     cpuInterruptScore  : 0–100 (how hard polling stresses the CPU ISR)
     engineCompat       : 0–100 (how well the game engine handles this rate)
     precisionGain      : 0–100 (real perceptible precision benefit)
     stutterRisk        : 0–100 (derived stutter risk)
     headline           : short diagnosis title
     body               : detailed explanation
     recos              : array of { icon, text } action items
═══════════════════════════════════════════════ */

const GAME_META = {
  valorant: {
    label:   'VALORANT',
    engine:  'Unreal Engine 4',
    chips:   ['Moteur : UE4', 'Tickrate 128 Hz', 'Bon support hauts PR'],
  },
  cs2: {
    label:   'CS2',
    engine:  'Source 2',
    chips:   ['Moteur : Source 2', 'Sensible aux interruptions', 'Valve conseille 1000 Hz'],
  },
  apex: {
    label:   'Apex Legends',
    engine:  'Source Engine (modifié)',
    chips:   ['Moteur : Source mod.', 'High-perf mode requis', 'Gain PR limité'],
  },
};

/**
 * Main scoring matrix.
 * Structure: MATRIX[game][cpu][polling]
 * cpuScore: 0=aucune charge → 100=charge maximale (inversé = charge CPU)
 * engineCompat: 0=incompatible → 100=parfait
 * precisionGain: 0=nul → 100=maximal
 */
const MATRIX = {
  valorant: {
    low: {
       500: { cpuLoad:15, engineCompat:90, precisionGain:55, stutterRisk:12 },
      1000: { cpuLoad:22, engineCompat:98, precisionGain:70, stutterRisk:15 },
      2000: { cpuLoad:40, engineCompat:82, precisionGain:82, stutterRisk:35 },
      4000: { cpuLoad:65, engineCompat:60, precisionGain:88, stutterRisk:62 },
      8000: { cpuLoad:88, engineCompat:38, precisionGain:90, stutterRisk:85 },
    },
    mid: {
       500: { cpuLoad:10, engineCompat:90, precisionGain:55, stutterRisk: 8 },
      1000: { cpuLoad:15, engineCompat:98, precisionGain:70, stutterRisk:10 },
      2000: { cpuLoad:25, engineCompat:88, precisionGain:82, stutterRisk:20 },
      4000: { cpuLoad:42, engineCompat:72, precisionGain:88, stutterRisk:38 },
      8000: { cpuLoad:65, engineCompat:50, precisionGain:90, stutterRisk:58 },
    },
    high: {
       500: { cpuLoad: 6, engineCompat:90, precisionGain:55, stutterRisk: 5 },
      1000: { cpuLoad: 9, engineCompat:98, precisionGain:70, stutterRisk: 7 },
      2000: { cpuLoad:16, engineCompat:92, precisionGain:82, stutterRisk:12 },
      4000: { cpuLoad:28, engineCompat:82, precisionGain:88, stutterRisk:22 },
      8000: { cpuLoad:44, engineCompat:68, precisionGain:90, stutterRisk:36 },
    },
  },
  cs2: {
    low: {
       500: { cpuLoad:12, engineCompat:78, precisionGain:50, stutterRisk:18 },
      1000: { cpuLoad:20, engineCompat:85, precisionGain:65, stutterRisk:22 },
      2000: { cpuLoad:42, engineCompat:55, precisionGain:76, stutterRisk:52 },
      4000: { cpuLoad:70, engineCompat:32, precisionGain:82, stutterRisk:80 },
      8000: { cpuLoad:92, engineCompat:15, precisionGain:84, stutterRisk:95 },
    },
    mid: {
       500: { cpuLoad: 8, engineCompat:78, precisionGain:50, stutterRisk:12 },
      1000: { cpuLoad:14, engineCompat:88, precisionGain:65, stutterRisk:14 },
      2000: { cpuLoad:28, engineCompat:65, precisionGain:76, stutterRisk:35 },
      4000: { cpuLoad:50, engineCompat:42, precisionGain:82, stutterRisk:60 },
      8000: { cpuLoad:75, engineCompat:22, precisionGain:84, stutterRisk:80 },
    },
    high: {
       500: { cpuLoad: 5, engineCompat:78, precisionGain:50, stutterRisk: 8 },
      1000: { cpuLoad: 8, engineCompat:90, precisionGain:65, stutterRisk:10 },
      2000: { cpuLoad:16, engineCompat:72, precisionGain:76, stutterRisk:20 },
      4000: { cpuLoad:30, engineCompat:55, precisionGain:82, stutterRisk:38 },
      8000: { cpuLoad:50, engineCompat:38, precisionGain:84, stutterRisk:55 },
    },
  },
  apex: {
    low: {
       500: { cpuLoad:13, engineCompat:82, precisionGain:48, stutterRisk:14 },
      1000: { cpuLoad:21, engineCompat:88, precisionGain:62, stutterRisk:18 },
      2000: { cpuLoad:38, engineCompat:65, precisionGain:72, stutterRisk:42 },
      4000: { cpuLoad:62, engineCompat:45, precisionGain:78, stutterRisk:68 },
      8000: { cpuLoad:85, engineCompat:25, precisionGain:80, stutterRisk:88 },
    },
    mid: {
       500: { cpuLoad: 9, engineCompat:82, precisionGain:48, stutterRisk:10 },
      1000: { cpuLoad:14, engineCompat:90, precisionGain:62, stutterRisk:12 },
      2000: { cpuLoad:24, engineCompat:72, precisionGain:72, stutterRisk:26 },
      4000: { cpuLoad:44, engineCompat:52, precisionGain:78, stutterRisk:48 },
      8000: { cpuLoad:68, engineCompat:32, precisionGain:80, stutterRisk:72 },
    },
    high: {
       500: { cpuLoad: 5, engineCompat:82, precisionGain:48, stutterRisk: 6 },
      1000: { cpuLoad: 8, engineCompat:92, precisionGain:62, stutterRisk: 8 },
      2000: { cpuLoad:14, engineCompat:78, precisionGain:72, stutterRisk:14 },
      4000: { cpuLoad:26, engineCompat:60, precisionGain:78, stutterRisk:28 },
      8000: { cpuLoad:44, engineCompat:42, precisionGain:80, stutterRisk:46 },
    },
  },
};

/* Diagnostic text database */
const DIAG_DB = {
  // [game][cpu][polling] → { headline, body, recos[] }
  valorant: {
    low: {
      500:  {
        headline: 'Config sécurisée mais sous-optimale',
        body: 'À 500 Hz avec ton CPU, la souris envoie <strong>2 rapports/ms</strong> — UE4 peut gérer ça sans souci. Mais tu laisses de la précision sur la table.',
        recos: [
          { icon: '⬆️', text: '<strong>Monte à 1000 Hz</strong> : gain de précision significatif, charge CPU toujours très acceptable pour ton CPU.' },
          { icon: '🎯', text: 'Si tu joues en DM pour progresser, 1000 Hz te donnera des positions de crosshair plus fidèles à tes mouvements.' },
          { icon: '🔧', text: 'Active <strong>HPET</strong> dans ton BIOS pour stabiliser le timer système et réduire la latence d\'entrée.' },
        ],
      },
      1000: {
        headline: 'Config optimale pour ton profil',
        body: 'Le combo 1000 Hz + CPU entrée de gamme + VALORANT est le point idéal. UE4 poll les inputs à chaque tick de frame, et 1 ms d\'intervalle correspond parfaitement à ce cycle.',
        recos: [
          { icon: '✅', text: '<strong>Ne change rien</strong> : c\'est la configuration de référence pour ton setup.' },
          { icon: '🖥️', text: 'Assure-toi de jouer à <strong>minimum 240 FPS</strong> (cap à 400 FPS recommandé) pour que le tickrate UE4 soit pleinement exploité.' },
          { icon: '📉', text: 'Désactive <strong>GameDVR</strong> et <strong>Xbox Game Bar</strong> via les paramètres Windows pour réduire la charge CPU en jeu.' },
        ],
      },
      2000: {
        headline: 'Risque modéré — surveille tes FPS',
        body: 'Ton CPU commence à gérer <strong>2000 interruptions/seconde</strong> au lieu de 1000. Sur un CPU ancien, ça peut créer des micro-freezes de 0.5–1 ms par intervalle de 100 ms, perceptibles lors des flicks.',
        recos: [
          { icon: '⬇️', text: '<strong>Redescends à 1000 Hz</strong> si tu observes des stutters ou des drops de FPS pendant les duels.' },
          { icon: '⚙️', text: 'Utilise <strong>Process Lasso</strong> pour assigner un cœur CPU dédié au processus VALORANT et réduire la contention.' },
          { icon: '🔁', text: 'Compare tes frames times avec <strong>RTSS</strong> (RivaTuner) entre 1000 Hz et 2000 Hz sur 30 minutes de jeu.' },
        ],
      },
      4000: {
        headline: 'Risque élevé — stutter probable',
        body: 'À 4000 Hz, ton CPU reçoit <strong>4 000 interruptions souris par seconde</strong>. Sur un CPU entrée de gamme, le coût ISR (Interrupt Service Routine) peut monopoliser entre 5 et 15 % d\'un cœur CPU, créant des frame time spikes visibles.',
        recos: [
          { icon: '🚨', text: '<strong>Baisse immédiatement à 1000 Hz</strong>. Le gain de précision réel de 4000 Hz est &lt; 2% pour la majorité des joueurs.' },
          { icon: '🖱️', text: 'Certaines souris (ex: Razer) ont un <strong>mode 4000 Hz optimisé</strong> avec du hardware-side buffering. Vérifie les drivers de ta souris.' },
          { icon: '📊', text: 'Teste avec <strong>CapFrameX</strong> pour analyser tes frame times : un 99th percentile élevé confirme le stutter CPU-bound.' },
        ],
      },
      8000: {
        headline: '⛔ Configuration incompatible',
        body: 'À 8000 Hz sur un CPU entrée de gamme + VALORANT, tu génères <strong>8 000 interruptions/seconde</strong>. Le scheduler Windows NT ne peut pas traiter ça en dessous de la latence d\'un tick (15.6 ms par défaut). Résultat : des freezes répétés, une courbe de frame time en dents de scie, et paradoxalement une <em>moins bonne</em> précision que à 1000 Hz.',
        recos: [
          { icon: '🔴', text: '<strong>Reviens à 1000 Hz de toute urgence.</strong> Cette config dégrade activement ton expérience de jeu.' },
          { icon: '💻', text: 'Si tu veux explorer les hauts PR, envisage une <strong>upgrade CPU vers un Ryzen 5 7600X</strong> minimum.' },
          { icon: '🛠️', text: 'En attendant, configure le <strong>timer résolution à 0.5 ms</strong> avec TimerResolution.exe pour atténuer le problème de scheduler.' },
        ],
      },
    },
    mid: {
      500:  {
        headline: 'Config sûre, petit potentiel inexploité',
        body: 'Ton CPU milieu de gamme gère 500 Hz sans aucune difficulté. La charge d\'interruption est négligeable. Tu peux monter sans risque.',
        recos: [
          { icon: '⬆️', text: '<strong>Monte à 1000–2000 Hz</strong> : gain de précision réel, risque stutter quasi nul avec ton CPU.' },
          { icon: '🎮', text: 'Sur VALORANT, jusqu\'à 2000 Hz le moteur UE4 tire pleinement parti des rapports supplémentaires.' },
        ],
      },
      1000: {
        headline: 'Point de référence — config parfaite',
        body: 'Le trio 1000 Hz + CPU mid-range + VALORANT est la combinaison la plus validée dans la scène esport pro. Aucun risque de stutter, précision excellente.',
        recos: [
          { icon: '✅', text: '<strong>Config validée.</strong> Concentre-toi sur la sensibilité et le Raw Accel plutôt que le polling rate.' },
          { icon: '📈', text: 'Si tu veux expérimenter, <strong>2000 Hz</strong> est sûr sur ton CPU — observe les frame times pendant une session.' },
        ],
      },
      2000: {
        headline: 'Config valide, léger overhead CPU',
        body: 'À 2000 Hz, ton CPU milieu de gamme gère sans problème majeur. Environ <strong>3–5% de charge CPU supplémentaire</strong> sur le cœur traitant les interruptions HID. Sur UE4, le gain est marginal mais réel pour des mouvements très rapides.',
        recos: [
          { icon: '✅', text: 'Cette config est viable. Surveille simplement tes frame times les 10 premières minutes.' },
          { icon: '🔧', text: 'Assigne la <strong>priorité haute</strong> au processus VALORANT via le Task Manager pour optimiser la réactivité.' },
          { icon: '📊', text: 'Le vrai test : active <strong>cl_showfps 1</strong> et compare ta frame time variance entre 1000 et 2000 Hz.' },
        ],
      },
      4000: {
        headline: 'Risque modéré — test recommandé',
        body: 'À 4000 Hz, même un bon CPU commence à ressentir la pression des interruptions souris. Sur VALORANT, l\'impact reste <strong>contenu (7–12% d\'un cœur)</strong>, mais un pic de charge peut provoquer des frame drops ponctuels sur des passages denses.',
        recos: [
          { icon: '⚠️', text: '<strong>Teste activement</strong> avec CapFrameX sur une session de 20 minutes. Si le 99th percentile frame time dépasse 8 ms, descends à 2000 Hz.' },
          { icon: '🖱️', text: 'Assure-toi que ta souris a un <strong>firmware récent</strong> optimisant le 4000 Hz (ex: Logitech G Pro X Superlight 2 v4+).' },
          { icon: '🎯', text: 'Le gain de précision réel entre 2000 et 4000 Hz sur VALORANT est estimé à <strong>moins de 0.5%</strong> pour les joueurs en dessous du niveau pro.' },
        ],
      },
      8000: {
        headline: 'Risque élevé — stutter possible en compétitif',
        body: 'À 8000 Hz sur un CPU mid-range, tu gères <strong>8 000 interruptions/seconde</strong>. UE4 peut absorber une partie de ce flux, mais des coups de charge CPU créeront des micro-stutters lors des moments les plus intenses (grenades, teamfights). Pas rédhibitoire, mais pas optimal.',
        recos: [
          { icon: '⬇️', text: '<strong>Recommandé : redescends à 2000–4000 Hz</strong> pour le même gain de précision avec moins de risque stutter.' },
          { icon: '⚙️', text: 'Si tu gardes 8000 Hz, configure <strong>RTSS FastCapture</strong> pour limiter les FPS et stabiliser le frame budget.' },
          { icon: '🖥️', text: 'Active le <strong>mode haute performance</strong> dans le panneau de gestion d\'alimentation Windows pour éviter les P-states CPU qui aggravent la latence d\'interruption.' },
        ],
      },
    },
    high: {
      500:  {
        headline: 'CPU sur-dimensionné pour 500 Hz',
        body: 'Tu as un CPU haut de gamme qui sous-exploite ta souris à 500 Hz. La précision est correcte mais ton hardware peut aller bien plus loin.',
        recos: [
          { icon: '⬆️', text: '<strong>Monte à 2000–4000 Hz</strong> sans aucune hésitation. Ton CPU absorbera l\'overhead sans broncher.' },
          { icon: '🚀', text: 'Tu peux même tester <strong>8000 Hz</strong> si ta souris le supporte — risque minimal avec ton setup.' },
        ],
      },
      1000: {
        headline: 'Config solide, potentiel sous-utilisé',
        body: 'Ton CPU haut de gamme handle les 1000 Hz avec une <strong>charge inférieure à 1%</strong>. Tu peux monter très confortablement.',
        recos: [
          { icon: '⬆️', text: 'Monte à <strong>4000 Hz</strong> pour un gain de précision notable sans aucun risque.' },
          { icon: '🎮', text: 'Sur VALORANT, 4000 Hz + i9/Ryzen 9 est la setup sweet spot recommandée par les joueurs pro.' },
        ],
      },
      2000: {
        headline: 'Excellent point d\'équilibre',
        body: 'Ton CPU gère les 2000 Hz avec une charge CPU d\'interruption <strong>inférieure à 3%</strong> sur le cœur HID. VALORANT exploite bien ce polling rate.',
        recos: [
          { icon: '✅', text: '<strong>Config solide</strong>. Tu peux rester ici ou monter à 4000 Hz selon ta souris.' },
          { icon: '📈', text: 'À 4000 Hz tu verras un gain sur des micro-ajustements de visée très précis (sub-pixel tracking).' },
        ],
      },
      4000: {
        headline: 'Config pro — charge maîtrisée',
        body: 'Ton CPU haut de gamme traite les <strong>4000 interruptions/seconde</strong> avec un overhead de ~4-6% sur un cœur dédié. Sur VALORANT avec UE4, cette config est clean et correspond au setup de plusieurs joueurs VCT.',
        recos: [
          { icon: '✅', text: '<strong>Config validée</strong> pour la compétition. Reste sur ce polling rate.' },
          { icon: '🖱️', text: 'Vérifie que ta souris a un <strong>mode 4K Hz sans interpolation</strong> (certaines souris upscalent depuis 2K Hz côté firmware).' },
          { icon: '🔬', text: 'Le gain sur 8000 Hz est négligeable sur VALORANT — reste à 4000 Hz, ton CPU travaille encore en zone confort.' },
        ],
      },
      8000: {
        headline: 'Config ambitieuse — résultats variés',
        body: 'Ton CPU haut de gamme absorbe les 8000 Hz avec une charge d\'environ <strong>8–12%</strong> sur le cœur d\'interruption. C\'est gérable, mais le gain réel sur VALORANT reste théorique : le moteur UE4 tick à ~120–240 Hz selon les serveurs, ce qui plafonne l\'utilité des rapports ultra-fréquents.',
        recos: [
          { icon: '🟡', text: '<strong>Viable mais pas le meilleur investissement.</strong> Le sweet spot sur ton CPU + VALORANT est 4000 Hz.' },
          { icon: '🔬', text: 'Si tu restes à 8000 Hz, utilise <strong>MouseTester</strong> pour valider que ta souris produit vraiment 8K rapports distincts et non interpolés.' },
          { icon: '⚙️', text: 'Configure le <strong>DPC Latency Checker</strong> pour vérifier que tes drivers ne génèrent pas de latences parasites à 8000 Hz.' },
        ],
      },
    },
  },

  cs2: {
    low: {
      500:  {
        headline: 'Config correcte pour CS2 / CPU ancien',
        body: 'CS2 sur Source 2 est sensible aux hauts polling rates. À 500 Hz, ton CPU est totalement à l\'aise — aucune interruption parasite. La précision reste bonne.',
        recos: [
          { icon: '✅', text: '<strong>Config sécurisée</strong>. Pour CS2 avec un CPU ancien, reste entre 500 et 1000 Hz.' },
          { icon: '📌', text: 'Active <strong>+cl_showfps 1</strong> dans la console pour surveiller ta frame time variance en jeu.' },
        ],
      },
      1000: {
        headline: 'Polling rate optimal pour ton profil CS2',
        body: 'Valve recommande officiellement <strong>1000 Hz maximum</strong> pour CS2. Avec ton CPU entrée de gamme, c\'est exactement le plafond à ne pas dépasser. Précision maximale, risque stutter minimal.',
        recos: [
          { icon: '✅', text: '<strong>C\'est la limite recommandée</strong> pour ton CPU sur CS2. Ne monte pas plus haut.' },
          { icon: '🔧', text: 'Désactive <strong>mouse acceleration</strong> dans les paramètres Windows (Pointer Precision) pour éviter un doublon avec Raw Accel.' },
          { icon: '⚙️', text: 'Configure <strong>fps_max 0</strong> dans CS2 mais capluffe à 400 FPS via RTSS pour stabiliser les frames.' },
        ],
      },
      2000: {
        headline: '⚠️ Risque élevé — CS2 + CPU ancien',
        body: 'Le moteur Source 2 de CS2 traite chaque rapport souris dans sa game loop principale. À 2000 Hz sur un CPU ancien, cette boucle est perturbée <strong>deux fois plus souvent</strong>, créant des frame time spikes de 1–3 ms visibles à l\'écran lors des duels.',
        recos: [
          { icon: '🔴', text: '<strong>Baisse à 1000 Hz immédiatement</strong>. Le gain est nul et le risque est bien réel.' },
          { icon: '📊', text: 'Lance CS2 avec <strong>-tickrate 128</strong> et observe tes frame times avec CapFrameX entre 1K et 2K Hz.' },
          { icon: '🛠️', text: 'Si tu veux tester, fais-le en <strong>Workshop DM map</strong> (pas en compétitif) pour éviter d\'impacter ta rank.' },
        ],
      },
      4000: {
        headline: '🔴 Configuration dangereuse — CS2',
        body: 'À 4000 Hz + CPU ancien sur CS2 : scénario catastrophique. Le moteur Source 2 génère un <strong>spike CPU à chaque rapport souris</strong>. Sur 4000 rapports/seconde, ton CPU passe plus de temps à traiter des interruptions souris qu\'à calculer les frames. Résultat : FPS drops, freezes courts, péjoration de l\'aim.',
        recos: [
          { icon: '🚨', text: '<strong>Baisse à 1000 Hz de toute urgence.</strong> Cette config est une des pires combinaisons possibles pour CS2.' },
          { icon: '💻', text: 'Pour jouer à 4000 Hz sur CS2, tu as besoin minimum d\'un <strong>i5-12600K / Ryzen 5 5600X</strong>.' },
          { icon: '📉', text: 'Selon les tests de la communauté, cette config peut causer jusqu\'à <strong>40% de frame time spike supplémentaire</strong> par rapport à 1000 Hz.' },
        ],
      },
      8000: {
        headline: '⛔ INCOMPATIBLE — Stutter garanti',
        body: 'C\'est la pire combinaison de l\'outil. CS2 sur Source 2 + CPU ancien + 8000 Hz = <strong>stutter systématique</strong>. Le coût d\'interruption HID dépasse la capacité de traitement du scheduler Windows sur ce tier CPU. Des freezes de 5–15 ms se produiront toutes les 50–100 ms, rendant le jeu injouable au niveau compétitif.',
        recos: [
          { icon: '🔴', text: '<strong>Reviens à 1000 Hz immédiatement.</strong> Ce n\'est pas négociable.' },
          { icon: '🚫', text: '8000 Hz + CS2 + CPU entrée de gamme est documenté comme problématique dans les rapports Valve et les benchmarks communautaires.' },
          { icon: '💡', text: 'Si tu veux tester le 8000 Hz, commence par upgader ton CPU. Minimum : <strong>Intel Core i7-13700K ou Ryzen 9 7900X</strong>.' },
        ],
      },
    },
    mid: {
      500:  {
        headline: 'Config sûre mais conservative',
        body: '500 Hz sur CS2 avec un CPU mid-range est totalement safe. Peut-être un peu conservateur — ton CPU peut gérer 1000 Hz sans aucun problème sur Source 2.',
        recos: [
          { icon: '⬆️', text: '<strong>Monte à 1000 Hz</strong> pour atteindre le polling rate recommandé par Valve.' },
          { icon: '🎮', text: 'Sur CS2, 1000 Hz correspond au tickrate natif des serveurs compétitifs 128-tick.' },
        ],
      },
      1000: {
        headline: 'Config de référence — validée pour CS2',
        body: 'Polling rate officieusement recommandé par Valve. Ton CPU milieu de gamme traite ces interruptions sans effort. C\'est la configuration jouée par <strong>90% des pros CS2</strong>.',
        recos: [
          { icon: '✅', text: '<strong>Config parfaite</strong>. Ne change rien au polling rate.' },
          { icon: '🎯', text: 'Concentre tes optimisations sur le <strong>in-game sens et le crosshair placement</strong> plutôt que le hardware.' },
          { icon: '🔧', text: 'Utilise <strong>cs2 -novid -high -threads X</strong> dans les launch options (X = nombre de cores logiques).' },
        ],
      },
      2000: {
        headline: 'Risque modéré — surveille les frame times',
        body: 'CS2 gère mal les hauts polling rates comparé à d\'autres moteurs. À 2000 Hz sur un CPU mid-range, tu es dans la <strong>zone grise</strong> : certains CPUs absorbent bien, d\'autres montrent des frame time spikes sur les maps denses.',
        recos: [
          { icon: '⚠️', text: '<strong>Teste précisément</strong> : lance CS2, active les frame times via RTSS, compare 1000 Hz et 2000 Hz sur Dust 2 en DM.' },
          { icon: '⬇️', text: 'Si ton 99th percentile frame time augmente de plus de <strong>2 ms</strong> à 2000 Hz, descends à 1000 Hz.' },
          { icon: '🛠️', text: 'Active le mode <strong>High Performance</strong> dans Windows et désactive Core Parking pour stabiliser les interruptions.' },
        ],
      },
      4000: {
        headline: 'Risque élevé — CS2 + 4000 Hz',
        body: 'Sur Source 2, 4000 Hz crée un goulot d\'étranglement dans le thread principal de CS2. Même sur un CPU mid-range, les <strong>frame time spikes sont documentés</strong> : des pics à 8–15 ms peuvent apparaître en match compétitif.',
        recos: [
          { icon: '🔴', text: '<strong>Baisse à 1000–2000 Hz</strong> pour CS2. Le gain de précision de 4000 Hz ne compense pas le risque stutter.' },
          { icon: '📊', text: 'Teste avec <strong>CapFrameX</strong> sur une session de 20 minutes et compare les histogrammes de frame time.' },
          { icon: '🖥️', text: 'Si tu veux rester à 4000 Hz, envisage de <strong>passer à un CPU high-end</strong> pour absorber la charge.' },
        ],
      },
      8000: {
        headline: '⛔ À éviter — CS2 + 8000 Hz',
        body: 'CS2 + 8000 Hz est une combinaison connue pour générer des <strong>pertes de FPS allant jusqu\'à 20–30%</strong> sur les CPUs non high-end. Le thread renderer de Source 2 est bloqué par la fréquence des interruptions HID, créant une contention qui se répercute en jeu.',
        recos: [
          { icon: '🔴', text: '<strong>Baisse à 1000 Hz</strong>. C\'est la recommandation officielle de Valve et de la majorité des coachs pro.' },
          { icon: '📉', text: 'Des tests communautaires montrent que CS2 à 8000 Hz peut perdre <strong>15–20% de FPS brut</strong> et augmenter le 99th percentile de frame time de 40%.' },
          { icon: '💡', text: 'Réserve le 8000 Hz aux CPUs i9-13900K / Ryzen 9 7950X et au-delà, en version test uniquement.' },
        ],
      },
    },
    high: {
      500:  {
        headline: 'CPU surdimensionné pour 500 Hz',
        body: 'Tu as un CPU qui peut absorber 8000 Hz sans effort sur CS2 et tu utilises 500 Hz. C\'est très conservateur.',
        recos: [
          { icon: '⬆️', text: '<strong>Monte à 1000–2000 Hz</strong> pour exploiter ton matériel.' },
        ],
      },
      1000: {
        headline: 'Config solide, peut aller plus loin',
        body: 'Config parfaite pour CS2. Ton CPU high-end peut gérer 2000 Hz sans problème sur Source 2.',
        recos: [
          { icon: '✅', text: '<strong>Config validée</strong> pour le compétitif.' },
          { icon: '📈', text: 'Tu peux tester <strong>2000 Hz</strong> pour voir si tu perçois une différence sur les duels rapides.' },
        ],
      },
      2000: {
        headline: 'Bon équilibre pour CS2 high-end',
        body: 'Ton CPU haut de gamme absorbe les 2000 Hz sur Source 2 avec une charge maîtrisée. C\'est le polling rate recommandé pour les CPU de ta génération sur CS2.',
        recos: [
          { icon: '✅', text: '<strong>Config optimale</strong> pour ton CPU sur CS2. Reste à 2000 Hz.' },
          { icon: '🎯', text: 'Ne monte pas à 4000 Hz sur CS2 sans benchmarker — Source 2 reste capricieux même sur du high-end.' },
        ],
      },
      4000: {
        headline: 'Risque limité — mais Source 2 reste capricieux',
        body: 'Ton CPU high-end gère les 4000 interruptions/seconde, mais le <strong>moteur Source 2 lui-même</strong> n\'est pas optimisé pour ce polling rate. Des micro-stutters peuvent subsister côté engine, indépendamment de ta puissance CPU.',
        recos: [
          { icon: '⚠️', text: '<strong>Teste avant de valider</strong>. CS2 à 4000 Hz même sur high-end CPU peut présenter des frame time anomalies.' },
          { icon: '⬇️', text: 'La plupart des coachs pro recommandent <strong>2000 Hz max sur CS2</strong>, même pour les rigs ultra high-end.' },
          { icon: '📊', text: 'Utilise <strong>CapFrameX</strong> pour comparer tes frame time percentiles sur 30 min de DM.' },
        ],
      },
      8000: {
        headline: 'Risque modéré — CS2 limite le gain',
        body: 'Ton CPU high-end peut gérer 8000 Hz du côté hardware. Mais Source 2 plafonne l\'utilité de ce polling rate. Le moteur ne peut pas utiliser des rapports plus fréquents qu\'une fois par frame rendered, et des <strong>artefacts d\'interpolation</strong> peuvent apparaître dans les calculs balistiques du serveur.',
        recos: [
          { icon: '⚠️', text: '<strong>Recommandé : reste à 2000 Hz</strong> sur CS2, même avec ton CPU.' },
          { icon: '🔬', text: 'Si tu veux rester à 8000 Hz, assure-toi d\'avoir la <strong>dernière version du driver HID Windows</strong> et les dernières updates CS2.' },
          { icon: '📌', text: 'Valve a confirmé travailler sur une meilleure gestion des hauts PR — garde un œil sur les <strong>CS2 patch notes</strong>.' },
        ],
      },
    },
  },

  apex: {
    low: {
      500:  {
        headline: 'Config safe — Apex + CPU ancien',
        body: 'À 500 Hz sur Apex, ton CPU n\'a aucune difficulté. Le moteur Source modifié d\'Apex est globalement plus tolérant que CS2 sur les hauts PR.',
        recos: [
          { icon: '✅', text: '<strong>Config sécurisée</strong>. Passe à 1000 Hz si ta souris le supporte.' },
          { icon: '🎮', text: 'Apex bénéficie plus de la <strong>sensibilité et du raw accel</strong> que d\'un polling rate élevé.' },
        ],
      },
      1000: {
        headline: 'Polling rate optimal pour ton profil Apex',
        body: 'Sur Apex Legends avec un CPU ancien, 1000 Hz est la valeur idéale. Le moteur gère bien ce rythme d\'interruptions et les TTK courts du jeu bénéficient de la précision accrue.',
        recos: [
          { icon: '✅', text: '<strong>Config de référence</strong> pour ton profil. Ne change pas le polling rate.' },
          { icon: '🎯', text: 'Concentre tes efforts sur le <strong>look sensitivity slider</strong> d\'Apex qui agit différemment des autres jeux.' },
          { icon: '🔧', text: 'Active le <strong>mode haute performance</strong> dans les paramètres d\'alimentation Windows.' },
        ],
      },
      2000: {
        headline: 'Risque modéré — CPU limite le gain',
        body: 'À 2000 Hz sur Apex avec un CPU ancien, tu vas ressentir une légère augmentation de la charge CPU sans gain perceptible de précision. Le Source Engine modifié d\'Apex poll les inputs différemment selon les maps et la densité d\'entités.',
        recos: [
          { icon: '⚠️', text: 'Teste la config, mais <strong>reviens à 1000 Hz</strong> si tu observes des micro-stutters pendant les fights.' },
          { icon: '📊', text: 'Utilise <strong>RTSS</strong> pour afficher le frame time en overlay et comparer.' },
        ],
      },
      4000: {
        headline: 'Risque élevé — à éviter',
        body: 'À 4000 Hz sur Apex + CPU ancien, les interruptions souris saturent le budget CPU déjà sous pression dans les fight zones d\'Apex. Les drops de FPS seront prononcés dans les POIs denses.',
        recos: [
          { icon: '🔴', text: '<strong>Redescends à 1000 Hz</strong> immédiatement.' },
          { icon: '📉', text: 'Sur Apex, la densité d\'entités en fight (40+ joueurs dans 200m²) aggrave la contention CPU, amplifiant l\'effet du haut PR.' },
        ],
      },
      8000: {
        headline: '⛔ Config incompatible — Apex + CPU ancien',
        body: '8000 Hz + CPU ancien sur Apex = stutter garanti en fight zones. Apex est bien plus gourmand en CPU qu\'un CS2 (physique, particles, 60 joueurs simultanés) — la charge supplémentaire des interruptions souris est la goutte qui fait déborder le vase.',
        recos: [
          { icon: '🔴', text: '<strong>Reviens à 1000 Hz.</strong> C\'est la priorité absolue.' },
          { icon: '💻', text: 'Pour jouer à de hauts PR sur Apex, un minimum <strong>Ryzen 5 5600 ou i5-12400F</strong> est requis.' },
        ],
      },
    },
    mid: {
      500:  {
        headline: 'Config sûre mais sous-optimale',
        body: 'Ton CPU mid-range gère largement 500 Hz. Tu as de la marge pour monter.',
        recos: [
          { icon: '⬆️', text: '<strong>Monte à 1000 Hz</strong> pour le polling rate optimal sur Apex.' },
        ],
      },
      1000: {
        headline: 'Config optimale — Apex mid-range',
        body: '1000 Hz sur Apex avec un CPU milieu de gamme = l\'équilibre parfait. Précision maximale, charge CPU négligeable.',
        recos: [
          { icon: '✅', text: '<strong>Config validée.</strong> Reste ici ou teste 2000 Hz si ta souris le supporte.' },
          { icon: '🎮', text: 'Focus sur ton <strong>ADS sensitivity multiplier</strong> dans Apex qui est souvent mal calibré.' },
        ],
      },
      2000: {
        headline: 'Config solide pour Apex',
        body: 'Ton CPU absorbe les 2000 Hz sur le Source Engine modifié d\'Apex. Le gain de précision est réel sur les micro-ajustements longue distance.',
        recos: [
          { icon: '✅', text: '<strong>Config viable.</strong> Surveille les frame times pendant une session Kings Canyon (la map la plus CPU-intensive).' },
          { icon: '📈', text: 'À 2000 Hz, tu verras un gain sur le <strong>tracking de cibles en mouvement rapide</strong> (auto-sprint, ziplines).' },
        ],
      },
      4000: {
        headline: 'Risque modéré — dépend de la map',
        body: 'À 4000 Hz sur Apex + CPU mid, le risque dépend beaucoup de la situation en jeu. En solo dans une zone calme, aucun problème. En fight 3v3 avec 6 legends et leurs abilities, <strong>la charge CPU peut pic</strong> et le stutter devient perceptible.',
        recos: [
          { icon: '⚠️', text: '<strong>Teste sur World\'s Edge zone de fight</strong> (Storm Point est la moins intensive). Si stutter → descends à 2000 Hz.' },
          { icon: '🔧', text: 'Ferme tous les programmes en arrière-plan et <strong>désactive le overlay Discord</strong> pour libérer des cycles CPU.' },
        ],
      },
      8000: {
        headline: 'Risque élevé — Apex + 8000 Hz',
        body: 'Apex est l\'un des jeux les plus intensifs en CPU de cette liste. À 8000 Hz sur un CPU mid-range, les fights denses peuvent déclencher des <strong>micro-freezes de 2–5 ms</strong> qui rendent les duels imprévisibles.',
        recos: [
          { icon: '🔴', text: '<strong>Recommandé : descends à 2000–4000 Hz</strong> pour Apex. Ton CPU est la limite ici.' },
          { icon: '💻', text: 'Si tu veux du 8000 Hz sur Apex, un <strong>i7-13700K ou Ryzen 9 7900X</strong> est le minimum raisonnable.' },
          { icon: '📊', text: 'Benchmark sur <strong>Storm Point en hot zone</strong> (endroit le plus CPU-intensif d\'Apex en 2025).' },
        ],
      },
    },
    high: {
      500:  {
        headline: 'Très conservateur pour ton CPU',
        body: 'Tu as beaucoup de headroom. Monte.',
        recos: [
          { icon: '⬆️', text: '<strong>Monte à 2000–4000 Hz</strong> sans aucun risque.' },
        ],
      },
      1000: {
        headline: 'Bon départ, tu peux aller plus loin',
        body: 'Ton CPU high-end gère 1000 Hz sans effort. Explore des PR plus élevés.',
        recos: [
          { icon: '⬆️', text: '<strong>Monte à 2000–4000 Hz</strong> pour un gain de précision réel sur les fights Apex.' },
        ],
      },
      2000: {
        headline: 'Excellent équilibre — Apex high-end',
        body: 'Ton CPU haut de gamme + 2000 Hz + Apex = une des meilleures configs pour ce jeu. Précision élevée, charge CPU maîtrisée.',
        recos: [
          { icon: '✅', text: '<strong>Config recommandée</strong> pour ton setup.' },
          { icon: '📈', text: 'Tu peux tester 4000 Hz — ton CPU le gère, et Apex peut en bénéficier sur les fights longue distance.' },
        ],
      },
      4000: {
        headline: 'Config avancée — viable sur high-end',
        body: 'Ton CPU haut de gamme gère les 4000 Hz sur Apex avec une charge contrôlée. Le Source Engine modifié peut tirer profit de ce PR sur des scènes rapides.',
        recos: [
          { icon: '✅', text: '<strong>Config viable</strong> pour le compétitif avec ton CPU.' },
          { icon: '🔬', text: 'Teste le 8000 Hz si ta souris le supporte — avec ton CPU, le risque stutter est limité même sur Apex.' },
        ],
      },
      8000: {
        headline: 'Config ambitieuse — résultats positifs probables',
        body: 'Ton CPU high-end gère les 8000 Hz sur Apex dans la majorité des situations. Les fights denses peuvent encore créer des pics, mais ton CPU a la réserve pour absorber ces moments sans stutter visible.',
        recos: [
          { icon: '🟡', text: '<strong>Config viable</strong> mais surveille tes frame times pendant les fights 3v3 en zone dense.' },
          { icon: '🔧', text: 'Active <strong>Process Lasso</strong> pour assigner Apex sur les P-cores en priorité.' },
          { icon: '🖱️', text: 'Assure-toi que ta souris génère de <strong>vrais 8000 rapports distincts</strong> (teste avec MouseTester) et pas du 4000 Hz interpolé.' },
        ],
      },
    },
  },
};

/* ═══════════════════════════════════════════════
   UI LIVE UPDATES
═══════════════════════════════════════════════ */

const cfgPolling = $('cfg-polling');
const cfgCpu     = $('cfg-cpu');
const cfgGame    = $('cfg-game');

function updateLiveChips() {
  const hz       = parseInt(cfgPolling.value, 10);
  const interval = (1000 / hz).toFixed(hz >= 2000 ? 3 : 1);
  $('chip-interval').textContent = interval + ' ms';
  $('chip-rps').textContent      = hz.toLocaleString('fr-FR');

  // Game chips
  const meta = GAME_META[cfgGame.value];
  if (meta) {
    $('game-chips').innerHTML = meta.chips
      .map(c => `<span class="field-chip">${c}</span>`)
      .join('');
  }
}

cfgPolling.addEventListener('change', updateLiveChips);
cfgGame.addEventListener('change', updateLiveChips);
updateLiveChips(); // init

/* ═══════════════════════════════════════════════
   GAUGE HELPERS
═══════════════════════════════════════════════ */

/**
 * Arc length of the gauge track (approx half-circle, radius 95).
 * Circumference of the path from angle 180° to 0° (left to right).
 * We measured the path as ~298px (verified visually).
 */
const ARC_LENGTH = 298;

function setGauge(riskScore) {
  // riskScore: 0–100
  const filled = (riskScore / 100) * ARC_LENGTH;
  const offset = ARC_LENGTH - filled;

  const arcEl = $('gauge-arc-active');
  const needle = $('gauge-needle');

  // Color
  let color;
  if (riskScore < 35)      color = 'var(--safe)';
  else if (riskScore < 65) color = 'var(--warn)';
  else                     color = 'var(--danger)';

  arcEl.style.strokeDashoffset = offset;
  arcEl.style.stroke = color;

  // Needle: maps 0–100 → -90deg → +90deg
  const deg = -90 + (riskScore / 100) * 180;
  needle.style.transform = `rotate(${deg}deg)`;
}

function setRiskLabel(riskScore) {
  const badge = $('risk-badge');
  badge.classList.remove('safe', 'warn', 'danger');
  const gaugeCard = $('gauge-card');
  gaugeCard.classList.remove('state-safe', 'state-warn', 'state-danger');

  if (riskScore < 35) {
    badge.textContent = 'FAIBLE';
    badge.classList.add('safe');
    gaugeCard.classList.add('state-safe');
  } else if (riskScore < 65) {
    badge.textContent = 'MOYEN';
    badge.classList.add('warn');
    gaugeCard.classList.add('state-warn');
  } else {
    badge.textContent = 'ÉLEVÉ';
    badge.classList.add('danger');
    gaugeCard.classList.add('state-danger');
  }
}

/* ═══════════════════════════════════════════════
   SCORE BARS
═══════════════════════════════════════════════ */

function setBar(barId, valId, score, invert) {
  // invert: true = high score means bad (stutter risk, cpu load)
  const pct = score;
  const el  = $(barId);
  const cls = invert
    ? (score < 35 ? 'safe' : score < 65 ? 'warn' : 'danger')
    : (score > 65 ? 'safe' : score > 35 ? 'warn' : 'danger');

  el.style.width = pct + '%';
  el.className   = 'score-bar-fill ' + cls;
  $(valId).textContent = score + '%';
}

/* ═══════════════════════════════════════════════
   DIAGNOSTIC CARD
═══════════════════════════════════════════════ */

function setDiagCard(riskScore, diag) {
  const card    = $('diag-card');
  const dot     = $('diag-dot');
  const label   = $('diag-status-label');
  const headline = $('diag-headline');
  const body    = $('diag-body');

  card.className  = 'diag-card';
  dot.className   = 'diag-status-dot';
  label.className = 'diag-status-label';

  let cls, statusText;
  if (riskScore < 35)      { cls = 'safe';   statusText = '✓ CONFIGURATION SÛRE'; }
  else if (riskScore < 65) { cls = 'warn';   statusText = '⚠ CONFIGURATION À RISQUE'; }
  else                     { cls = 'danger'; statusText = '✖ CONFIGURATION PROBLÉMATIQUE'; }

  card.classList.add(cls);
  dot.classList.add(cls);
  label.classList.add(cls);
  label.textContent   = statusText;
  headline.textContent = diag.headline;
  body.innerHTML      = diag.body;
}

/* ═══════════════════════════════════════════════
   RECOMMENDATIONS
═══════════════════════════════════════════════ */

function buildRecos(recos) {
  const list = $('reco-list');
  list.innerHTML = recos.map(r => `
    <li class="reco-item">
      <span class="reco-icon">${r.icon}</span>
      <span>${r.text}</span>
    </li>
  `).join('');
}

/* ═══════════════════════════════════════════════
   MAIN — ANALYZE
═══════════════════════════════════════════════ */

$('btn-analyze').addEventListener('click', () => {
  const game    = cfgGame.value;
  const cpu     = cfgCpu.value;
  const polling = parseInt(cfgPolling.value, 10);

  const scores = MATRIX[game]?.[cpu]?.[polling];
  const diag   = DIAG_DB[game]?.[cpu]?.[polling];

  if (!scores || !diag) {
    console.warn('Missing matrix entry:', game, cpu, polling);
    return;
  }

  // Animate button
  const btn = $('btn-analyze');
  btn.classList.add('scanning');
  btn.textContent = '⏳  Analyse en cours…';

  setTimeout(() => {
    btn.classList.remove('scanning');
    btn.textContent = '⚡  Analyser ma config';

    // Show results
    $('diag-placeholder').style.display = 'none';
    const result = $('diag-result');
    result.classList.remove('visible');
    void result.offsetWidth; // force reflow for re-animation
    result.classList.add('visible');

    // Gauge (small delay for animation)
    setTimeout(() => {
      setGauge(scores.stutterRisk);
      setRiskLabel(scores.stutterRisk);
    }, 80);

    // Bars
    setBar('bar-cpu',     'val-cpu',     scores.cpuLoad,      true);
    setBar('bar-engine',  'val-engine',  scores.engineCompat, false);
    setBar('bar-prec',    'val-prec',    scores.precisionGain, false);
    setBar('bar-stutter', 'val-stutter', scores.stutterRisk,   true);

    // Diagnostic card
    setDiagCard(scores.stutterRisk, diag);

    // Recommendations
    buildRecos(diag.recos);

    // Scroll to result
    $('diag-result').scrollIntoView({ behavior: 'smooth', block: 'start' });

  }, 850); // scan animation duration
});