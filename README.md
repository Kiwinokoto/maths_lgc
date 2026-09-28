# Maths LGC

Support interactif de mathématiques pour les CAP Production et service en restaurations (PSR) de La Grande Classe.

## V1 — rentrée

La V1 est mobile-first, sans compte élève et sans build frontend :

- pré-page d'accueil avec emplacement pour le QR code de classe ;
- prénom ou code court pour rattacher les résultats au bon élève ;
- présentation des usages des maths en PSR ;
- visualisation fractions ↔ pourcentages ;
- parcours linéaire ;
- auto-positionnement « les maths et moi » ;
- diagnostic de 10 situations sans note ;
- correction guidée ;
- défi PSR interactif autour d'une fiche technique ;
- bilan et priorités enregistrés localement dans le navigateur ;
- synchronisation vers une petite base SQLite quand le serveur est disponible ;
- tableau enseignant protégé avec export JSON/CSV.

La collecte est volontairement minimale : pas de nom de famille, pas d'email, pas de compte élève.

## Lancer localement

Définir un jeton enseignant puis lancer le serveur Python :

```bash
export MATHS_TEACHER_TOKEN='un-secret-local'
python3 server.py
```

Puis ouvrir :

- élève : `http://localhost:8080/`
- enseignant : `http://localhost:8080/teacher`
- santé : `http://localhost:8080/healthz`

La base est créée dans `data/maths_lgc.sqlite3` et n'est pas versionnée.

## Variables d'environnement

- `MATHS_TEACHER_TOKEN` : secret nécessaire pour lire le tableau enseignant ;
- `MATHS_HOST` : adresse d'écoute, défaut `0.0.0.0` ;
- `MATHS_PORT` : port, défaut `8080` ;
- `MATHS_DATA_DIR` : dossier de données, défaut `./data`.

## Déploiement

Cible prévue : `https://maths.lagrandeclasse.fr` sur le VPS LGC.

Le workflow GitHub Actions sera ajouté seulement après inspection du reverse proxy et des chemins réellement présents sur le VPS. Une clé SSH dédiée au repo sera utilisée ; aucune clé privée ne doit être commitée.

## Documentation

- [`AGENTS.md`](AGENTS.md) : contraintes, architecture et état du projet.
- [`docs/seance-1.md`](docs/seance-1.md) : déroulé enseignant pour la séance de rentrée.
