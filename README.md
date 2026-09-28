# Maths LGC

Support interactif de mathématiques pour les CAP Production et service en restaurations (PSR) de La Grande Classe.

## V1 — rentrée

La première version est un site statique, mobile-first et sans authentification :

- pré-page d'accueil avec emplacement pour le QR code de classe ;
- présentation des usages des maths en PSR ;
- parcours linéaire ;
- auto-positionnement « les maths et moi » ;
- diagnostic de 10 situations sans note ;
- correction guidée ;
- défi PSR interactif autour d'une fiche technique ;
- bilan et priorités enregistrés localement dans le navigateur.

Aucune donnée élève n'est envoyée au serveur dans cette V1.

## Lancer localement

Le site ne nécessite aucun build. Depuis la racine :

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Déploiement

La cible VPS et le workflow GitHub Actions seront ajoutés après choix de l'URL publique et configuration des secrets SSH. Le QR code sera généré à partir de cette URL.

## Documentation

- [`AGENTS.md`](AGENTS.md) : contraintes et état du projet.
- [`docs/seance-1.md`](docs/seance-1.md) : déroulé enseignant pour la séance de rentrée.
