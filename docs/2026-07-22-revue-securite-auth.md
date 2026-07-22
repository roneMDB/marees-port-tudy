# Revue de sécurité — Authentification (mire de connexion)

- **Date** : 2026-07-22
- **Branche** : `feat/login-screen`
- **Périmètre** : surface d'authentification introduite sur la branche
  - `server/src/lib/session.ts`
  - `server/src/middleware/auth.ts`
  - `server/src/routes/auth.ts`
  - câblage `server/src/app.ts`
  - client `client/src/composables/useAuth.ts`, `client/src/components/LoginScreen.vue`, `client/src/api/auth.ts`

## Résumé

- **Constats** : **1 faille Critique trouvée ET corrigée pendant la revue** (FIX-001) · 1 à vérifier
  (Moyen) · 4 remarques (Faible)
- **Niveau de risque** : après correctif `8975235`, **Faible** — implémentation globalement solide.
  Avant ce correctif : **Critique** (contournement d'auth).
- **Confiance** : Élevée

> **Mise à jour (contre-revue) :** cette version complète le rapport initial. Le point le plus
> important — un **contournement d'authentification par la casse du chemin** — était absent de la
> première rédaction ; il est documenté en FIX-001 et corrigé. Voir aussi les remarques INFO-003
> (cookie `Secure`) et INFO-004 (CSP) ajoutées.

La cryptographie est saine : le jeton `"<expiry>.HMAC-SHA256(expiry)"` est signé avec un secret
dérivé de `APP_PASSWORD` (ou `SESSION_SECRET`), vérifié en **temps constant**, robuste aux entrées
malformées, et rejette bien charge utile/signature altérées (bien couvert par `session.test.ts`).
Le cookie est `HttpOnly` + `SameSite=Strict` + `Secure` conditionnel. Les identifiants utilisent
`timingSafeEqual`. Les chemins publics sont comparés par `req.path` exact au point de montage
`/api`, et toute variante (slash final, casse) échoue **fermé** (exige l'auth) plutôt qu'ouvert —
**mais uniquement depuis le correctif FIX-001** : c'est le **montage du garde sur `/api`**
(`app.use('/api', basicAuth())`) qui garantit une correspondance identique à celle des routeurs,
**pas** la comparaison « `req.path` exact » en elle-même. Avant le correctif, le garde filtrait par
`req.path.startsWith('/api')` (sensible à la casse) et laissait passer `/API/…`. Pas de XSS
(`{{ }}` auto-échappé, pas de `v-html`), pas de fuite du jeton côté client (cookie `HttpOnly`).

**Après correctif : aucune vulnérabilité exploitable à haute confiance identifiée.**

## Corrigé pendant la revue

### [FIX-001] Contournement d'authentification par la casse du chemin (Critique — CORRIGÉ)

- **Emplacement** : `server/src/middleware/auth.ts` (ancienne condition `req.path.startsWith('/api')`)
  + montage `server/src/app.ts`
- **Confiance** : Élevée — **vérifié empiriquement** (avant/après)
- **Correctif** : commit `8975235`
- **Problème** : le garde ne s'appliquait qu'aux chemins commençant *exactement* par `/api`
  (minuscules), via un test de chaîne `req.path.startsWith('/api')`. Or Express route **sans
  distinction de casse** par défaut. Résultat : `GET /API/tides/meta` (et `/Api/…`) **court-circuitait
  le garde** tout en atteignant les routeurs → **fuite des données sans identifiants**, et
  `PUT /API/settings` franchissait aussi le garde d'auth.
- **Preuve** (serveur avec `APP_PASSWORD` défini) :
  - Avant : `GET /api/tides/meta` → `401` ; `GET /API/tides/meta` → **`200` + JSON de données** ;
    `PUT /API/settings` → **`200`**.
  - Après : `/API/tides/meta`, `/Api/tides/meta`, `/api/TIDES/meta`, `PUT /API/settings` → **`401`**.
  - `//api/tides/meta` → `200` mais renvoie la **coquille SPA** (`index.html`, publique), **pas** de
    données → non exploitable.
- **Correctif appliqué** : monter le garde comme les routeurs — `app.use('/api', basicAuth())` — pour
  qu'Express lui présente exactement les mêmes requêtes (casse/slash normalisés à l'identique). Les
  chemins publics sont désormais comparés **relativement** au montage (`/health`, `/login`, …).
- **Leçon / prévention** : ne **jamais** re-filtrer par `req.path.startsWith('/api')` — c'est le
  montage `/api` qui fait foi. Régression verrouillée par des tests (`security.test.ts` :
  `/API/…` et `PUT /API/settings` doivent renvoyer 401).

## À vérifier

### [VERIFY-001] Usurpation de `X-Forwarded-For` → contournement du rate-limit login et des gardes « réseau local » (Moyen)

- **Emplacement** : `server/src/app.ts:29` (`trust proxy: 1`) + `:40` (rate-limit login) ;
  interagit avec `isPrivateIp(req.ip)` utilisé par `PUT /api/settings` et `/api/stats`
- **Confiance** : Moyenne — l'exploitabilité dépend d'un fait de déploiement que le code seul ne
  confirme pas
- **Problème** : avec `trust proxy: 1`, `req.ip` provient de l'en-tête `X-Forwarded-For` fourni par
  le client. Le nouveau limiteur anti-brute-force `/api/login` (10 / 5 min) est indexé sur
  `req.ip` ; un attaquant capable d'atteindre Express **directement** (hors reverse proxy DSM) peut
  faire tourner un `X-Forwarded-For` usurpé pour obtenir un seau de rate-limit neuf à chaque
  requête → brute-force quasi illimité sur le compte unique (`marees` par défaut). Le même
  usurpation rend `isPrivateIp(req.ip)` vrai, contournant le verrou LAN de `PUT /api/settings` et
  `/api/stats`.
- **Pourquoi ça concerne cette branche** : l'endpoint de login est la nouvelle surface d'attaque,
  et sa protection anti-brute-force ne vaut que l'hypothèse « le reverse proxy est le seul point
  d'entrée ».
- **Questions à vérifier** :
  1. Le port `3000` du conteneur est-il joignable sur le LAN (ou redirigé) **en plus** du reverse
     proxy DSM ? Si oui, l'usurpation est exploitable par tout hôte LAN / client externe.
  2. Envisager d'indexer aussi le limiteur login sur l'IP de socket, ou de valider l'identité du
     proxy, pour que la protection survive à un accès direct.
- **Note** : le volet `isPrivateIp` est préexistant (hors diff), inclus car le nouvel endpoint
  login partage la même hypothèse `trust proxy`.

## Remarques (Faible — compromis de conception, non signalés comme failles)

### [INFO-001] La déconnexion est côté client uniquement ; sessions non révocables

- **Emplacement** : `server/src/routes/auth.ts:41` (`logout` → `clearCookie`), `session.ts:22`
- Jetons sans état, sans stockage serveur : `POST /logout` supprime seulement le cookie client. Un
  jeton capturé avant déconnexion reste valide toute sa durée (**jusqu'à 60 jours** avec « se
  souvenir de moi »). Seule révocation globale : changer `APP_PASSWORD`/`SESSION_SECRET`.
  Acceptable pour une app mono-utilisateur, mais à documenter ; envisager un TTL plus court si la
  capture de jeton est un risque.

### [INFO-002] Présence de l'identifiant révélée par le court-circuit `&&`

- **Emplacement** : `server/src/middleware/auth.ts:29` — `safeEqual(user, …) && safeEqual(password, …)`
- Si l'identifiant ne correspond pas, la comparaison du mot de passe est sautée : le temps de
  réponse distingue « mauvais utilisateur » de « bon utilisateur, mauvais mot de passe ». Avec un
  identifiant devinable (`marees`) et le rate-limiting, l'impact est minime. Pour fermer la
  brèche : comparer toujours les deux champs sans court-circuit.

### [INFO-003] Flag `Secure` du cookie conditionné à `req.secure` → dépend du reverse proxy

- **Emplacement** : `server/src/routes/auth.ts:34` (`secure: req.secure`)
- Le cookie de session n'a le flag `Secure` que si `req.secure` est vrai. Derrière le reverse proxy
  DSM (TLS terminé au proxy, trafic interne en HTTP), `req.secure` ne vaut `true` que si le proxy
  transmet `X-Forwarded-Proto: https` **et** que `trust proxy` est actif (c'est le cas, `:1`). Si le
  proxy ne pose pas cet en-tête, le cookie **peut transiter sans `Secure`** (risque d'interception
  en clair). **À vérifier au déploiement** : le proxy DSM doit envoyer `X-Forwarded-Proto`. Le choix
  `req.secure` (plutôt que `Secure` forcé) est volontaire pour que le dev local en HTTP fonctionne.

### [INFO-004] CSP désactivée à l'échelle de l'app (préexistant)

- **Emplacement** : `server/src/app.ts` — `helmet({ contentSecurityPolicy: false })`
- Hors diff, mais pertinent pour l'exposition Internet : aucune Content-Security-Policy n'est
  appliquée. Le code d'auth n'introduit pas de XSS, et le cookie `HttpOnly` empêche le **vol** du
  jeton par du JS injecté ; en revanche, une XSS venue d'ailleurs pourrait **agir via l'API** au nom
  de l'utilisateur connecté. Durcir la CSP (chantier séparé) renforcerait la défense en profondeur.

## Conclusion

Implémentation soignée et bien testée. La revue a mis au jour **une faille critique** (FIX-001,
contournement d'auth par la casse) — **corrigée et verrouillée par des tests** pendant la revue :
c'était le point le plus grave, absent de la première rédaction. Après correctif, il reste
principalement des points de **déploiement** :

1. **VERIFY-001** : confirmer qu'Express sur `:3000` n'est **pas** joignable hors du reverse proxy —
   sinon le limiteur anti-brute-force du login **et** le verrou d'écriture LAN peuvent être
   contournés via un `X-Forwarded-For` usurpé.
2. **INFO-003** : s'assurer que le proxy DSM transmet `X-Forwarded-Proto: https` (flag `Secure` du
   cookie).
3. **INFO-001 / INFO-004** : TTL de 60 j (envisager plus court) et CSP désactivée (durcissement
   ultérieur) — non bloquants.

### Checklist avant exposition Internet

- [ ] `APP_PASSWORD` **fort** (pas la valeur de dev `marees-dev`).
- [ ] Accès externe **uniquement via le reverse proxy DSM en HTTPS** ; port conteneur `3000` jamais
      exposé en direct.
- [ ] Proxy configuré pour transmettre `X-Forwarded-Proto` et `X-Forwarded-For`.
- [ ] (Optionnel) `SESSION_SECRET` explicite pour révoquer les sessions sans changer le mot de passe.
