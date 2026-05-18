/**
 * ZIG-ON — Loadout Optimizer
 * loadout-script.js
 *
 * Architecture:
 *  1. Config toggle groups
 *  2. Optimisation knowledge base (BIOS / Windows / GPU / In-Game)
 *     Each item: { id, title, desc, howto, impact: 'high'|'medium'|'low',
 *                  os?, gpu?, cpu?, game? }   ← undefined = applies to all
 *  3. Filtering engine → renders personalised checklist
 *  4. Checkbox logic + progress bars
 *  5. Export + Reset
 */

'use strict';

const $ = id => document.getElementById(id);

/* ═══════════════════════════════════════════════
   TOGGLE GROUPS
═══════════════════════════════════════════════ */
const groups = {
  os:   { el: $('grp-os'),   val: 'win10' },
  gpu:  { el: $('grp-gpu'),  val: 'nvidia' },
  cpu:  { el: $('grp-cpu'),  val: 'intel' },
  game: { el: $('grp-game'), val: 'cs2' },
};

Object.entries(groups).forEach(([key, grp]) => {
  grp.el.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      grp.el.querySelectorAll('.btn-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      grp.val = btn.dataset.val;
      updateSummary();
    });
  });
});

function updateSummary() {
  const labels = {
    os:   { win10: 'Windows 10', win11: 'Windows 11' },
    gpu:  { nvidia: 'NVIDIA', amd: 'AMD GPU' },
    cpu:  { intel: 'Intel CPU', ryzen: 'AMD Ryzen' },
    game: { cs2: 'CS2', valorant: 'VALORANT' },
  };
  $('config-summary').innerHTML = Object.entries(groups)
    .map(([k, g]) => `<span class="cfg-chip active">${labels[k][g.val]}</span>`)
    .join('');
}
updateSummary();

/* ═══════════════════════════════════════════════
   KNOWLEDGE BASE
   Each item may have optional filter fields:
     os   : 'win10' | 'win11' | null (= all)
     gpu  : 'nvidia' | 'amd'  | null
     cpu  : 'intel' | 'ryzen' | null
     game : 'cs2' | 'valorant' | null
═══════════════════════════════════════════════ */

