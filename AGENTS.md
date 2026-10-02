# AGENTS.md — maths_lgc

## Statut — 2 octobre 2026
Ce dépôt est désormais **legacy / maintenance uniquement**. `Kiwinokoto/portail` est le dépôt et site canonique pour les nouveaux cours, nouvelles séances, outils prof et migrations de contenu. Garder `maths.lagrandeclasse.fr` en ligne pour les cohortes et séances historiques existantes ; ne pas y ajouter de nouvelles fonctionnalités sauf correctif critique nécessaire à ces usages.

La migration doit reprendre le **contenu pédagogique utile** dans Portail, pas recopier la navigation/auth/session technique de ce site.

## But historique du projet
Support web interactif de mathématiques pour les CAP Production et service en restaurations (PSR) de La Grande Classe.

## Principes
- UI : sobre mais attractive pour des CAP 1re année ; identité visuelle violet/indigo avec bleu et rose décoratifs. **Couleurs sémantiques réservées** : vert = correct/réussi/terminé ; orange = à reprendre/erreur pédagogique/attention ; rouge = objectif fort/à retenir/important (et erreur système/destructif). Ne jamais employer vert/orange comme simple décoration, et ne jamais transmettre un état par la couleur seule. Légère inspiration manga sans gamification infantilisante ni effets qui nuisent à la lecture.
- Priorité pédagogique : situations PSR concrètes, progression guidée et remédiation.
- Accessibilité linguistique : au début du parcours, phrases courtes, vocabulaire courant, exemples visuels/concrets ; introduire le vocabulaire mathématique et professionnel progressivement, en particulier pour les élèves avec parcours scolaire fragile ou français en cours d'acquisition.
- Frontend mobile-first en HTML/CSS/JS, sans compte élève ni dépendance frontend.
- Collecte V1 minimale nécessaire au suivi : prénom + nom + date de naissance + résultats pédagogiques, stockés dans SQLite côté serveur. Le professeur crée d'abord une occurrence de séance avec professeur + séance + groupe ; le lien/QR élève rattache automatiquement les résultats à cette occurrence. Dans l'interface élève, utiliser uniquement le prénom après l'identification.
- La progression reste aussi dans `localStorage` pour éviter de perdre le travail en cas de réseau instable.
- Le tableau enseignant accepte désormais en priorité une session navigateur HttpOnly obtenue par SSO depuis `portail.lagrandeclasse.fr`. `MATHS_TEACHER_TOKEN` reste temporairement disponible comme accès de secours pendant la transition.
- Ne jamais collecter d'email, adresse ou autre donnée inutile. La date de naissance n'est utilisée que pour distinguer les homonymes dans le suivi enseignant.
- Ne pas transformer le site en Moodle bis : les interactions qui apportent une vraie valeur web restent ici ; les contenus classiques pourront migrer vers Moodle plus tard.
- Ne pas ajouter de géométrie comme axe central du CAP PSR : le parcours suit le groupement 2 de mathématiques.

## Architecture V1
- `server.py` : serveur HTTP Python standard library + API JSON + SQLite.
- `index.html` + `assets/app.js` : parcours élève.
- `teacher.html` : tableau enseignant, export CSV + historique JSON complet.
- `data/` : base SQLite locale au serveur, ignorée par Git.
- `Dockerfile` + `docker-compose.yml` : service autonome, non-root dans le conteneur.
- Routes utiles : `/healthz`, `/api/progress`, `/teacher`, `/api/teacher/summary`, `/api/teacher/history`.

## Infra LGC vérifiée le 2026-09-28
- VPS production : `173.212.214.227`.
- Reverse proxy : Traefik v3 en conteneur, ports 80/443.
- Repo infra : `La-Grande-Classe-R-D/traefik`, branche `main`.
- Réseau partagé : `traefik_network`.
- Provider Docker : activé, `exposedByDefault=false`.
- Resolver TLS : `letsencrypt`; PROD utilise Cloudflare DNS-01.
- Aucun changement Traefik n'est requis pour Maths LGC : le service rejoint `traefik_network` et publie ses labels.
- Cible : `https://maths.lagrandeclasse.fr`.
- Dossier serveur : `/opt/maths_lgc`.
- Données persistantes : `/opt/maths_lgc/data`.
- Le workflow de déploiement ne redémarre pas Traefik.

