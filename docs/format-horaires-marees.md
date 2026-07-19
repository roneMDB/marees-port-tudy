# Format du fichier `horaires_marees_port-tudy.json`

> **Public visé : un LLM** chargé de produire / compléter ce fichier à partir de
> **photos de calendriers de marées** (annuaires SHOM, calendriers de pêche, etc.).
> Ce document décrit **exactement** ce que le code attend. Respecte-le à la lettre :
> le serveur ne « devine » rien, il lit les champs tels quels.

Fichier de référence dans le dépôt :
`server/data/horaires_marees_port-tudy.json` (runtime) et la graine tracée
`server/src/resources/horaires_marees_port-tudy.json`. Parsing : `server/src/lib/readTides.ts`.
Consommation : `server/src/service/Maree.ts`.

---

## 1. Vue d'ensemble

- Le fichier ne contient **pas** de relevés horaires continus : il contient **uniquement
  les extrêmes de marée** (les **pleines mers** et **basses mers**), un enregistrement par
  extrême, groupés par **jour**.
- Toutes les heures sont **locales** (`Europe/Paris`), au format **24 h**.
- Les valeurs numériques (`heure`, `hauteur`, `coefficient`) sont stockées **en chaînes de
  caractères** (`"4.59"`, `"71"`), pas en nombres. Le code les convertit lui-même.

---

## 2. Structure attendue (forme recommandée : à plat)

Un objet JSON dont **chaque clé est une date** au format **`YYYY-MM-DD`** et
**chaque valeur est un tableau d'extrêmes** de ce jour :

```json
{
  "2026-06-01": [
    { "maree": "haute", "heure": "05:59", "hauteur": "4.59", "coefficient": "71" },
    { "maree": "haute", "heure": "18:10", "hauteur": "4.77", "coefficient": "71" },
    { "maree": "basse", "heure": "00:02", "hauteur": "1.50" },
    { "maree": "basse", "heure": "12:14", "hauteur": "1.56" }
  ],
  "2026-06-02": [
    { "maree": "haute", "heure": "06:31", "hauteur": "4.55", "coefficient": "70" },
    { "maree": "haute", "heure": "18:44", "hauteur": "4.74", "coefficient": "69" },
    { "maree": "basse", "heure": "00:37", "hauteur": "1.51" },
    { "maree": "basse", "heure": "12:48", "hauteur": "1.62" }
  ]
}
```