const OPTIMISATIONS = [

  /* ──────────────────────────────────────────────
     CATÉGORIE : BIOS
  ─────────────────────────────────────────────── */
  {
    id: 'bios-xmp', cat: 'bios',
    title: 'Activer XMP / EXPO',
    desc: 'Active le profil XMP (Intel) ou EXPO (AMD) pour faire tourner ta RAM à sa fréquence et ses timings optimaux. Gain typique : +5–15% FPS sur les jeux CPU-bound.',
    howto: `BIOS → <code>AI Tweaker</code> / <code>OC</code> / <code>Overclocking</code> → cherche <code>XMP</code> ou <code>EXPO</code> → sélectionne le profil souhaité (ex: XMP II 3600 CL18) → <code>Save & Exit</code>.`,
    impact: 'high',
  },
  {
    id: 'bios-resizebar', cat: 'bios',
    title: 'Activer Resizable BAR (SAG)',
    desc: 'Permet au CPU d\'accéder directement à toute la VRAM du GPU en une seule opération. Gain : +5–12% FPS selon le jeu.',
    howto: `BIOS → <code>Advanced</code> → <code>PCI Subsystem</code> → <code>Above 4G Decoding</code> : Enabled → <code>Re-Size BAR Support</code> : Enabled. Nécessite aussi d\'activer le support dans le panneau NVIDIA/AMD.`,
    impact: 'high',
    gpu: 'nvidia',
  },
  {
    id: 'bios-resizebar-amd', cat: 'bios',
    title: 'Activer Smart Access Memory (SAM)',
    desc: 'L\'équivalent AMD du Resizable BAR. Donne au CPU un accès total à la VRAM. Gain : +5–20% FPS sur les jeux compatibles.',
    howto: `BIOS → <code>AMD CBS</code> → <code>NBIO Common Options</code> → <code>Smart Access Memory</code> : Enabled + <code>Above 4G Decoding</code> : Enabled. Doit être activé côté GPU dans Radeon Software également.`,
    impact: 'high',
    gpu: 'amd',
  },
  {
    id: 'bios-cstates', cat: 'bios',
    title: 'Désactiver les C-States (Intel)',
    desc: 'Les C-States sont des états d\'économie d\'énergie du CPU. Les désactiver empêche les micro-délais de "réveil" du processeur pendant le jeu, réduisant les frame time spikes.',
    howto: `BIOS → <code>Power</code> ou <code>CPU Configuration</code> → <code>CPU C-States</code> ou <code>Package C State</code> → <code>Disabled</code>. Attention : augmente légèrement la consommation électrique.`,
    impact: 'medium',
    cpu: 'intel',
  },
  {
    id: 'bios-cpb', cat: 'bios',
    title: 'Désactiver Core Performance Boost / CPB',
    desc: 'L\'overdrive automatique d\'AMD peut créer des irrégularités dans les fréquences CPU. Le désactiver force un fonctionnement à fréquence stable, réduisant la variance des frame times.',
    howto: `BIOS → <code>OC</code> → <code>Core Performance Boost</code> → <code>Disabled</code>. Alternativement, tu peux le laisser actif et utiliser EXPO seul pour plus de performances brutes.`,
    impact: 'medium',
    cpu: 'ryzen',
  },
  {
    id: 'bios-fclk', cat: 'bios',
    title: 'Aligner FCLK sur la RAM (Ryzen)',
    desc: 'L\'Infinity Fabric (FCLK) de Ryzen doit idéalement tourner à la moitié de ta fréquence RAM (ex: RAM 3600 MHz → FCLK 1800 MHz). Réduire la latence L3 de 10–20 ns.',
    howto: `BIOS → <code>OC</code> → <code>FCLK Frequency</code> → définis manuellement à la moitié de ta fréquence RAM. Ex: RAM DDR4 3600 MHz → FCLK <code>1800</code>. Pour DDR4 >3600, FCLK à 1800 est souvent la limite stable.`,
    impact: 'high',
    cpu: 'ryzen',
  },
  {
    id: 'bios-secure-boot', cat: 'bios',
    title: 'Secure Boot & TPM (selon jeu)',
    desc: 'Valorant (Vanguard) et certains jeux nécessitent Secure Boot + TPM 2.0 actifs sur Windows 11. Si tu as des erreurs d\'anti-cheat, vérifie ces options.',
    howto: `BIOS → <code>Security</code> → <code>Secure Boot</code> : Enabled + <code>TPM Device</code> : Enabled (fTPM sur AMD, PTT sur Intel). Requis pour Vanguard sous Win11.`,
    impact: 'medium',
    os: 'win11',
    game: 'valorant',
  },

  /* ──────────────────────────────────────────────
     CATÉGORIE : WINDOWS
  ─────────────────────────────────────────────── */
  {
    id: 'win-power', cat: 'windows',
    title: 'Plan d\'alimentation : Haute Performance',
    desc: 'Le plan "Haute Performance" ou "Performances Maximales" empêche le CPU de réduire sa fréquence en idle. Réduction des pics de latence CPU de 1–3 ms.',
    howto: `<code>Win + R</code> → <code>powercfg.cpl</code> → Afficher les plans supplémentaires → sélectionner <code>Haute Performance</code>. Pour aller plus loin : cmd en admin → <code>powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61</code> pour créer le plan "Performances Maximales" (caché par défaut).`,
    impact: 'high',
  },
  {
    id: 'win-gamebar', cat: 'windows',
    title: 'Désactiver Xbox Game Bar & Game DVR',
    desc: 'Game Bar et Game DVR enregistrent en arrière-plan en permanence. Désactivés, tu récupères 2–8% de CPU et élimines des frame time spikes périodiques.',
    howto: `<code>Paramètres</code> → <code>Jeux</code> → <code>Xbox Game Bar</code> : Désactivé. Puis : <code>Captures</code> → <code>Enregistrer en arrière-plan</code> : Désactivé. Pour forcer via regedit : <code>HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\GameDVR</code> → <code>AllowGameDVR</code> = <code>0</code>.`,
    impact: 'high',
  },
  {
    id: 'win-gamemode', cat: 'windows',
    title: 'Activer le Mode Jeu Windows',
    desc: 'Le Mode Jeu priorise le processus du jeu sur les tâches système Windows Update et les notifications. Gain modeste mais constant sur le frame pacing.',
    howto: `<code>Paramètres</code> → <code>Jeux</code> → <code>Mode Jeu</code> : Activé. Windows 11 : le mode jeu est activé par défaut mais vérifie qu\'il n\'ait pas été désactivé par une mise à jour.`,
    impact: 'medium',
  },
  {
    id: 'win-hpet', cat: 'windows',
    title: 'Timer Résolution — désactiver HPET global',
    desc: 'Sur la majorité des configs modernes, désactiver HPET au niveau Windows réduit la latence du scheduler. Le jeu utilise alors le timer TSC (plus précis sur les CPU récents).',
    howto: `CMD en administrateur → <code>bcdedit /deletevalue useplatformtick</code> puis <code>bcdedit /set disabledynamictick yes</code>. Pour forcer le timer à 0.5 ms : télécharge <code>TimerResolution.exe</code>, lance avant le jeu, définis 5000 (= 0.5 ms).`,
    impact: 'medium',
  },
  {
    id: 'win-msi', cat: 'windows',
    title: 'Activer MSI Mode pour le GPU',
    desc: 'Message Signaled Interrupts réduit la latence d\'interruption GPU de 1–2 ms. Améliore la régularité des frames et réduit l\'input lag.',
    howto: `Télécharge <code>MSI_util_v3</code> (GitHub). Lance en admin. Trouve ton GPU dans la liste → active <code>MSI</code>. Priority → définis sur <code>High</code>. Redémarre Windows.`,
    impact: 'high',
  },
  {
    id: 'win-notifications', cat: 'windows',
    title: 'Désactiver Notifications & Focus Assist',
    desc: 'Les notifications Windows génèrent de petits spikes CPU qui peuvent perturber le frame pacing pendant les parties compétitives.',
    howto: `<code>Paramètres</code> → <code>Système</code> → <code>Notifications</code> : toutes désactivées. Ou : <code>Aide à la concentration</code> → <code>Alarmes uniquement</code> quand tu joues. Windows 11 : <code>Ne pas déranger</code> → activer automatiquement.`,
    impact: 'low',
  },
  {
    id: 'win-vis-effects', cat: 'windows',
    title: 'Désactiver les effets visuels Windows',
    desc: 'Animations, transparences et ombres consomment des ressources GPU/CPU. Sur un système dédié au gaming, les désactiver libère ces ressources pour le jeu.',
    howto: `<code>Win + R</code> → <code>sysdm.cpl</code> → <code>Avancé</code> → <code>Paramètres</code> (Performances) → <code>Ajuster pour obtenir les meilleures performances</code>. Ou conserve uniquement "Afficher les vignettes..." pour le confort.`,
    impact: 'low',
  },
  {
    id: 'win-superfetch', cat: 'windows',
    title: 'Désactiver SysMain (ex-Superfetch)',
    desc: 'SysMain précharge en RAM les programmes souvent utilisés. Sur une config avec 16 Go+ de RAM, c\'est inutile en jeu et peut créer des spikes I/O disque pendant les parties.',
    howto: `<code>Win + R</code> → <code>services.msc</code> → <code>SysMain</code> → double-clic → <code>Type de démarrage : Désactivé</code> → Arrêter → OK.`,
    impact: 'medium',
  },
  {
    id: 'win11-vbs', cat: 'windows',
    title: 'Désactiver VBS / HVCI (Win11)',
    desc: 'Virtualization Based Security et Hypervisor Protected Code Integrity peuvent réduire les FPS de 5–15% sur certains jeux. Désactiver si la sécurité n\'est pas une priorité.',
    howto: `<code>Paramètres</code> → <code>Windows Security</code> → <code>Device Security</code> → <code>Core isolation</code> → <code>Memory integrity</code> : OFF. Nécessite un redémarrage. ⚠️ Réduit légèrement la sécurité système.`,
    impact: 'high',
    os: 'win11',
  },
  {
    id: 'win-pcilatency', cat: 'windows',
    title: 'Régler la latence PCI-E via Regedit',
    desc: 'Ajuster la valeur PciSystemPageAllocationSize peut améliorer la bande passante CPU↔GPU, réduisant les frame time irréguliers sur les jeux gourmands en streaming de données.',
    howto: `<code>Win + R</code> → <code>regedit</code> → <code>HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management</code> → nouvelle valeur DWORD <code>PciSystemPageAllocationSize</code> = <code>168</code> (décimal). Redémarre.`,
    impact: 'low',
  },

  /* ──────────────────────────────────────────────
     CATÉGORIE : GPU — NVIDIA
  ─────────────────────────────────────────────── */
  {
    id: 'nv-lowlatency', cat: 'gpu',
    title: 'Activer NVIDIA Ultra Low Latency Mode',
    desc: 'Le mode Ultra Low Latency (ULL) soumet les frames au GPU juste avant qu\'il en ait besoin, réduisant l\'input lag de 1–3 ms. La plus impactante des options NVIDIA.',
    howto: `Panneau de configuration NVIDIA → <code>Gérer les paramètres 3D</code> → <code>Mode faible latence</code> → <code>Ultra</code>. S\'applique globalement ou par jeu dans "Paramètres du programme".`,
    impact: 'high',
    gpu: 'nvidia',
  },
  {
    id: 'nv-vsync', cat: 'gpu',
    title: 'Désactiver V-Sync (panneau NVIDIA)',
    desc: 'La V-Sync dans le panneau NVIDIA ajoute 1–2 frames de latence. Désactive-la globalement et n\'utilise que la V-Sync in-game si absolument nécessaire.',
    howto: `Panneau de configuration NVIDIA → <code>Gérer les paramètres 3D</code> → <code>Synchronisation verticale</code> → <code>Désactivé</code>. En jeu, utilise plutôt le <strong>G-Sync + VSYNC off</strong> si tu as un moniteur compatible.`,
    impact: 'high',
    gpu: 'nvidia',
  },
  {
    id: 'nv-psmode', cat: 'gpu',
    title: 'Mode gestion alimentation GPU : Préférer les performances maximales',
    desc: 'Empêche la carte graphique de réduire ses clocks en idle ou entre les frames, éliminant les pics de latence liés au downclocking.',
    howto: `Panneau de configuration NVIDIA → <code>Gérer les paramètres 3D</code> → <code>Mode gestion de l\'alimentation</code> → <code>Préférer les performances maximales</code>.`,
    impact: 'high',
    gpu: 'nvidia',
  },
  {
    id: 'nv-shaderopt', cat: 'gpu',
    title: 'Désactiver l\'optimisation des shaders (selon jeu)',
    desc: 'L\'optimisation des shaders NVIDIA peut interférer avec le rendu de certains jeux, causant des micro-stutters lors de la compilation de nouveaux shaders.',
    howto: `Panneau NVIDIA → <code>Gérer les paramètres 3D</code> → <code>Optimisation des shaders</code> → <code>Désactivé</code> (si tu observes des stutters lors des pop-ins). Laisser activé sinon.`,
    impact: 'low',
    gpu: 'nvidia',
  },
  {
    id: 'nv-reflex', cat: 'gpu',
    title: 'Activer NVIDIA Reflex In-Game',
    desc: 'NVIDIA Reflex réduit la latence système (CPU→GPU→écran) de 20–50% dans les jeux supportés. Une des optimisations les plus impactantes pour le compétitif.',
    howto: `Dans VALORANT : Paramètres → Vidéo → <code>NVIDIA Reflex</code> → <code>Activé + Boost</code>. Dans CS2 : Options → Vidéo Avancé → <code>NVIDIA Reflex Low Latency</code> → <code>Enabled + Boost</code>. Vérifie que tu as un GPU RTX 20xx ou supérieur.`,
    impact: 'high',
    gpu: 'nvidia',
  },
  {
    id: 'nv-texture', cat: 'gpu',
    title: 'Filtrage de texture : Performance',
    desc: 'En compétitif, la qualité de filtrage anisotropique maximale n\'a aucun avantage. Réduire libère de la bande passante GPU pour les calculs de frame.',
    howto: `Panneau NVIDIA → <code>Gérer les paramètres 3D</code> → <code>Filtrage de texture - Qualité</code> → <code>Performance</code>. Désactiver aussi <code>Netteté du filtrage de texture</code> et <code>Filtrage de texture - Filtrage anisotropique</code>.`,
    impact: 'medium',
    gpu: 'nvidia',
  },
  {
    id: 'nv-gsync', cat: 'gpu',
    title: 'Configurer G-Sync correctement',
    desc: 'G-Sync + cap de FPS à 3 fps sous le max du moniteur + V-Sync ON uniquement dans le panneau NVIDIA = combo optimal pour l\'input lag et l\'élimination des tearing.',
    howto: `1) Panneau NVIDIA → Configurer G-Sync → activer pour le mode plein écran. 2) Panneau NVIDIA → Synchronisation verticale → <code>Activé</code>. 3) In-game : V-Sync <code>OFF</code>. 4) Cap FPS (RTSS) à <code>fréquence moniteur - 3</code> (ex: 141 FPS pour 144 Hz).`,
    impact: 'high',
    gpu: 'nvidia',
  },

  /* ──────────────────────────────────────────────
     CATÉGORIE : GPU — AMD
  ─────────────────────────────────────────────── */
  {
    id: 'amd-antiglag', cat: 'gpu',
    title: 'Activer AMD Anti-Lag+',
    desc: 'L\'équivalent AMD de NVIDIA Reflex. Réduit la latence CPU-to-GPU de 20–40 ms dans les jeux supportés. Nécessite un GPU RX 6000 ou supérieur.',
    howto: `Radeon Software → <code>Gaming</code> → <code>Global Graphics</code> → <code>Anti-Lag+</code> : Enabled. Fonctionne aussi par jeu : Radeon Software → Jeux → sélectionne le jeu → Anti-Lag+.`,
    impact: 'high',
    gpu: 'amd',
  },
  {
    id: 'amd-vsync', cat: 'gpu',
    title: 'Désactiver V-Sync Radeon globalement',
    desc: 'V-Sync ajoute des frames de buffer et augmente l\'input lag. En compétitif, toujours désactivé globalement.',
    howto: `Radeon Software → <code>Gaming</code> → <code>Global Graphics</code> → <code>Wait for Vertical Refresh</code> → <code>Always Off</code>. Applique aussi par jeu si nécessaire.`,
    impact: 'high',
    gpu: 'amd',
  },
  {
    id: 'amd-perfmode', cat: 'gpu',
    title: 'Profil GPU : Mode Turbo / Haute Performance',
    desc: 'Force le GPU à maintenir ses fréquences maximales en permanence, éliminant les micro-baisses de fréquence entre les scènes.',
    howto: `Radeon Software → <code>Gaming</code> → <code>Global Graphics</code> → <code>Radeon Performance Tuning</code> → <code>GPU Workload</code> : Gaming. Puis dans <code>Turbo</code> ou active <code>Chill</code> uniquement si tu veux cap les FPS.`,
    impact: 'high',
    gpu: 'amd',
  },
  {
    id: 'amd-freesync', cat: 'gpu',
    title: 'Optimiser FreeSync Premium',
    desc: 'Comme G-Sync, FreeSync optimal = activé + cap FPS légèrement sous la limite du moniteur + V-Sync OFF in-game.',
    howto: `Radeon Software → Affichage → <code>AMD FreeSync</code> : Enabled. In-game : V-Sync OFF. Cap FPS (Radeon Chill ou RTSS) à <code>fréquence moniteur - 3</code>. Ex: 141 FPS pour 144 Hz.`,
    impact: 'high',
    gpu: 'amd',
  },
  {
    id: 'amd-texture', cat: 'gpu',
    title: 'Filtrage Anisotropique : Optimisé',
    desc: 'Réduit la qualité de filtrage pour libérer de la bande passante GPU en faveur des calculs de rendu principaux.',
    howto: `Radeon Software → Gaming → Global Graphics → <code>Anisotropic Filtering</code> → <code>Disabled</code>. Ou définis-le à 2x maximum pour un compromis visuel acceptable.`,
    impact: 'medium',
    gpu: 'amd',
  },
  {
    id: 'amd-rsr', cat: 'gpu',
    title: 'AMD Radeon Super Resolution (RSR)',
    desc: 'Si tu es GPU-bound, RSR permet de rendre à une résolution inférieure et upscale avec un impact visuel minimal mais un gain de FPS significatif (+20–40%).',
    howto: `Radeon Software → Gaming → Global Graphics → <code>RSR</code> : Enabled. In-game : définis la résolution de rendu en dessous de la résolution native (ex: 1728×972 sur un écran 1080p). RSR gère l\'upscale automatiquement.`,
    impact: 'medium',
    gpu: 'amd',
  },

  /* ──────────────────────────────────────────────
     CATÉGORIE : IN-GAME — CS2
  ─────────────────────────────────────────────── */
  {
    id: 'cs2-multithreaded', cat: 'game',
    title: 'Multicore Rendering : Activé',
    desc: 'Distribue le rendu sur tous les cœurs CPU disponibles. Un des paramètres les plus importants de CS2. +20–50% FPS selon le CPU.',
    howto: `CS2 → <code>Paramètres</code> → <code>Vidéo</code> → <code>Avancé</code> → <code>Multicore Rendering</code> → <code>Activé</code>. Vérifiable dans la console : <code>mat_queue_mode 2</code>.`,
    impact: 'high',
    game: 'cs2',
  },
  {
    id: 'cs2-launch', cat: 'game',
    title: 'Launch Options CS2 optimisés',
    desc: 'Les launch options permettent de bypasser certaines limitations du moteur au démarrage pour plus de FPS et moins d\'input lag.',
    howto: `Steam → CS2 → Propriétés → <code>Options de lancement</code> :<br><code>-novid -high -freq 144 -tickrate 128 +fps_max 0 +cl_interp_ratio 1 +cl_interp 0 +rate 786432</code><br>Adapte <code>-freq</code> à ton moniteur.`,
    impact: 'high',
    game: 'cs2',
  },
  {
    id: 'cs2-netsettings', cat: 'game',
    title: 'Network Settings CS2',
    desc: 'Les paramètres réseau affectent la réactivité perçue en compétitif. Ces valeurs correspondent au setup recommandé pour les serveurs 128-tick.',
    howto: `Console CS2 : <code>rate 786432</code> · <code>cl_cmdrate 128</code> · <code>cl_updaterate 128</code> · <code>cl_interp 0</code> · <code>cl_interp_ratio 1</code>. Ajoute ces valeurs dans <code>autoexec.cfg</code> pour les rendre persistants.`,
    impact: 'high',
    game: 'cs2',
  },
  {
    id: 'cs2-res', cat: 'game',
    title: 'Résolution compétitive (4:3 ou 16:9)',
    desc: 'Jouer à 1280×960 ou 1024×768 (stretched) réduit massivement la charge GPU et augmente les FPS. Les pro players utilisent ces résolutions pour leur fluidité.',
    howto: `CS2 → Paramètres → Vidéo → Résolution : <code>1280×960</code> ou <code>1024×768</code> → Mode d\'affichage : <code>Plein écran</code>. Pour le stretched : configure la résolution custom dans le panneau GPU et active <code>GPU Scaling</code>.`,
    impact: 'medium',
    game: 'cs2',
  },
  {
    id: 'cs2-shadows', cat: 'game',
    title: 'Ombres et effets visuels au minimum',
    desc: 'Les ombres en temps réel sont très coûteuses en GPU. Les réduire au minimum dans CS2 libère des ressources pour maintenir un FPS stable et élevé.',
    howto: `CS2 → Paramètres Vidéo Avancés : Ombres → <code>Très basses</code> · Modèle de shading global → <code>Basse</code> · Effets de particules → <code>Bas</code> · Ambient occlusion → <code>Désactivé</code>.`,
    impact: 'high',
    game: 'cs2',
  },
  {
    id: 'cs2-boost', cat: 'game',
    title: 'Boost Player Contrast',
    desc: 'Améliore la lisibilité des ennemis en augmentant le contraste des modèles joueurs. Avantage compétitif direct sans impact FPS.',
    howto: `Console CS2 : <code>cl_boost_player_contrast_enable 1</code>. Ajoute dans <code>autoexec.cfg</code> pour le conserver entre les sessions.`,
    impact: 'low',
    game: 'cs2',
  },

  /* ──────────────────────────────────────────────
     CATÉGORIE : IN-GAME — VALORANT
  ─────────────────────────────────────────────── */
  {
    id: 'val-fpsunlock', cat: 'game',
    title: 'Déverrouiller le cap de FPS VALORANT',
    desc: 'Par défaut, VALORANT peut avoir un cap FPS non optimal. Déverrouiller permet au jeu d\'utiliser pleinement le hardware.',
    howto: `VALORANT → Paramètres → Vidéo → <code>FPS Max (En jeu)</code> : <code>0</code> (illimité) ou capluffe à <code>fréquence_moniteur × 3</code> (ex: 432 pour 144 Hz) pour un frame pacing optimal.`,
    impact: 'high',
    game: 'valorant',
  },
  {
    id: 'val-multithreaded', cat: 'game',
    title: 'Multithread Rendering : Activé',
    desc: 'Comme CS2, activer le rendu multi-thread dans VALORANT distribue le travail UE4 sur tous les cœurs CPU. Gain : +15–35% FPS sur les CPU 6 cœurs et plus.',
    howto: `VALORANT → Paramètres → Vidéo → <code>Multithread Rendering</code> : <code>Activé</code>. Nécessite un redémarrage du jeu pour prendre effet.`,
    impact: 'high',
    game: 'valorant',
  },
  {
    id: 'val-reflex', cat: 'game',
    title: 'NVIDIA Reflex Low Latency : Activé + Boost',
    desc: 'Réduit l\'input lag total du système de 20–50%. Un des paramètres les plus importants pour le compétitif VALORANT.',
    howto: `VALORANT → Paramètres → Vidéo → <code>NVIDIA Reflex Low Latency</code> → <code>Activé + Boost</code>. Vérifie que ton GPU est RTX 20xx ou supérieur. Si tu es sur AMD, utilise Anti-Lag+ dans Radeon Software.`,
    impact: 'high',
    game: 'valorant',
    gpu: 'nvidia',
  },
  {
    id: 'val-anticheat', cat: 'game',
    title: 'Vérifier Vanguard (anticheat) est actif',
    desc: 'Vanguard doit s\'exécuter au niveau du kernel au démarrage. S\'il est désactivé ou en erreur, tu ne pourras pas te connecter en compétitif.',
    howto: `Icône Vanguard (dent de lion) dans la barre des tâches → doit être blanc (actif). Si rouge : redémarre. Si absent : désinstalle/réinstalle VALORANT. Sur Win11 : vérifie Secure Boot + TPM 2.0 dans le BIOS.`,
    impact: 'high',
    game: 'valorant',
  },
  {
    id: 'val-visuals', cat: 'game',
    title: 'Paramètres visuels compétitifs VALORANT',
    desc: 'Les réglages optimaux pour maximiser la lisibilité et les FPS. Chaque paramètre désactivé libère des ressources pour maintenir un framerate stable.',
    howto: `Qualité des matériaux : <code>Basse</code> · Qualité des textures : <code>Basse</code> · Qualité des détails : <code>Basse</code> · Interface utilisateur IU : <code>Basse</code> · Vignettage : <code>OFF</code> · V-Sync : <code>OFF</code> · Anti-aliasing : <code>MSAA 2x</code> max.`,
    impact: 'high',
    game: 'valorant',
  },
  {
    id: 'val-launchopt', cat: 'game',
    title: 'Launch Options VALORANT (Riot Client)',
    desc: 'Forcer certains paramètres de démarrage améliore la stabilité des frames et la latence réseau dans VALORANT.',
    howto: `Bureau → raccourci VALORANT → Propriétés → <code>Cible</code> : ajoute après l\'exe <code>-high -nojoy +fps_max 0</code>. Alternative via le Riot Client en passant par les settings de lancement de la partition.`,
    impact: 'medium',
    game: 'valorant',
  },

  /* ──────────────────────────────────────────────
     CATÉGORIE : WINDOWS — Intel spécifique
  ─────────────────────────────────────────────── */
  {
    id: 'intel-e-cores', cat: 'windows',
    title: 'Désactiver les E-Cores (Intel 12th+)',
    desc: 'Sur les CPU Intel Alder Lake et supérieurs, les E-Cores peuvent créer des irrégularités dans le scheduling des tâches gaming. Les désactiver peut réduire les frame time spikes.',
    howto: `BIOS → <code>CPU Configuration</code> → <code>Efficient-core</code> → <code>Disabled</code>. Ou via Windows : Gestionnaire des tâches → Performances → CPU → Affinity du processus. Teste avec et sans pour ton jeu.`,
    impact: 'medium',
    cpu: 'intel',
  },

  /* ──────────────────────────────────────────────
     CATÉGORIE : WINDOWS — AMD Ryzen spécifique
  ─────────────────────────────────────────────── */
  {
    id: 'amd-chipset', cat: 'windows',
    title: 'Drivers Chipset AMD — version récente',
    desc: 'Les drivers chipset AMD incluent le scheduler Ryzen optimisé. Une version obsolète peut créer des pertes de performance de 10–20% sur les Ryzen 5000/7000.',
    howto: `Télécharge les derniers drivers depuis <code>amd.com/en/support</code> → Chipsets → ta plateforme. Désinstalle l\'ancienne version (DDU optionnel) puis installe. Redémarre. Vérifie avec CPU-Z que le scheduler est bien activé.`,
    impact: 'high',
    cpu: 'ryzen',
  },
  {
    id: 'amd-pbo', cat: 'windows',
    title: 'Activer PBO (Precision Boost Overdrive)',
    desc: 'PBO permet au CPU Ryzen de dépasser ses limites power nominales pour des boost clocks plus élevés. +3–8% FPS sur les jeux CPU-bound.',
    howto: `BIOS → <code>OC</code> → <code>Precision Boost Overdrive</code> → <code>Advanced</code> → PPT/TDC/EDC à des valeurs élevées (ex: 200W/150A/170A pour les Ryzen 9). Vérifie les températures avec HWInfo64.`,
    impact: 'medium',
    cpu: 'ryzen',
  },
];