## Git / livraison
- `main` = version publiable et déclenche le déploiement production une fois le workflow mergé.
- Développement non trivial sur `dev/<sujet>` puis PR.
- Vérifier l'état du repo et les travaux concurrents avant écriture.
- Ne jamais commit `MATHS_TEACHER_TOKEN`, clé SSH, base SQLite ou fichier `.env`.
- Secrets GitHub requis avant merge du déploiement :
  - `DEPLOY_SSH_KEY`
  - `DEPLOY_KNOWN_HOSTS`
  - `MATHS_TEACHER_TOKEN`

## État V1
- Pré-page d'accueil avec vrai QR vers `https://maths.lagrandeclasse.fr/`.
- Côté élève, nom + prénom + date de naissance sont demandés après ouverture d'un lien/QR de séance valide ; aucun choix manuel du professeur ou du groupe. Professeurs disponibles à la création : Monsieur Kevin, Monsieur Waren ou Madame Fadhila. Le numéro de séance est un champ numérique prérempli à 1 ; un titre facultatif peut préciser le contenu (ex. « Proportionnalité »). La date est saisie au format français `JJ/MM/AAAA` via un champ numérique masqué (slashs automatiques), puis convertie en ISO côté client avant envoi. Exemples de saisie : prénom `Yanis`, nom `Dupont`.
- Présentation des objectifs centrée sur les usages concrets en PSR.
- Mini-visualisation fractions ↔ pourcentages placée dans la correction du diagnostic, au niveau de la notion correspondante.
- Parcours linéaire de séance de rentrée.
- Auto-positionnement « les maths et moi ».
- Diagnostic 10 situations sans note : le score numérique reste côté enseignant ; l'élève voit des priorités et peut répondre explicitement « Je ne sais pas ».
- Correction guidée.
- Premier défi PSR interactif (proportionnalité, durée, coût/CA).
- Synchronisation serveur des résultats quand le réseau est disponible.
- Tableau enseignant avec forces, difficultés, priorité de travail et exports.
- Prévisualisation prof via `/?preview=teacher#parcours` : étapes déverrouillées, aucune synchronisation de résultats, mais accès désormais authentifié par la session ouverte dans `/teacher` ; les liens d'inspection s'ouvrent dans le même onglet pour conserver cette session.
- Historique complet des tentatives exportable pour analyse après séance.
- Passe UI V1 : palette modernisée, topbar sticky, progression renforcée, cartes/diagnostic/défi plus visuels, sans changement du parcours pédagogique.
- Passe UI V2 : vert retiré de la couleur d'action ; violet/indigo principal, accents chauds manga discrets, vert menthe vif/tendre conservé seulement pour les réussites/étapes terminées.
- Passe accessibilité séance 1 : fond moins rosé, en-tête contextuel avec ∑ vers le parcours, intro simplifiée avec exemples concrets et vocabulaire technique introduit progressivement.
- Modules V1 construits : `#durees` et `#proportion`, accessibles aux élèves après la séance 1 et toujours accessibles en prévisualisation prof. Feedback local uniquement, non synchronisé au serveur. Progression proportionnalité : le défi de séance démarre sur un coefficient entier simple (10 → 30, × 3), puis le module Recettes réinvestit la même méthode avec des coefficients décimaux (notamment × 2,4 et × 3,2).
- Timing V1 : jalons serveur légers (début de session, première ouverture de page, validations d'activités) réutilisant la table `submissions`, sans migration. Les temps calculés sont des indices de rythme uniquement, jamais une mesure de niveau.
- Modules V1 construits : `#pourcentages` et `#donnees`, avec manipulations visuelles, méthodes simples et exercices courts ; feedback local comme pour Durées/Proportionnalité.
- Tableau enseignant : l’accès maître est désormais obtenu de préférence par SSO depuis le Portail LGC (code à usage unique + PKCE → session HttpOnly Maths). Le jeton enseignant commun reste un fallback de transition. L’accès maître sert à créer une séance et à inspecter le contenu, mais ne donne plus accès à tous les résultats. Les séances créées sous SSO sont désormais rattachées à l’identifiant stable du professeur dans le Portail LGC : elles réapparaissent après reconnexion sur un autre navigateur/appareil et leur propriétaire peut ouvrir le suivi sans secret local. Chaque séance conserve néanmoins un secret de gestion distinct pour la compatibilité avec les séances historiques et le mode jeton de secours. Après création, le QR reste visible et le bloc « Outils enseignant » reprend les cinq espaces communs : Séances, Parcours, Corrigés, Suivi en direct, Rapports. La prévisualisation peut être ouverte avec le secret de gestion de la séance, sans exiger le jeton maître sur le même navigateur. L’accueil `/teacher` suit désormais le vocabulaire commun du Portail LGC avec cinq espaces : **Séances**, **Parcours**, **Corrigés**, **Suivi en direct**, **Rapports**. Les cinq espaces sont désormais opérationnels en V1. **Rapports** agrège les séances accessibles : synthèse du groupe, détail élève et comparaison descriptive uniquement entre groupes ayant travaillé la même séance. Aucune comparaison n’est présentée comme un classement, et les durées restent des indices de rythme. Les onglets remplacent les raccourcis dispersés et l’onglet actif est conservé lors d’un aller-retour vers la prévisualisation. Les liens externes peuvent cibler `?tab=create`, `?tab=inspect`, `?tab=corrections`, `?tab=live` ou `?tab=reports`. Lorsqu’un lien Portail transporte aussi `session=<id>`, Maths doit conserver ce contexte après le SSO et amener directement le professeur à la section demandée de cette séance (par exemple `tab=live` → suivi), sans étape de navigation enseignant redondante. Lorsqu’une séance est ouverte, son résumé (présences, scores, temps indicatifs, dernière activité) est repollé toutes les 4 s, en pause lorsque l’onglet navigateur est masqué.
- Modules V1 construits : `#equations` et `#fonctions`. Équations part du nombre inconnu et de l'opération inverse ; Graphiques & fonctions part de deux quantités liées avant d'introduire le vocabulaire de fonction.
- Modules V1 construits : `#commerce` et `#probabilites`. Commerce couvre commande/remise/coût/marge simple et taxe fournie ; Probabilités part d’un jeu explicite de pioche dans un sac de 10 jetons (3 violets, 7 gris, violet = gagné, remise et mélange après chaque pioche) pour montrer fluctuation et stabilisation des fréquences. Le module suit explicitement la règle « langage courant d’abord, terme mathématique ensuite » : chance → probabilité, part observée → fréquence, « ne pas arriver » → événement contraire ; « avec remise » est expliqué avant d’être nommé.
- Audit pédagogique explicite : diagnostic, défi et 8 modules revérifiés dans `docs/audit-exercices.md` (énoncés, clés, calculs, corrigés).
- Cycle de vie des séances : **Fermer** désactive immédiatement le lien/QR élève et les nouvelles écritures, conserve tous les résultats/exports/rapports, et reverrouille les corrigés ; **Réouvrir** réactive le même lien. Les séances historiques sans champ `active` sont traitées comme ouvertes pour compatibilité.
- Corrigés diagnostic/défi : détaillés toujours visibles en prévisualisation prof, verrouillés côté élève par défaut ; déblocage manuel **par occurrence de séance** depuis son lien de gestion. L'état des nouvelles séances est persistant dans `data/sessions.json` (ancien `class_state.json` conservé seulement pour compatibilité), sans migration SQLite. Le tableau affiche la liste des inscrits et leur état (inscrit / diagnostic terminé / défi terminé).
- Limite V1 : les clés de réponse du diagnostic restent dans le JavaScript client. Le verrou empêche la consultation normale/casuelle, mais n'est pas une sécurité d'examen face à un élève inspectant le code ; si le site sert un jour à une évaluation notée, déplacer la validation sensible côté serveur.
- Déploiement production actif depuis `main` via GitHub Actions ; Traefik/HTTPS vérifiés automatiquement.

## Prochaines étapes — legacy
1. Ne plus créer de nouveau chantier produit ici.
2. Maintenir les liens/séances utilisés par les cohortes existantes et corriger uniquement les régressions critiques.
3. Considérer `docs/`, le diagnostic, le défi et les huit modules comme source pédagogique de migration vers `Kiwinokoto/portail`.
4. Ne pas étendre le SSO, le tableau enseignant ni la navigation interne : les nouvelles séances doivent vivre dans Portail.
5. Quand plus aucune cohorte active n’en dépend, exporter ce qui doit l’être puis archiver proprement le service.
