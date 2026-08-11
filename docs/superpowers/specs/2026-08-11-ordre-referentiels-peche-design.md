# Ordre des espèces et des engins, réglable (issue #3, suite)

**Date** : 2026-08-11
**Issue** : #3 — carnet de pêche, panneau « Espèces et engins »

## Besoin

Pouvoir **changer l'ordre des espèces** dans le panneau « Espèces et engins », donc dans les listes
déroulantes du formulaire de saisie qui en découlent. L'ordre actuel est celui de la graine, et rien
ne permet de le modifier : une espèce ajoutée après coup atterrit en fin de liste pour toujours,
même si c'est celle qu'on pêche le plus souvent.

## Constat

La moitié du chemin est déjà faite : la table `fishing_refs` porte une colonne **`sort_order`** et
`getRefs` trie dessus (`ORDER BY sort_order, id`). Ce qui manque est l'écriture — `addRef` ajoute en
fin de liste (`nextSortOrder` = max + 1) et `updateRef` ne touche qu'aux libellés.

⚠️ `sort_order` est **global aux deux types**, pas par section : la graine numérote par index (engins
0–2, espèces 3–16). Le regroupement engins / espèces que montre le panneau n'en dépend pas — il est
fait **côté client** en filtrant sur `kind`. C'est heureux, car `nextSortOrder` étant global, un
**engin** ajouté après coup reçoit un rang supérieur à toutes les espèces. Cet ordre global n'a donc
aucune signification propre, et il ne faut pas se mettre à en inventer une.

## Décisions

| Sujet | Décision |
|---|---|
| Geste | **Flèches ↑ / ↓**, une paire par ligne — pas de glisser-déposer |
| Portée du tri | **À l'intérieur de chaque section** (les espèces entre elles, les engins entre eux) |
| Persistance | Serveur, colonne `sort_order` existante — **aucune migration** |
| Route | `POST /api/fishing/refs/reorder` (**admin**), renvoie la liste complète réordonnée |
| Sens de l'écriture | **Serveur d'abord**, puis mise à jour de l'état client depuis sa réponse |

### Pourquoi des flèches et non un glisser-déposer

Le glisser-déposer natif HTML5 (`dragstart`/`drop`) **ne réagit pas au doigt** : il est piloté par
la souris. Or cette application est une PWA utilisée sur téléphone, et ce panneau est un offcanvas
pensé pour le mobile — un tri qui ne marcherait qu'au bureau serait un tri inutilisable là où on s'en
sert. Le rendre tactile demanderait une dépendance (`sortablejs` ≈ 45 ko) dans un projet qui n'en
compte que six côté client, pour un geste **rare** : on réordonne dix-sept entrées une fois, pas tous
les jours. Deux flèches marchent partout — souris, doigt, clavier — sans dépendance, et sont
accessibles sans travail supplémentaire (ce sont des `<button>` avec un `aria-label`).

### Pourquoi un tri par section

Un tri libre mêlant engins et espèces ne veut rien dire : les deux listes ne sont jamais affichées
ensemble (deux sections dans le panneau, deux `<select>` distincts dans le formulaire). Trier « dans
sa section » est donc la seule opération qui ait un sens observable.

### Comment réordonner sans toucher à l'autre section

L'implémentation ne réattribue **pas** des rangs 0..N−1 : elle **redistribue les rangs déjà occupés**
par la section concernée. Concrètement, on relit les `sort_order` des entrées de ce `kind`, on les
trie, puis on les réaffecte dans le nouvel ordre des ids. L'autre section garde ses rangs au bit
près, et l'entrelacement éventuel des deux (cf. l'engin ajouté après coup) est préservé tel quel —
là où un renumérotage global l'aurait silencieusement modifié.

### Validation

Le corps `{ kind, ids }` doit contenir **exactement** l'ensemble des ids de ce `kind` : même
cardinal, mêmes membres. Sinon **400**. Une liste partielle serait ambiguë (que faire des absents ?)
et une liste périmée — un autre onglet vient d'ajouter une espèce — doit échouer bruyamment plutôt
que de faire disparaître l'entrée manquante du tri.

## Design

### Serveur

`db/fishingRefsRepository.ts` — nouvelle fonction pure de bord :

```ts
/** Réordonne les entrées d'un `kind`. `null` si `ids` n'est pas exactement cet ensemble. */
export function reorderRefs(db: DB, kind: FishingRefKind, ids: string[]): FishingRef[] | null
```

`routes/fishing.ts` — `POST /fishing/refs/reorder` (admin, 403 sinon ; 400 si `kind` invalide ou
ensemble d'ids non conforme). ⚠️ **À déclarer avant `PUT /fishing/refs/:id` n'est pas nécessaire ici**
(la route est en `POST`, et aucune route `POST /fishing/refs/:id` n'existe) — c'est précisément
pourquoi `reorder` est un `POST` sur le modèle de `reset`, plutôt qu'un `PUT /fishing/refs/order`
qui, lui, aurait été capté par `PUT /fishing/refs/:id` selon l'ordre de déclaration.

### Client

- `api/fishing.ts` — `reorderRefs(kind, ids): Promise<FishingRef[]>`.
- `composables/useFishingRefs.ts` — `reorder(kind, ids)` : appelle l'API puis remplace `refs` par la
  réponse. **Serveur d'abord**, comme `add`/`update`/`remove`/`reset` : un seul état, aucune logique
  d'annulation.
- `components/FishingRefsPanel.vue` — deux boutons `↑` / `↓` par ligne, désactivés aux extrémités de
  **leur section**, `aria-label` explicite (« Monter Bar »). Le déplacement se calcule sur la liste
  de la section, pas sur `refs` entier.

## Tests

- Repository : réordonne une section ; l'autre section ne bouge pas ; `null` sur ensemble incomplet,
  sur id étranger, sur id d'un autre `kind` ; les rangs réattribués sont bien ceux déjà occupés.
- Route : 200 + liste réordonnée ; 403 hors admin ; 400 sur `kind` inconnu et sur ids non conformes.
- Panneau : la flèche appelle l'API avec le bon ordre ; flèches désactivées en tête et en queue de
  section ; un refus serveur affiche son message.

## Hors périmètre

- Le glisser-déposer (cf. décision ci-dessus).
- Un ordre par utilisateur : `sort_order` est une donnée **serveur**, partagée, comme le reste du
  référentiel.
- Trier les prises ou les sorties : cette page n'est pas concernée.