/* ═══════════════════════════════════════════════
   CATEGORY METADATA
═══════════════════════════════════════════════ */
const CATEGORIES = {
  bios:    { label: 'BIOS',      sub: 'XMP, Resizable BAR, Timings',         icon: '🔩', cls: 'bios'    },
  windows: { label: 'Windows',   sub: 'OS tuning, Power, Scheduler',          icon: '🪟', cls: 'windows' },
  gpu:     { label: 'GPU',       sub: 'Driver, Panneau de config, Latence',   icon: '🎮', cls: 'gpu'     },
  game:    { label: 'In-Game',   sub: 'Paramètres jeu, Réseau, Résolution',   icon: '🎯', cls: 'game'    },
};

/* ═══════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════ */
let checkedIds = new Set();
let renderedItems = [];  // flat list of rendered item IDs + cat

/* ═══════════════════════════════════════════════
   FILTER ENGINE
═══════════════════════════════════════════════ */
function filterItems() {
  const { os, gpu, cpu, game } = Object.fromEntries(
    Object.entries(groups).map(([k, g]) => [k, g.val])
  );

  return OPTIMISATIONS.filter(item => {
    if (item.os   && item.os   !== os)   return false;
    if (item.gpu  && item.gpu  !== gpu)  return false;
    if (item.cpu  && item.cpu  !== cpu)  return false;
    if (item.game && item.game !== game) return false;
    return true;
  });
}

