# Déploiement déclenché par le push d'un tag — issue #12

**Date** : 2026-07-31
**Contexte** : le déploiement sur le NAS est aujourd'hui manuel et sans lien avec l'état de git.
L'issue demande qu'un **push de tag** le déclenche, et évoque une note de release « via un outil
existant ».

## Besoin

Aujourd'hui, déployer se fait en deux temps sans garde-fou : `./deploy/push-to-nas.sh` (build image
+ `scp`), puis une session SSH pour taper `sudo bash update-on-nas.sh`. Rien ne vérifie que l'arbre
de travail est propre, que les tests passent, ni sur quelle branche on est. Le dépôt n'a **aucun
tag**, **aucun CHANGELOG**, aucun hook git, et la version n'est **jamais consommée** : l'image est
`marees-port-tudy:latest` en dur et `GET /api/health` ne renvoie que `{ status: 'ok' }`. **Il est
donc impossible de savoir quelle version tourne en production.**

Arbitré avec l'utilisateur :

- déclencheur = **hook `pre-push` versionné**, qui délègue à un script lançable seul ;
- le `sudo` du NAS reste **interactif** (`ssh -t`, mot de passe saisi) : aucune modification de la
  sécurité du NAS, aucun secret stocké ;
- notes de release = **`CHANGELOG.md` généré par git-cliff** ;
- **le tag est posé à la main** ; la source de vérité de la version est le **`package.json`**, et le
  hook refuse de déployer si le tag en diverge ;
- vérifications avant déploiement = `lint` + `type-check` + tests unitaires (e2e sur `RUN_E2E=1`) ;
- retenu en plus : sauvegarde de la base avant bascule, contrôle de santé après redémarrage, version
  exposée par `/api/health` **et** en pied de page de l'application, image taguée à la version.

Les trois `package.json` ont été remis à `0.0.0` : remise à zéro avant la première release taguée,
pas une version figée.

## Faits vérifiés qui déterminent le design

1. **GitHub Actions ne peut pas atteindre le NAS** (LAN privé, `ssh erwan@ds218plus -p 2010`). Le
   déploiement part donc forcément du PC : c'est ce qui écarte un workflow CI sur tag et impose un
   hook local. La CI existante (`.github/workflows/ci.yml`) reste inchangée.
2. **`docker build` construit depuis l'arbre de travail, pas depuis le commit du tag**, et
   `.dockerignore` exclut `.git` : rien ne relie l'image au tag. Le hook doit donc vérifier
   `tag^{commit} == HEAD` **et** un arbre propre, sinon on déploierait autre chose que ce qu'on
   publie.
3. **`.dockerignore` n'exclut pas `*.tar.gz`** : l'archive `marees-image.tar.gz` (~115 Mo) part dans
   le contexte de build à chaque `docker build` et est copiée par `COPY . .`. À corriger avant
   d'automatiser des builds.
4. **Le compose NAS publie sur `127.0.0.1:3000` uniquement** (choix de sécurité VERIFY-001,
   `deploy/docker-compose.nas.yml:13`) : l'application **n'est pas joignable depuis le PC**. Tout
   contrôle de santé doit donc s'exécuter **sur le NAS**.
5. **Le `package.json` racine est déjà copié dans l'image runtime** (`Dockerfile:32`) : le serveur
   peut lire sa version sans `ARG` Docker ni `LABEL`.
