# Vinted Pokemon Alert Bot

Bot qui surveille des recherches Vinted (cartes Pokemon) et envoie une alerte Discord via webhook des qu'une nouvelle annonce correspondant a tes mots-cles apparait.

## A savoir avant de commencer

- Vinted n'a pas d'API publique officielle. Ce bot utilise leur API interne (`/api/v2/catalog/items`), la meme que le site web utilise. Ca marche bien pour un usage perso mais ce n'est pas garanti dans le temps : Vinted peut changer sa structure ou bloquer les requetes automatisees (protection Datadome).
- Si tu recois des erreurs 403, il faut renseigner `VINTED_COOKIE` (voir plus bas). Sans ca, ca fonctionne parfois quelques requetes puis se fait bloquer.
- Reste raisonnable sur l'intervalle de polling (45-60s minimum) pour eviter de te faire bannir l'IP.
- C'est un usage personnel/veille — pas prevu pour du scraping massif ou de la revente automatisee.

## Installation

```bash
cd vinted-pokemon-bot
npm install
cp .env.example .env
```

Puis remplis le `.env` :

### 1. Webhook Discord
Dans le salon Discord ou tu veux les alertes : Parametres du salon > Integrations > Webhooks > Nouveau webhook > copier l'URL dans `DISCORD_WEBHOOK_URL`.

Pas besoin de creer un vrai "bot" Discord avec token/permissions — un webhook suffit et c'est plus simple a heberger.

### 2. Recherches a surveiller
`VINTED_SEARCHES` accepte plusieurs recherches separees par `;`, par exemple :
```
VINTED_SEARCHES=carte pokemon ex;booster display pokemon;pokemon 151
```

### 3. Cookie Vinted (recommande)
1. Va sur vinted.fr dans ton navigateur, connecte-toi.
2. Ouvre les outils de dev (F12) > onglet Reseau (Network).
3. Recharge la page, clique sur une requete vers `vinted.fr`.
4. Dans les en-tetes de la requete, copie la valeur complete du header `Cookie`.
5. Colle-la dans `VINTED_COOKIE` dans le `.env`.

Ce cookie expire au bout d'un moment (quelques jours/semaines) — s'il recommence a bloquer, il faut le regenerer.

## Lancer en local

```bash
npm start
```

Au premier lancement, le bot enregistre les annonces existantes sans envoyer d'alerte (pour eviter un spam de 20 messages d'un coup), puis alerte uniquement sur les nouvelles annonces a partir de la.

## Deploiement sur Railway

Comme pour Pokedex Binks, tu peux deployer ca sur Railway :
1. Push le dossier sur un repo GitHub.
2. Sur Railway : New Project > Deploy from GitHub repo.
3. Ajoute les variables d'environnement du `.env` dans l'onglet Variables de Railway.
4. Railway detecte le `package.json` et lance `npm start` automatiquement.
5. Le service tourne en continu (pas besoin de cron, le bot boucle lui-meme avec `setInterval`).

## Structure

```
src/
  index.js     -> boucle principale
  vinted.js    -> appel a l'API Vinted
  discord.js   -> envoi de l'embed au webhook
  storage.js   -> memorise les annonces deja vues (data/seen.json)
```
