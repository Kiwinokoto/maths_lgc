# AGENTS.md — maths_lgc

## But du projet
Support web interactif de mathématiques pour les CAP Production et service en restaurations (PSR) de La Grande Classe.

## Principes
- UI : sobre mais attractive pour des CAP 1re année ; palette principale violet/indigo, accents chauds pêche/ambre/rose, vert réservé aux états de réussite ; légère inspiration manga sans gamification infantilisante ni effets qui nuisent à la lecture.
- Priorité pédagogique : situations PSR concrètes, progression guidée et remédiation.
- Frontend mobile-first en HTML/CSS/JS, sans compte élève ni dépendance frontend.
- Collecte V1 minimale nécessaire pour éviter les homonymes : prénom + nom + date de naissance + résultats pédagogiques, stockés dans SQLite côté serveur. Dans l'interface élève, utiliser uniquement le prénom après l'identification.
- La progression reste aussi dans `localStorage` pour éviter de perdre le travail en cas de réseau instable.
- Le tableau enseignant est en lecture seule côté navigateur et protégé par `MATHS_TEACHER_TOKEN`.
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
- Nom + prénom + date de naissance demandés avant démarrage pour distinguer les homonymes ; seul le prénom est utilisé dans le cours.
- Présentation des objectifs centrée sur les usages concrets en PSR.
- Mini-visualisation fractions ↔ pourcentages placée dans la correction du diagnostic, au niveau de la notion correspondante.
- Parcours linéaire de séance de rentrée.
- Auto-positionnement « les maths et moi ».
- Diagnostic 10 situations sans note : le score numérique reste côté enseignant ; l'élève voit des priorités et peut répondre explicitement « Je ne sais pas ».
- Correction guidée.
- Premier défi PSR interactif (proportionnalité, durée, coût/CA).
- Synchronisation serveur des résultats quand le réseau est disponible.
- Tableau enseignant avec forces, difficultés, priorité de travail et exports.
- Prévisualisation prof via `/?preview=teacher#parcours` : étapes déverrouillées, aucune synchronisation de résultats, navigation sans remplir les exercices.
- Historique complet des tentatives exportable pour analyse après séance.
- Passe UI V1 : palette modernisée, topbar sticky, progression renforcée, cartes/diagnostic/défi plus visuels, sans changement du parcours pédagogique.
- Passe UI V2 : vert retiré de la couleur d'action ; violet/indigo principal, accents chauds manga discrets, vert menthe vif/tendre conservé seulement pour les réussites/étapes terminées.
- Déploiement production actif depuis `main` via GitHub Actions ; Traefik/HTTPS vérifiés automatiquement.

## Prochaines étapes
1. Finaliser et tester la séance 1 de positionnement en conditions réelles sur téléphone.
2. Utiliser le tableau enseignant et l'historique JSON pour analyser forces, erreurs et réponses « Je ne sais pas ».
3. Ajuster la remédiation après la première classe réelle.
4. Ajouter ensuite les modules Durées puis Recettes & proportionnalité.
5. Décider après usage réel quels contenus migrent vers Moodle et quelles interactions restent sur Maths LGC.