6. **`pre-push` reçoit les refs sur stdin** (`<local ref> <local oid> <remote ref> <remote oid>`) et
   **aucune option de la ligne de commande** : `git push origin v1.0.0`, `--follow-tags` et `--tags`
   sont indiscernables (`GIT_PUSH_OPTION_*` n'existe que pour les hooks côté serveur). La 4ᵉ colonne
   est en revanche autoritaire sur l'état du remote, ce qui rend un `git ls-remote --tags` inutile
   pour le tag.
7. **git-cliff n'a aucun script postinstall** (binaires en `optionalDependencies` préconstruites) :
   il s'installe sans toucher la liste `allowScripts` du projet, qui existe parce que les scripts
   d'installation sont bloqués par défaut ici.
8. **Les commits sont déjà strictement conventionnels** — 6 types présents sur les 60 derniers :
   `feat` (26), `fix` (14), `docs` (10), `chore` (5), `test` (3) et **`merge`** (2), ce dernier
   n'étant pas un type standard et devant être traité explicitement dans `cliff.toml`.

## Choix de conception

Deux scripts plutôt qu'un, sur le patron exact des scripts existants de `deploy/` (`set -euo
pipefail`, en-tête « Usage / Réglages surchargables », étapes `==> n/N`, `✓`/`✗` sur stderr,
`NAS_*` surchargeables) :

- **`deploy/release.sh`** porte tout le déploiement et reste lançable seul (`./deploy/release.sh
  v0.1.0`, exposé par `npm run deploy`). C'est ce qui rend la reprise après échec triviale, et ce qui
  permet de tester le mécanisme sans passer par git.
- **`.githooks/pre-push`** ne fait que **décider** : détecter le tag, vérifier la cohérence,
  demander confirmation, déléguer.

**Ordre des étapes du déploiement : le plus réversible d'abord.** Pré-vol réseau (2 s) avant les
tests (3 min), sauvegarde de la base avant la bascule du conteneur, et l'étape irréversible en
dernier.

**Un déploiement échoué annule le push** (`exit 1`). Le tag reste local, donc la reprise est un
simple `git push` rejoué — le déploiement est idempotent (`docker load` + `docker-compose up -d`).
La direction inverse (tag publié, production en retard) demanderait un `git push --delete` et
laisserait GitHub mentir sur ce qui tourne.

**Sans terminal, on s'abstient de déployer mais on laisse le push passer.** Un déploiement en
production non confirmé, déclenché par un `git push` dans un script ou un client graphique, est pire
qu'un déploiement oublié — et celui-ci reste rejouable à la main.

## Composant — `deploy/release.sh`

1. **Pré-vol** : docker répond ; NAS joignable (`ssh -n -o BatchMode=yes -o ConnectTimeout=5`).
2. `npm run lint`, `npm run type-check`, `npm test`, chacun `< /dev/null` ; e2e si `RUN_E2E=1`.
3. **Sauvegarde de la base sur le NAS** : `ssh -n` → `bash backup-db-on-nas.sh` (existant, sans
   sudo, `VACUUM INTO` + `integrity_check` + rotation). Filet en cas de migration de schéma ratée,
   les migrations SQLite s'exécutant au démarrage.
4. `deploy/push-to-nas.sh`, réutilisé tel quel.
5. `ssh -t … < /dev/tty` → `EXPECTED_VERSION=… sudo bash update-on-nas.sh`. **Pas `ssh -n` ici** :
   `-n` redirige stdin depuis `/dev/null`, il n'y a plus de tty et le prompt sudo échoue.
6. Compte rendu (version déployée, URL).

Réglages : `DRY_RUN=1` (wrapper `run()` unique — les **vérifications tournent quand même**),
`RUN_E2E=1`, `SKIP_BACKUP=1`, et le passe-plat `NAS_HOST`/`NAS_PORT`/`NAS_DIR`. Un `trap` d'échec
affiche l'étape atteinte et la commande de reprise : un `Ctrl-C` pendant les minutes de build/scp
doit laisser un état compréhensible.

## Composant — `.githooks/pre-push`

Dans cet ordre :

1. Soupape `SKIP_DEPLOY=1` ; `unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX
   GIT_QUARANTINE_PATH` (git les exporte dans le hook, elles fausseraient tout `git` d'un
   sous-script).
2. **Vider stdin entièrement** en collectant les tags. Décider sur **`<remote ref>`**, jamais sur
   `<local ref>` (qui peut valoir `(delete)` ou un OID brut). Ne retenir que
   `^v[0-9]+\.[0-9]+\.[0-9]+$` — les pré-versions se poussent donc sans déployer. Boucle **sans
   pipe** (un `cat | while` perdrait le tableau dans un sous-shell) et **sans commande qui lit
   stdin** à l'intérieur : un `ssh` sans `-n` avalerait les lignes de refs restantes, silencieusement.
3. Sorties précoces : aucun tag → `exit 0` ; **plusieurs** tags de release (`git push --tags`) →
   refus explicite plutôt qu'un choix implicite ; remote ≠ `DEPLOY_REMOTE` (défaut `origin`) →
   `exit 0`.
4. Vérifications, **avant de toucher au NAS** : tag **annoté** (`git cat-file -t` = `tag`, sinon
   `--follow-tags` l'ignorerait) ; `<remote oid>` nul (tag inédit) ; `tag^{commit} == HEAD` et arbre
   propre (fait 2) ; **les 3 `package.json` == version du tag** ; section présente dans
   `CHANGELOG.md` ; branche en **fast-forward** (`git ls-remote --exit-code`) — une ligne de branche
   rejetée n'étant pas transmise au hook, sans ce contrôle on déploierait avant que le push global
   échoue.
5. Confirmation sur **`/dev/tty`** (stdin est à EOF) : `IFS= read -r rep < /dev/tty || rep=""` — sans
   le `|| rep=""`, `set -e` tue le hook. Présence du tty testée par ouverture réelle dans un
   sous-shell : `if ( : < /dev/tty ) 2>/dev/null`. Ni `exec 3</dev/tty` (builtin spécial : ferait
   sortir le shell) ni `[ -r /dev/tty ]` (réussit même sans terminal de contrôle) ne conviennent.
   Invite écrite sur `/dev/tty` et non stdout, qu'un client graphique tamponnerait. Sans tty :
   avertir et `exit 0` sans déployer ; `DEPLOY_YES=1` pour l'opt-in non interactif.
6. `deploy/release.sh "$tag" < /dev/null` ; échec → `exit 1` avec les reprises possibles.
7. `trap … ERR` : sous `set -e`, tout bug du hook rendrait le push impossible sans explication.

Committé en **755** (git ignore un hook non exécutable). Activation par `npm run hooks:install`
(`git config core.hooksPath .githooks`, idempotent, chemin **relatif** pour fonctionner dans un
`git worktree`) **et** par un script `prepare`. Ce `prepare` doit être **gardé** : le `Dockerfile`
fait `RUN npm ci` dans une image sans git ni `.git`, un `prepare` nu casserait le build de l'image.

## Composant — contrôle de santé (`deploy/update-on-nas.sh`)

Étape ajoutée après `docker-compose up -d` : attendre que la sonde `HEALTHCHECK` (déjà dans
`Dockerfile:48`) passe à `healthy` (`docker inspect --format '{{.State.Health.Status}}'`, boucle
bornée), puis, si `EXPECTED_VERSION` est fourni, lire la version servie
(`docker exec … wget -qO- localhost:3000/api/health`, `wget` venant de busybox sur Alpine) et
échouer si elle diffère. Exécuté **sur le NAS** (fait 4). Le script étant re-transféré à chaque
`push-to-nas.sh`, il est toujours à jour côté NAS.

C'est cette étape qui fait dire vrai au déploiement : `docker-compose up -d` rend la main avant que
l'application réponde.

## Composant — version exposée

- `server/src/lib/version.ts` : lecture du `package.json` racine par `fs.readFileSync` résolue
  depuis `__dirname` (`../../package.json` vaut autant depuis `server/src/` que depuis
  `server/dist/`), mémoïsée, repli `'0.0.0'` si illisible. Pas d'`ARG` Docker (fait 5).
- `GET /api/health` → `{ status: 'ok', version }`. La route reste publique (sonde). Le test de
  sécurité fige le fait qu'elle n'expose **que** ces deux champs.
- **Pied de page** du client, version injectée au build par Vite (`define`) : aucune requête, donc
  affichée même hors-ligne — cohérent avec la PWA. Le hook garantissant l'égalité des trois
  manifests, elle ne peut pas diverger de celle du serveur.

## Composant — image taguée à la version (`deploy/save-image.sh`)

Taguer `marees-port-tudy:<version>` **en plus** de `:latest`, les deux dans la même archive
(`docker save img:<version> img:latest`), version lue par le script (`node -p`), plus
`--label org.opencontainers.image.version`. Comportement inchangé sans version, pour ne pas casser
l'usage manuel. Permet un rollback sur le NAS sans re-transférer ~115 Mo.

## Composant — CHANGELOG (git-cliff)

`npm i -D git-cliff` (fait 7). `cliff.toml` : groupes en français mappés sur les 6 types réellement
présents (fait 8), scopes conservés, `chore(release)` filtré. `npm run changelog` déduit le tag du
`package.json` (`--tag "v$(node -p …)"`), donc s'enchaîne sans argument après `npm version`. Aucun
tag n'existant, la première génération couvre tout l'historique.

## Séquence de release

```bash
npm version 0.1.0 --no-git-tag-version --workspaces --include-workspace-root
npm run changelog
git commit -am "chore(release): v0.1.0"
git tag -a v0.1.0 -m "v0.1.0"
git push --atomic --follow-tags origin main
```

Le CHANGELOG est généré **avant** le tag pour que le commit tagué contienne ses propres notes.
`--atomic` rend branche + tag tout-ou-rien côté remote : sans lui, le pire résidu est un tag publié
avec une branche rejetée.

## Documentation

- `deploy/README.md` : `release.sh` dans le tableau, et la séquence de release en « démarrage
  rapide » à côté de la voie manuelle existante.
- `deploy/INSTALLATION-NAS.md` §9 « Mettre à jour » : la voie par tag, et la procédure de **rollback**
  qu'autorise le tag d'image versionné.
- `README.md` : §« Déploiement NAS » (activation du hook, séquence de release) et §« Tests &
  qualité » (`npm run type-check` racine).
- `CLAUDE.md` : §Commandes (`deploy`, `changelog`, `hooks:install`) et §Déploiement.
- À documenter explicitement : les soupapes (`SKIP_DEPLOY=1` **recommandé** plutôt que
  `--no-verify`, qui contourne aussi les contrôles de cohérence), le comportement sans tty, et le
  fait qu'un déploiement échoué annule le push.

## Hors périmètre

- Publication sur un registre (GHCR) puis `docker pull` côté NAS : change le modèle de déploiement,
  sans rapport avec le déclencheur demandé. YAGNI.
- Runner GitHub self-hosted.
- Release GitHub via `gh release create` : le CHANGELOG versionné a été préféré.
- `sudoers NOPASSWD` sur le NAS : `ssh -t` suffit sans affaiblir le NAS.
- Câbler `npm run type-check` racine dans la CI (`.github/workflows/ci.yml` n'appelle que le
  type-check **client**, donc le type-check serveur ajouté en `a5bb1a8` n'est couvert par personne) :
  réel, mais hors sujet ici → issue distincte.

## Vérification

Pas de framework de test bash dans le dépôt → vérification par **exécution réelle**, comme pour la
sauvegarde (#11).

1. `npm test` et `npm run type-check` : la version dans `/api/health` est couverte par les tests
   serveur mis à jour (`routes/tides.test.ts`, `security.test.ts`, `lib/version.test.ts`).
2. `npm run changelog` sur l'historique réel : regroupement par type, scopes présents.
3. **Matrice du hook sur un remote bare local** (`git init --bare`, remote `test`,
   `DEPLOY_REMOTE=test`, `DRY_RUN=1`), sans jamais toucher `origin` ni le NAS : branche seule ·
   refus (`n`) et vérification que le tag est **absent** du remote · acceptation en dry-run · re-push
   du même tag (stdin vide) · `--delete` · version ≠ manifest · tag léger · `--tags` avec 2 tags ·
   `--follow-tags` · arbre sale · **absence de terminal** via `setsid` (un `</dev/null` ne suffit
   pas, `/dev/tty` resterait ouvrable) · `SKIP_DEPLOY=1` · `--no-verify` · remote ≠ `origin`.
   À trancher par le test : si `git push --dry-run` déclenche le hook.
4. **Déploiement réel de bout en bout** sur `v0.1.0`, un premier passage en `DRY_RUN=1` puis sans :
   contrôler la sauvegarde créée, le passage à `healthy`, la version rapportée, le pied de page via
   l'URL du reverse proxy DSM, et les deux tags d'image (`docker images` sur le NAS).
