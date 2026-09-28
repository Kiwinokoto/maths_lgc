# AGENTS.md — maths_lgc

## But du projet
Support web interactif de mathématiques pour les CAP Production et service en restaurations (PSR) de La Grande Classe.

## Principes
- Priorité pédagogique : situations PSR concrètes, progression guidée et remédiation.
- Frontend mobile-first en HTML/CSS/JS, sans compte élève ni dépendance frontend.
- Collecte V1 minimale : prénom ou code court + résultats pédagogiques, stockés dans SQLite côté serveur.
- La progression reste aussi dans `localStorage` pour éviter de perdre le travail en cas de réseau instable.
- Le tableau enseignant est en lecture seule côté navigateur et protégé par `MATHS_TEACHER_TOKEN`.
- Ne jamais stocker de nom de famille, email ou autre donnée inutile dans cette V1.
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
- Prénom/code court demandé avant démarrage.
- Présentation des objectifs et mini-visualisation fractions ↔ pourcentages.
- Parcours linéaire de séance de rentrée.
- Auto-positionnement « les maths et moi ».
- Diagnostic 10 questions sans note.
- Correction guidée.
- Premier défi PSR interactif (proportionnalité, durée, coût/CA).
- Synchronisation serveur des résultats quand le réseau est disponible.
- Tableau enseignant avec forces, difficultés, priorité de travail et exports.
- Historique complet des tentatives exportable pour analyse après séance.
- Branche de déploiement en cours : `dev/deploy-lgc-vps`; ne pas merger avant présence des trois secrets.

## Prochaines étapes
1. Ajouter les trois secrets GitHub sur `Kiwinokoto/maths_lgc`.
2. Vérifier HEAD / absence de concurrence puis merger la PR de déploiement.
3. Laisser l'Action `main` déployer vers `/opt/maths_lgc`.
4. Vérifier `/healthz`, HTTPS, QR et rendu téléphone.
5. Faire un mini test élève + contrôle du tableau `/teacher`.
6. Après la séance, exporter l'historique JSON pour analyse et appréciations personnalisées.
7. Ajouter ensuite les modules Durées puis Recettes & proportionnalité.