**Produis toujours cette forme à plat.** (Une forme alternative « groupée par mois » est
tolérée en lecture — voir §6 — mais ne l'utilise pas pour générer.)

---

## 3. Champs d'un extrême

| Champ         | Obligatoire | Type (JSON) | Format / valeurs                              | Exemple   |
|---------------|-------------|-------------|-----------------------------------------------|-----------|
| `maree`       | **oui**     | string      | `"haute"` (pleine mer) ou `"basse"` (basse mer) — **exactement** ces mots, minuscules | `"haute"` |
| `heure`       | **oui\***   | string      | `"HH:MM"`, 24 h, zéro initial (`"05:59"`, `"00:02"`) | `"18:10"` |
| `hauteur`     | **oui**     | string      | mètres, **point** décimal, 2 décimales        | `"4.59"`  |
| `coefficient` | non         | string      | entier, **uniquement sur les pleines mers**   | `"71"`    |

\* **`heure` est techniquement optionnelle dans le schéma, mais toute entrée sans `heure`
est purement et simplement ignorée** par le service (`mapDay` filtre sur `entry.heure`).
**Donc : n'émets jamais d'entrée sans `heure`.** Si une photo ne donne pas l'heure d'un
extrême, omets l'entrée entière plutôt que de mettre une heure inventée.

### Règles précises

- **`maree`** : seules `"haute"` et `"basse"` sont reconnues. Le mapping interne est
  `haute → high`, `basse → low`. Toute autre valeur casse le rendu.
- **`heure`** :
  - Toujours `HH:MM` sur 5 caractères, séparateur `:`. Ex. minuit = `"00:02"`, midi passé
    = `"12:14"`, `"18:10"`.
  - N'utilise **pas** `h` (`"5h59"` ❌), ni de secondes, ni de suffixe AM/PM.
- **`hauteur`** :
  - En **mètres**, séparateur décimal **point** (`.`), pas de virgule (`"4,59"` ❌).
  - Garde les 2 décimales de la source (`"1.50"`, pas `"1.5"`).
- **`coefficient`** :
  - C'est le **coefficient de marée** (indicateur de marnage, ~**20 à 120**).
  - Il se rapporte à **la pleine mer** : mets-le sur les entrées `"haute"`, **pas** sur les
    `"basse"` (les basses mers n'en portent pas dans les données existantes).
  - Chaîne d'entier, sans zéro de tête superflu (`"71"`, `"95"`, `"100"`).
  - Si le calendrier ne donne qu'**un** coefficient par jour, il est d'usage de le reporter
    sur les deux pleines mers du jour (comme dans les données existantes, où les deux
    pleines mers d'un même jour ont un coef identique ou très proche).

---

## 4. Combien d'extrêmes par jour ?

- **Cas normal : 4 entrées** — 2 pleines mers (`haute`) + 2 basses mers (`basse`).
- **Cas fréquent : 3 entrées.** Le cycle des marées (~12 h 25) décale un peu chaque jour ;
  certains jours n'ont que **3 extrêmes** parce que le 4ᵉ tombe juste après minuit et est
  compté sur le jour voisin. C'est **normal**, ne complète pas artificiellement.

  Exemple réel (une seule pleine mer ce jour-là) :

  ```json
  "2026-06-09": [
    { "maree": "haute", "heure": "12:07", "hauteur": "4.07", "coefficient": "47" },
    { "maree": "basse", "heure": "05:47", "hauteur": "1.95" },
    { "maree": "basse", "heure": "18:20", "hauteur": "2.07" }
  ]
  ```

- L'**ordre des entrées dans le tableau n'a pas d'importance fonctionnelle** : le service
  trie par heure à l'affichage. Dans les données existantes la convention est : les `haute`
  d'abord (matin puis soir), puis les `basse`. **Suis cette convention** pour rester
  cohérent et relisible, mais ce n'est pas obligatoire.

---

## 5. Lire un calendrier de marées (extraction depuis photo)

Les calendriers/annuaires présentent en général, **par jour**, deux colonnes
**« pleine mer »** et **« basse mer »**, chacune avec une sous-ligne **matin** et **soir**,
et pour chaque extrême : **heure**, **hauteur (m)**, et un **coefficient** (souvent une seule
grande valeur par demi-journée, associée à la pleine mer).

Correspondance à appliquer :

| Sur le calendrier            | Champ JSON                          |
|------------------------------|-------------------------------------|
| Ligne « pleine mer »         | `"maree": "haute"`                  |
| Ligne « basse mer »          | `"maree": "basse"`                  |
| Heure de l'extrême           | `"heure"` (convertie en `HH:MM`)    |
| Hauteur en m                 | `"hauteur"` (avec `.`)              |
| Coefficient (marée haute)    | `"coefficient"` (sur les `haute`)   |

Pièges de lecture fréquents :

- **Heures du matin vs soir** : convertis bien en 24 h (une pleine mer « du soir » à
  « 6:10 » = `"18:10"`).
- **Virgule → point** pour les hauteurs.
- **Photo partielle / valeur illisible** : n'invente pas. Omets l'entrée incertaine (si c'est
  l'heure) ou, en dernier recours, signale la date incomplète — ne remplis pas au hasard.
- **Fuseau** : si la source est en UTC/TU, **convertis en heure légale française**
  (`Europe/Paris`, donc +2 h en été / +1 h en hiver). Le fichier est en heure locale.

---

## 6. Forme alternative tolérée en lecture (à NE PAS générer)

Le parseur (`readTides.ts`) accepte aussi des **sections groupées** dont la valeur est un
objet contenant des clés date. Elles sont aplaties vers `{ date: entries }` :

```json
{
  "septembre": {
    "2026-09-01": [ { "maree": "haute", "heure": "07:00", "hauteur": "4.50", "coefficient": "72" } ]
  }
}
```

Règles du parseur :

- Une clé qui **matche `YYYY-MM-DD`** et dont la valeur est un **tableau** → prise telle quelle.
- Sinon, si la valeur est un **objet**, ses **clés date `YYYY-MM-DD`** sont extraites (un seul
  niveau d'imbrication).
- Toute clé qui n'est pas une date valide (au bon niveau) est **ignorée silencieusement**.

➡️ **Pour générer, reste à la forme à plat du §2.** Cette section n'est là que pour expliquer
ce que le code sait lire.

---

## 7. Checklist de validation avant d'écrire le fichier

- [ ] Racine = **objet JSON** (pas un tableau), JSON strictement valide.
- [ ] Chaque clé de jour = **`YYYY-MM-DD`** exact (mois/jour sur 2 chiffres).
- [ ] Chaque valeur de jour = **tableau** d'objets.
- [ ] Chaque objet a `maree` ∈ {`"haute"`, `"basse"`}, un `heure` **`HH:MM`** (24 h) et un
      `hauteur` (mètres, **point** décimal).
- [ ] `coefficient` présent **uniquement** sur les `haute`, chaîne d'entier (~20–120).
- [ ] **Aucune entrée sans `heure`** (elle serait ignorée).
- [ ] Valeurs numériques **entre guillemets** (chaînes), pas de nombres bruts.
- [ ] 3 ou 4 extrêmes par jour (ni 0, ni doublon) ; jours consécutifs, sans trou involontaire.
- [ ] Heures cohérentes : les hauteurs alternent haut/bas dans le temps ; pas de pleine mer et
      basse mer à la même heure.