/* ═══════════════════════════════════════════════
   RENDER CHECKLIST
═══════════════════════════════════════════════ */
function generate() {
  checkedIds.clear();

  const btn = $('btn-gen');
  btn.classList.add('scanning');
  btn.textContent = '⏳  Génération…';

  setTimeout(() => {
    btn.classList.remove('scanning');
    btn.textContent = '⚡  Générer mon Loadout';

    const items = filterItems();
    renderedItems = items;

    // Hide placeholder, show checklist
    $('loadout-placeholder').style.display = 'none';
    $('progress-header').style.display = '';
    $('checklist-actions').classList.add('visible');
    $('completion-banner').classList.remove('visible');

    // Group by category
    const bycat = {};
    items.forEach(item => {
      if (!bycat[item.cat]) bycat[item.cat] = [];
      bycat[item.cat].push(item);
    });

    const wrap = $('checklist-wrap');
    wrap.innerHTML = '';
    wrap.classList.remove('visible');
    void wrap.offsetWidth;
    wrap.classList.add('visible');

    // Render category cards
    Object.entries(CATEGORIES).forEach(([catKey, catMeta]) => {
      const catItems = bycat[catKey];
      if (!catItems || !catItems.length) return;

      const card = document.createElement('div');
      card.className = 'cat-card';
      card.dataset.cat = catKey;

      card.innerHTML = `
        <div class="cat-header" data-cat="${catKey}">
          <div class="cat-icon-wrap ${catMeta.cls}">${catMeta.icon}</div>
          <div class="cat-header-info">
            <div class="cat-name">${catMeta.label}</div>
            <div class="cat-sub">${catMeta.sub} · ${catItems.length} optimisations</div>
          </div>
          <div class="cat-mini-prog">
            <div class="cat-mini-track">
              <div class="cat-mini-fill ${catMeta.cls}" id="mini-fill-${catKey}"></div>
            </div>
            <span class="cat-mini-pct ${catMeta.cls}" id="mini-pct-${catKey}">0%</span>
          </div>
          <span class="cat-chevron">▼</span>
        </div>
        <div class="cat-items" id="cat-items-${catKey}">
          ${catItems.map(item => renderItem(item)).join('')}
        </div>
      `;
      wrap.appendChild(card);

      // Collapse toggle
      card.querySelector('.cat-header').addEventListener('click', () => {
        card.classList.toggle('collapsed');
      });
    });

    // Attach checkbox listeners
    wrap.querySelectorAll('.cb-input').forEach(input => {
      input.addEventListener('change', onCheckChange);
    });

    // Attach howto toggles
    wrap.querySelectorAll('.check-item-howto').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const detail = btn.nextElementSibling;
        detail.classList.toggle('open');
        btn.textContent = detail.classList.contains('open') ? '▲ Masquer' : '▼ Comment faire ?';
      });
    });

    // Attach row click → toggle checkbox
    wrap.querySelectorAll('.check-item').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.check-item-howto') || e.target.closest('.howto-detail')) return;
        const cb = row.querySelector('.cb-input');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
      });
    });

    updateProgress();
    $('progress-header').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 900);
}

