# Lien vers le dépôt GitHub dans le pied de page (issue #15)

## Besoin

Depuis l'application déployée, rien ne permet de remonter au dépôt du projet — pour signaler un
bogue, lire le changelog ou consulter le code. Le pied de page n'affiche que « Marées Navihan
v1.0.0 ». L'issue #15 demande d'y ajouter un lien vers le GitHub du projet, « là où il y a la
version ».

## Forme retenue

Un lien **icône `bi-github` + libellé « GitHub »**, à la suite du numéro de version, séparé par un
`·`, **dans le bloc centré existant**. Le footer garde donc sa mise en page (`text-center`) : le
passer en flex pour coller le lien au bord droit aurait touché à l'existant sans gain, et le
mobile l'aurait de toute façon replié au centre.

Le **numéro de version reste du texte simple**. Le rendre cliquable vers
`/releases/tag/vX.Y.Z` était tentant, mais le projet ne publie pas de releases GitHub : le lien
tomberait dans le vide.

Décorum : `link-secondary text-decoration-none` pour rester au ton du `<small
class="text-body-secondary">` environnant et suivre les deux thèmes (`data-bs-theme`) sans couleur
en dur. `target="_blank"` + `rel="noopener noreferrer"` (ouverture externe depuis une PWA).
L'icône est décorative (`aria-hidden`) : c'est le mot « GitHub » qui porte le sens.

## URL

Constante `REPO_URL` en dur dans `client/src/App.vue`, à côté de `appVersion`. Le dépôt est stable
et le `package.json` racine n'a pas de champ `repository` ; ajouter un second `define` Vite pour
une valeur figée n'apporterait rien — contrairement à la version, qui change à chaque release.

## Périmètre

Client uniquement. La CSP de `server/src/app.ts` ne contraint pas les cibles de navigation
(`form-action`/`frame-ancestors` ne s'appliquent pas à un `<a href>`) : rien à changer côté serveur.

## Tests

`client/src/App.test.ts` — un test vérifiant que le pied de page porte un lien vers le dépôt, en
`target="_blank"` avec `rel` contenant `noopener`, et libellé « GitHub ». Le test existant sur la
version reste inchangé (son `toMatch` n'est pas ancré en fin de chaîne).