function renderItem(item) {
  const impactLabel = { high: 'HIGH', medium: 'MED', low: 'LOW' }[item.impact] || 'MED';
  return `
    <div class="check-item" id="row-${item.id}">
      <span class="impact-badge ${item.impact}">${impactLabel}</span>
      <label class="custom-cb" onclick="event.stopPropagation()">
        <input type="checkbox" class="cb-input" id="cb-${item.id}" data-id="${item.id}" data-cat="${item.cat}" />
        <span class="custom-cb-box"></span>
      </label>
      <div class="check-item-body">
        <div class="check-item-title">${item.title}</div>
        <div class="check-item-desc">${item.desc}</div>
        <span class="check-item-howto">▼ Comment faire ?</span>
        <div class="howto-detail">${item.howto}</div>
      </div>
    </div>
  `;
}

/* ═══════════════════════════════════════════════
   CHECKBOX LOGIC
═══════════════════════════════════════════════ */
function onCheckChange(e) {
  const id = e.target.dataset.id;
  const row = $('row-' + id);
  if (e.target.checked) {
    checkedIds.add(id);
    row.classList.add('checked');
  } else {
    checkedIds.delete(id);
    row.classList.remove('checked');
  }
  updateProgress();
}

/* ═══════════════════════════════════════════════
   PROGRESS UPDATE
═══════════════════════════════════════════════ */
function updateProgress() {
  const total   = renderedItems.length;
  const done    = checkedIds.size;
  const pct     = total === 0 ? 0 : Math.round((done / total) * 100);

  // Global bar
  $('prog-fill').style.width = pct + '%';
  const pctEl = $('prog-pct');
  pctEl.textContent = pct + '%';
  pctEl.classList.toggle('done', pct === 100);
  $('prog-count').textContent = `${done} / ${total} optimisations complétées`;

  // Per category pills
  const bycat = {};
  renderedItems.forEach(item => {
    if (!bycat[item.cat]) bycat[item.cat] = { total: 0, done: 0 };
    bycat[item.cat].total++;
    if (checkedIds.has(item.id)) bycat[item.cat].done++;
  });

  // Update pills container
  const pillsEl = $('cat-prog-pills');
  pillsEl.innerHTML = Object.entries(bycat).map(([cat, d]) => {
    const meta = CATEGORIES[cat];
    return `<span class="cat-pill">
      <span class="cat-pill-dot" style="background:var(--cat-${cat})"></span>
      ${meta.label} <span class="cat-pill-count">${d.done}/${d.total}</span>
    </span>`;
  }).join('');

  // Update mini fills per category
  Object.entries(bycat).forEach(([cat, d]) => {
    const fill = $('mini-fill-' + cat);
    const pctEl = $('mini-pct-' + cat);
    if (fill) fill.style.width = (d.total === 0 ? 0 : Math.round((d.done / d.total) * 100)) + '%';
    if (pctEl) pctEl.textContent = (d.total === 0 ? 0 : Math.round((d.done / d.total) * 100)) + '%';
  });

  // Completion banner
  $('completion-banner').classList.toggle('visible', pct === 100 && total > 0);
}

/* ═══════════════════════════════════════════════
   GENERATE BUTTON
═══════════════════════════════════════════════ */
$('btn-gen').addEventListener('click', generate);

/* ═══════════════════════════════════════════════
   RESET CHECKS
═══════════════════════════════════════════════ */
$('btn-reset-checks').addEventListener('click', () => {
  checkedIds.clear();
  document.querySelectorAll('.cb-input').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.check-item').forEach(row => row.classList.remove('checked'));
  updateProgress();
  showToast('✓ Checklist réinitialisée');
});

/* ═══════════════════════════════════════════════
   EXPORT TXT
═══════════════════════════════════════════════ */
$('btn-export').addEventListener('click', () => {
  if (!renderedItems.length) return;
  const cfg = Object.entries(groups).map(([k, g]) => `${k.toUpperCase()}: ${g.val}`).join(' | ');
  const lines = [`ZIG-ON — Loadout Optimizer Export`, cfg, `Complété : ${checkedIds.size}/${renderedItems.length}\n`];

  const byCat = {};
  renderedItems.forEach(item => {
    if (!byCat[item.cat]) byCat[item.cat] = [];
    byCat[item.cat].push(item);
  });

  Object.entries(CATEGORIES).forEach(([catKey, catMeta]) => {
    const items = byCat[catKey];
    if (!items) return;
    lines.push(`\n── ${catMeta.label.toUpperCase()} ──`);
    items.forEach(item => {
      const check = checkedIds.has(item.id) ? '[✓]' : '[ ]';
      lines.push(`${check} [${item.impact.toUpperCase()}] ${item.title}`);
      lines.push(`    ${item.desc}`);
    });
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'zig-on-loadout.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('⬇ Export téléchargé !');
});

/* ═══════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════ */
function showToast(msg) {
  const t = $('toast-lo');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

const hamburgerBtn = document.getElementById('hamburger-btn');
const navLinks = document.querySelector('.nav-links');

if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', () => {
        // Ajoute ou enlève la classe "active" pour afficher/cacher le menu
        navLinks.classList.toggle('active');
    });
}
