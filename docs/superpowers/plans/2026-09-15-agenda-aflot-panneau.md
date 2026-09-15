# Panneau latéral d'agenda des remises à flot — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** remplacer le dépliement « + N autres jours » de la carte « Prochaines remises à flot » par
un panneau latéral (offcanvas) listant **toute la plage de marées disponible**, ouvert depuis un
bouton permanent de la carte.

**Architecture:** l'agenda est calculé par une fonction pure existante, `aflotAgenda`
(`client/src/lib/navihan.ts`), dont on rend le paramètre `days` facultatif et dont on enrichit les
entrées (basse mer d'origine + coefficient de la pleine mer suivante). Un nouveau composant
`AflotAgendaPanel.vue` rend ces données dans un offcanvas Bootstrap monté par `Dashboard.vue`, à
côté de `StatCards.vue` qui garde un aperçu court et porte le bouton d'ouverture.

**Tech Stack:** Vue 3 `<script setup>` + TypeScript strict, Bootstrap 5.3 (offcanvas piloté par les
attributs `data-bs-*`, aucun JS d'ouverture), Vitest + `@vue/test-utils` (jsdom) côté client,
Vitest côté serveur.

**Spec :** `docs/superpowers/specs/2026-09-15-agenda-aflot-panneau-design.md` — à lire avant de
commencer. Ce plan en est la traduction pas à pas.

## Global Constraints

- **Langue** : tout le projet (code, commentaires, libellés, messages de commit, doc) est en
  **français**. Les commentaires expliquent **pourquoi**, pas **quoi**.
- **Commits** : format Conventional Commits (`feat(scope): …`, `test(scope): …`, `docs(scope): …`),
  en français, et se terminant par la ligne
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **TDD** : le test échoue d'abord, pour la bonne raison, avant toute implémentation.
- **Vérification** : `npm test` **et** `npm run type-check` — Vitest passe par esbuild et ne
  vérifie **aucun** type ; une erreur de typage peut laisser tous les tests au vert.
- **Un seul test** : `npx vitest run -t "<nom>"` depuis `client/` ou `server/`.
- **Heures** : l'agenda affiche l'heure **« Remise à flot »** (décalage fixe `offsets.aFlot`),
  **jamais** l'estimation par seuil (cantonnée au tableau du dashboard).
- **Datation** : une heure Navihan est rangée au **jour où elle a réellement lieu** (les décalages
  franchissent minuit) — utiliser `shiftMoment`, jamais `shiftTime`, dès qu'une heure est datée.
- **Ne pas toucher** à `client/src/lib/aflotCalibration.ts` : son comportement est figé par la
  fixture des 18 relevés réels (MAE < 6 min, max < 20).

---

### Task 1 : extraire `nextHighAfter`

**Files:**
- Modify: `client/src/lib/navihan.ts` (ajout de la fonction ; `aflotTimeByThreshold`, l. 116-140)
- Test: `client/src/lib/navihan.test.ts`

**Interfaces:**
- Consumes: `FlatTide` (`../types`), `epochMinutes` (privée, déjà dans le fichier, l. 94)
- Produces: `export function nextHighAfter(ptExtremes: FlatTide[], low: FlatTide): FlatTide | null`

**Pourquoi** : la tâche 2 a besoin de « la pleine mer qui suit cette basse mer » pour en lire le
coefficient. `aflotTimeByThreshold` en porte déjà une copie inline ; on l'extrait plutôt que d'en
écrire une troisième.

- [ ] **Step 1 : écrire le test qui échoue**

Ajouter à la fin de `client/src/lib/navihan.test.ts`, et ajouter `nextHighAfter` à la liste des
imports en tête du fichier (par ordre alphabétique, entre `formatOffset` et `nextAflot`) :

```ts
describe('nextHighAfter', () => {
  const low = tide('2026-07-26', '09:44', 'low', 2.07);

  it('renvoie la première pleine mer qui suit la basse mer', () => {
    const tides = [
      tide('2026-07-26', '03:39', 'high', 3.99), // avant : ignorée
      tide('2026-07-26', '15:54', 'high', 4.3),
      tide('2026-07-27', '04:20', 'high', 4.05)
    ];
    expect(nextHighAfter(tides, low)?.time).toBe('15:54');
  });

  // Une basse mer de fin de soirée trouve sa pleine mer au petit matin **du lendemain** : la
  // comparaison doit porter sur les instants, pas sur les seules heures.
  it('franchit minuit', () => {
    const lateLow = tide('2026-07-26', '22:09', 'low', 1.95);
    const tides = [
      tide('2026-07-26', '15:54', 'high', 4.3),
      tide('2026-07-27', '04:20', 'high', 4.05)
    ];
    const next = nextHighAfter(tides, lateLow);
    expect([next?.date, next?.time]).toEqual(['2026-07-27', '04:20']);
  });

  // Une hauteur manquante rend la pleine mer inexploitable par le modèle de courbe : on prend la
  // suivante plutôt que de renvoyer une entrée inutilisable.
  it('ignore une pleine mer sans hauteur exploitable', () => {
    const tides = [
      tide('2026-07-26', '15:54', 'high', Number.NaN),
      tide('2026-07-27', '04:20', 'high', 4.05)
    ];
    expect(nextHighAfter(tides, low)?.time).toBe('04:20');
  });

  it('renvoie null quand aucune pleine mer ne suit', () => {
    expect(nextHighAfter([tide('2026-07-26', '03:39', 'high', 3.99)], low)).toBeNull();
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

Depuis `client/` : `npx vitest run -t "nextHighAfter"`
Attendu : ÉCHEC — `"nextHighAfter" is not exported by "src/lib/navihan.ts"` (erreur d'import, le
fichier de test ne se charge pas).

- [ ] **Step 3 : écrire la fonction**

Dans `client/src/lib/navihan.ts`, **juste après** la fonction privée `epochMinutes` (l. 94) et
**avant** `aflotThresholdFor`/`aflotTimeByThreshold` :

```ts
/**
 * Première pleine mer **de hauteur exploitable** après `low` : la montante sur laquelle le bateau
 * se remet à flot. La comparaison porte sur les **instants**, donc une basse mer de fin de soirée
 * trouve bien sa pleine mer au petit matin du lendemain.
 *
 * ⚠️ `lib/aflotCalibration.ts` garde sa propre version : la sienne ajoute un garde
 * (hauteur de la pleine mer **supérieure** à celle de la basse mer) et son comportement est figé
 * par la fixture des 18 relevés réels. La mutualiser déplacerait le modèle d'étalonnage sans rien
 * gagner : le partage s'arrête où les sémantiques divergent.
 */
export function nextHighAfter(ptExtremes: FlatTide[], low: FlatTide): FlatTide | null {
  const lowEpoch = epochMinutes(low.date, low.time);
  const next = ptExtremes
    .filter(e => e.type === 'high' && Number.isFinite(e.height))
    .map(e => ({ e, t: epochMinutes(e.date, e.time) }))
    .filter(x => x.t > lowEpoch)
    .sort((p, q) => p.t - q.t)[0];
  return next ? next.e : null;
}
```

- [ ] **Step 4 : lancer le test pour le voir passer**

Depuis `client/` : `npx vitest run -t "nextHighAfter"`
Attendu : PASS — 4 tests.

- [ ] **Step 5 : faire consommer la fonction par `aflotTimeByThreshold`**

Dans `client/src/lib/navihan.ts`, remplacer le bloc de recherche inline (l. 123-132 environ) :

```ts
  const lowEpoch = epochMinutes(low.date, low.time);
  const nextHigh = ptExtremes
    .filter(e => e.type === 'high' && Number.isFinite(e.height))
    .map(e => ({ e, t: epochMinutes(e.date, e.time) }))
    .filter(x => x.t > lowEpoch)
    .sort((p, q) => p.t - q.t)[0];
  if (!nextHigh) return null;
  const a: OffsetPoint = { offset: lowEpoch, height: low.height };
  const b: OffsetPoint = { offset: nextHigh.t, height: nextHigh.e.height };
  const threshold = aflotThresholdFor(nextHigh.e.coefficient, refHeight);
```

par :

```ts
  const lowEpoch = epochMinutes(low.date, low.time);
  const nextHigh = nextHighAfter(ptExtremes, low);
  if (!nextHigh) return null;
  const a: OffsetPoint = { offset: lowEpoch, height: low.height };
  const b: OffsetPoint = { offset: epochMinutes(nextHigh.date, nextHigh.time), height: nextHigh.height };
  const threshold = aflotThresholdFor(nextHigh.coefficient, refHeight);
```

- [ ] **Step 6 : vérifier que rien n'a bougé**

Depuis `client/` : `npx vitest run src/lib/navihan.test.ts src/lib/aflotCalibration.test.ts`
Attendu : PASS sur les deux fichiers. `aflotCalibration.test.ts` est le garde-fou du modèle
(MAE < 6 min) : s'il rougit, l'extraction a changé la sémantique — revenir en arrière.

- [ ] **Step 7 : commit**

```bash
git add client/src/lib/navihan.ts client/src/lib/navihan.test.ts
git commit -m "$(cat <<'MSG'
refactor(navihan): extrait nextHighAfter de aflotTimeByThreshold

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2 : `aflotAgenda` sans plafond et enrichi

**Files:**
- Modify: `client/src/lib/navihan.ts` (interface `AflotTime` l. 194-197, `aflotAgenda` l. 205-238)
- Test: `client/src/lib/navihan.test.ts` (bloc `describe('aflotAgenda', …)` existant, l. 169+)

**Interfaces:**
- Consumes: `nextHighAfter` (tâche 1)
- Produces:
  - `interface AflotTime { time: string; past: boolean; basse: FlatTide; coefficient: number | null }`
  - `function aflotAgenda(tides: FlatTide[], offsets: NavihanOffsets, now: Date, days?: number): AflotDay[]`

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter ces trois tests **dans** le `describe('aflotAgenda', …)` existant de
`client/src/lib/navihan.test.ts` (il définit déjà `offsets` et `tides` en tête du bloc) :

```ts
  // Le panneau latéral (`AflotAgendaPanel`) liste toute la plage : `days` y est omis.
  it('liste toute la plage disponible quand `days` est omis', () => {
    const days = aflotAgenda(tides, offsets, new Date('2026-07-26T00:00:00'));
    expect(days.map(d => d.date)).toEqual([
      '2026-07-26',
      '2026-07-27',
      '2026-07-28',
      '2026-07-29'
    ]);
  });

  it('porte la basse mer Port-Tudy dont chaque remise à flot découle', () => {
    const [day26] = aflotAgenda(tides, offsets, new Date('2026-07-26T00:00:00'), 1);
    expect([day26.times[0].basse.date, day26.times[0].basse.time]).toEqual([
      '2026-07-26',
      '09:44'
    ]);
  });

  // Une basse mer ne porte pas de coefficient : c'est celui de la **pleine mer suivante**, la
  // montante sur laquelle on se remet à flot, qui qualifie la remise à flot.
  it('porte le coefficient de la pleine mer suivante', () => {
    const withCoef: FlatTide[] = [
      { date: '2026-07-26', time: '09:44', height: 2.07, type: 'low', coefficient: null, navihan: {} },
      { date: '2026-07-26', time: '15:54', height: 4.3, type: 'high', coefficient: 48, navihan: {} },
      { date: '2026-07-26', time: '22:09', height: 1.95, type: 'low', coefficient: null, navihan: {} },
      { date: '2026-07-27', time: '04:20', height: 4.05, type: 'high', coefficient: 52, navihan: {} }
    ];
    const days = aflotAgenda(withCoef, offsets, new Date('2026-07-26T00:00:00'));
    // 09:44 → coef de la pleine mer de 15:54 ; 22:09 (à-flot le 27) → coef de celle du 27 à 04:20.
    expect(days[0].times.map(t => t.coefficient)).toEqual([48]);
    expect(days[1].times.map(t => t.coefficient)).toEqual([52]);
  });
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Deux commandes, car les trois tests n'échouent pas au même endroit.

1. `npx vitest run src/lib/navihan.test.ts -t "aflotAgenda"` depuis `client/`
   Attendu : ÉCHEC des deux tests sur `basse` et `coefficient` —
   `Cannot read properties of undefined (reading 'date')` pour le premier,
   `expected [ undefined ] to deeply equal [ 48 ]` pour le second.
   ⚠️ Le test « sans `days` » **passe déjà** : `slice(0, undefined)` renvoie tout le tableau. Le
   manque est un manque de **type**, pas de comportement — d'où la commande suivante.
2. `npm -w client run type-check` depuis la racine
   Attendu : ÉCHEC — `Expected 4 arguments, but got 3` sur l'appel sans `days` du fichier de test.

- [ ] **Step 3 : enrichir `AflotTime`**

Dans `client/src/lib/navihan.ts`, remplacer l'interface (l. 194-197) :

```ts
export interface AflotTime {
  time: string; // heure `HH:MM`
  past: boolean; // déjà passée par rapport à `now`
  /** Basse mer **Port-Tudy** dont cette remise à flot découle (pour en citer l'heure Navihan). */
  basse: FlatTide;
  /**
   * Coefficient de la pleine mer **suivante** — la montante qui remet le bateau à flot. Une basse
   * mer n'en porte pas, et le coefficient « du jour » serait faux au bord : une remise à flot
   * rangée au lendemain après minuit se verrait attribuer celui d'un jour dont elle ne dépend pas.
   */
  coefficient: number | null;
}
```

- [ ] **Step 4 : rendre `days` facultatif et remplir les nouveaux champs**

Remplacer le corps de `aflotAgenda` (l. 216-238) :

```ts
export function aflotAgenda(
  tides: FlatTide[],
  offsets: NavihanOffsets,
  now: Date,
  days?: number
): AflotDay[] {
  const today = localDate(now);
  const byDay = new Map<string, AflotTime[]>();

  // `aflotEvents` est déjà trié : l'ordre d'insertion des heures est donc chronologique.
  for (const { dt, basse } of aflotEvents(tides, offsets)) {
    const date = localDate(dt);
    if (date < today) continue;
    const times = byDay.get(date) ?? [];
    times.push({
      time: localTime(dt),
      past: dt < now,
      basse,
      coefficient: nextHighAfter(tides, basse)?.coefficient ?? null
    });
    byDay.set(date, times);
  }

  const sorted = Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  // `days` omis → toute la plage disponible (c'est ce dont le panneau latéral a besoin).
  return (days == null ? sorted : sorted.slice(0, days)).map(([date, times]) => ({ date, times }));
}
```

Et compléter le commentaire de tête de la fonction (l. 205-215) : remplacer
« sur les `days` premiers jours à partir de celui de `now` (inclus). » par
« sur les `days` premiers jours à partir de celui de `now` (inclus), ou sur **toute la plage
disponible** si `days` est omis. »

- [ ] **Step 5 : lancer les tests pour les voir passer**

Depuis `client/` : `npx vitest run src/lib/navihan.test.ts`
Attendu : PASS — l'ensemble du fichier, les tests existants d'`aflotAgenda` inclus (ils passent un
`days` explicite et ne changent pas de comportement).

- [ ] **Step 6 : vérifier les types**

Depuis la racine : `npm -w client run type-check`
Attendu : aucune erreur — l'appel sans `days` du step 2 est désormais légal. `StatCards.vue`
consomme `AflotTime` sans lire les nouveaux champs, ce qui reste valide.

- [ ] **Step 7 : commit**

```bash
git add client/src/lib/navihan.ts client/src/lib/navihan.test.ts
git commit -m "$(cat <<'MSG'
feat(navihan): aflotAgenda sans plafond, avec basse mer et coefficient

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3 : le composant `AflotAgendaPanel.vue`

**Files:**
- Create: `client/src/components/AflotAgendaPanel.vue`
- Create: `client/src/components/AflotAgendaPanel.test.ts`
- Modify: `client/src/assets/app.css` (accueille `.aflot-past`)
- Modify: `client/src/components/StatCards.vue` (retire `.aflot-past` de son `<style scoped>`)

**Interfaces:**
- Consumes: `aflotAgenda(tides, offsets, now)` et `shiftMoment(date, time, minutes)`
  (`../lib/navihan`), `AflotTime.basse` / `AflotTime.coefficient` (tâche 2),
  `coefBand(coef)` / `formatDate(date, opts?)` / `todayKey()` / `addDays(date, n)` (`../lib/format`),
  `useNavihan()` → `{ offsets }`
- Produces: un offcanvas d'`id="aflotAgendaOffcanvas"` — c'est cet identifiant que la tâche 4 cible
  depuis la carte via `data-bs-target`.

À la fin de cette tâche le panneau existe et est testé, mais **rien ne l'ouvre encore** : le bouton
arrive en tâche 4.

- [ ] **Step 1 : écrire le test qui échoue**

Créer `client/src/components/AflotAgendaPanel.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AflotAgendaPanel from './AflotAgendaPanel.vue';
import { useSettings } from '../composables/useSettings';
import type { FlatTide } from '../types';

// `useSettings` persiste toute mutation via un `watch` débouncé : sans ce mock, piloter les
// réglages déclencherait un vrai `fetch` dans jsdom.
vi.mock('../api/settings', () => ({
  getSettings: vi.fn().mockResolvedValue({}),
  saveSettings: vi.fn().mockResolvedValue(undefined)
}));

/**
 * Vraies marées Port-Tudy des 26 et 27/07/2026. Avec le décalage fixe de 2h40, les remises à flot
 * tombent le 26 à 12:24, puis le **27** à 00:49 (la basse mer de 22:09 franchit minuit) et 13:08.
 */
const tides: FlatTide[] = [
  { date: '2026-07-26', time: '03:39', height: 3.99, type: 'high', coefficient: 44, navihan: {} },
  { date: '2026-07-26', time: '09:44', height: 2.07, type: 'low', coefficient: null, navihan: {} },
  { date: '2026-07-26', time: '15:54', height: 4.3, type: 'high', coefficient: 48, navihan: {} },
  { date: '2026-07-26', time: '22:09', height: 1.95, type: 'low', coefficient: null, navihan: {} },
  { date: '2026-07-27', time: '04:20', height: 4.05, type: 'high', coefficient: 52, navihan: {} },
  { date: '2026-07-27', time: '10:28', height: 1.88, type: 'low', coefficient: null, navihan: {} },
  { date: '2026-07-27', time: '16:38', height: 4.35, type: 'high', coefficient: 55, navihan: {} }
];

const mountPanel = (allTides = tides) => mount(AflotAgendaPanel, { props: { allTides } });
const dayBlocks = (w: ReturnType<typeof mountPanel>) => w.findAll('.agenda-day');
const slots = (w: ReturnType<typeof mountPanel>) => w.findAll('.agenda-slot');
/** Le créneau dont la pastille d'heure porte `time`. */
const slotAt = (w: ReturnType<typeof mountPanel>, time: string) =>
  slots(w).find(s => s.text().includes(time))!;

describe('AflotAgendaPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-26T08:00:00'));
    useSettings().settings.navihan.aFlot = 160; // 2h40, valeur par défaut
    useSettings().settings.navihan.basseMer = 75; // 1h15
  });

  afterEach(() => {
    // Réglages = singleton partagé : on restaure les défauts pour ne pas contaminer les cas suivants.
    useSettings().settings.aFlotDays = 3;
    useSettings().settings.navihan.aFlot = 160;
    useSettings().settings.navihan.basseMer = 75;
    vi.useRealTimers();
  });

  // Le panneau existe précisément pour échapper au plafond de la carte.
  it('liste toute la plage, sans se laisser borner par le réglage de la carte', () => {
    useSettings().settings.aFlotDays = 1;
    const wrapper = mountPanel();
    expect(dayBlocks(wrapper)).toHaveLength(2);
    expect(slots(wrapper).map(s => s.get('.agenda-time').text())).toEqual([
      '12:24',
      '00:49',
      '13:08'
    ]);
  });

  it('affiche le coefficient de la pleine mer suivante', () => {
    const wrapper = mountPanel();
    expect(slotAt(wrapper, '12:24').get('.agenda-coef').text()).toBe('48');
    expect(slotAt(wrapper, '00:49').get('.agenda-coef').text()).toBe('52');
  });

  // La carte comme le panneau sont entièrement en heures Navihan : 22:09 + 1h15 = 23:24.
  it('cite la basse mer Navihan, pas celle de Port-Tudy', () => {
    const slot = slotAt(mountPanel(), '00:49');
    expect(slot.text()).toContain('23:24');
    expect(slot.text()).not.toContain('22:09');
  });

  // ~14 % des remises à flot ont lieu le lendemain de leur basse mer : sans la date, le « 23:24 »
  // se lirait comme une heure du 27.
  it('date la basse mer quand elle tombe la veille de la remise à flot', () => {
    expect(slotAt(mountPanel(), '00:49').text()).toContain('26 juil.');
  });

  it("n'encombre pas d'une date la basse mer du même jour", () => {
    expect(slotAt(mountPanel(), '12:24').text()).not.toContain('juil.');
  });

  it("repère aujourd'hui et demain", () => {
    const wrapper = mountPanel();
    expect(dayBlocks(wrapper)[0].text()).toContain("aujourd'hui");
    expect(dayBlocks(wrapper)[1].text()).toContain('demain');
  });

  // Un agenda ne se vide pas au fil de la journée : l'heure passée reste listée, estompée.
  it('estompe les heures déjà passées sans les retirer', () => {
    vi.setSystemTime(new Date('2026-07-26T16:00:00'));
    const wrapper = mountPanel();
    expect(slotAt(wrapper, '12:24').get('.agenda-time').classes()).toContain('aflot-past');
    expect(slotAt(wrapper, '13:08').get('.agenda-time').classes()).not.toContain('aflot-past');
  });

  it('annonce une plage vide plutôt qu’une liste blanche', () => {
    const wrapper = mountPanel([]);
    expect(dayBlocks(wrapper)).toHaveLength(0);
    expect(wrapper.text()).toContain('Aucune remise à flot');
  });
});
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

Depuis `client/` : `npx vitest run src/components/AflotAgendaPanel.test.ts`
Attendu : ÉCHEC — `Failed to resolve import "./AflotAgendaPanel.vue"`.

- [ ] **Step 3 : écrire le composant**

Créer `client/src/components/AflotAgendaPanel.vue` :

```vue
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { FlatTide } from '../types';
import { aflotAgenda, shiftMoment } from '../lib/navihan';
import { addDays, coefBand, formatDate, todayKey } from '../lib/format';
import { useNavihan } from '../composables/useNavihan';

const props = defineProps<{ allTides: FlatTide[] }>();

const { offsets } = useNavihan();

/**
 * `now` sert à estomper les heures déjà passées. Il est rafraîchi **à chaque ouverture** du
 * panneau : l'app reste volontiers ouverte des heures, et un agenda figé sur l'instant du montage
 * du dashboard afficherait comme « à venir » des remises à flot dépassées depuis longtemps.
 */
const now = ref(new Date());
function refresh(): void {
  now.value = new Date();
}

let el: HTMLElement | null = null;
onMounted(() => {
  el = document.getElementById('aflotAgendaOffcanvas');
  el?.addEventListener('show.bs.offcanvas', refresh);
});
onUnmounted(() => el?.removeEventListener('show.bs.offcanvas', refresh));

// Pas de `days` : toute la plage disponible, du jour courant à la fin des horaires.
const days = computed(() => aflotAgenda(props.allTides, offsets, now.value));

/** Date longue, pour un panneau qui court sur plusieurs mois (« lundi 27 juillet »). */
const longDate = (date: string): string =>
  formatDate(date, { weekday: 'long', day: '2-digit', month: 'long' });

/**
 * « aujourd'hui » / « demain », sinon `null` : la date longue est déjà en tête de bloc, et
 * `relativeDayLabel` la répéterait pour tous les autres jours.
 */
function dayHint(date: string): string | null {
  const today = todayKey();
  if (date === today) return "aujourd'hui";
  if (date === addDays(today, 1)) return 'demain';
  return null;
}

/**
 * Basse mer **Navihan** dont une remise à flot découle, datée de son **propre** jour : le décalage
 * `basseMer` franchit lui aussi minuit.
 */
const lowMoment = (basse: FlatTide): { date: string; time: string } =>
  shiftMoment(basse.date, basse.time, offsets.basseMer);
</script>

<template>
  <div
    id="aflotAgendaOffcanvas"
    class="offcanvas offcanvas-end"
    tabindex="-1"
    aria-labelledby="aflotAgendaOffcanvasLabel"
  >
    <div class="offcanvas-header border-bottom">
      <h5 id="aflotAgendaOffcanvasLabel" class="offcanvas-title mb-0">
        <i class="bi bi-life-preserver me-1"></i> Remises à flot
      </h5>
      <button
        type="button"
        class="btn-close ms-auto"
        data-bs-dismiss="offcanvas"
        aria-label="Fermer"
      ></button>
    </div>

    <div class="offcanvas-body">
      <p class="text-muted small">
        Heure « Remise à flot » (décalage fixe), dérivée des basses mers de Port-Tudy, sur tous les
        horaires disponibles.
      </p>

      <p v-if="!days.length" class="text-muted">
        Aucune remise à flot à venir sur les horaires disponibles.
      </p>

      <div v-for="d in days" :key="d.date" class="agenda-day border-bottom py-2">
        <div class="fw-semibold text-capitalize">
          {{ longDate(d.date) }}
          <span v-if="dayHint(d.date)" class="fw-normal text-muted small ms-1">
            · {{ dayHint(d.date) }}
          </span>
        </div>

        <div
          v-for="t in d.times"
          :key="t.time"
          class="agenda-slot d-flex flex-wrap align-items-baseline gap-2 mt-1"
        >
          <span
            class="agenda-time badge rounded-pill fw-semibold"
            :class="t.past
              ? 'aflot-past bg-body-secondary text-secondary-emphasis'
              : 'bg-success-subtle text-success-emphasis'"
            :title="t.past ? 'Déjà passée' : undefined"
          >{{ t.time }}</span>

          <span
            class="agenda-coef badge rounded-pill"
            :class="coefBand(t.coefficient).badgeClass"
            :title="`Coefficient · ${coefBand(t.coefficient).label}`"
          >{{ t.coefficient ?? '—' }}</span>

          <span class="small text-muted">
            Basse mer Navihan · {{ lowMoment(t.basse).time }}
            <template v-if="lowMoment(t.basse).date !== d.date">
              · <span class="text-capitalize">{{ formatDate(lowMoment(t.basse).date) }}</span>
            </template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.offcanvas {
  --bs-offcanvas-width: 420px;
}

/* Le dernier jour ne porte pas de liseré : il n'y a rien après lui à séparer. */
.agenda-day:last-child {
  border-bottom: 0 !important;
}
</style>
```

- [ ] **Step 4 : déplacer `.aflot-past` dans les styles globaux**

Le composant rend `.aflot-past`, aujourd'hui définie dans le `<style scoped>` de `StatCards.vue` :
scopée, elle ne s'appliquerait pas ici. Deux composants la rendant désormais, elle monte dans les
styles globaux — même raison que la palette des pastilles Navihan.

Retirer de `client/src/components/StatCards.vue`, à la fin de son `<style scoped>` :

```css
/* Heure déjà passée : listée mais estompée, pour garder un agenda stable sur la journée. */
.aflot-past {
  opacity: 0.55;
}
```

Et l'ajouter à la fin de `client/src/assets/app.css` :

```css
/* Remise à flot déjà passée : listée mais estompée, pour garder un agenda stable sur la journée.
   Globale (pas `scoped`) : la carte `StatCards` **et** le panneau `AflotAgendaPanel` la rendent. */
.aflot-past {
  opacity: 0.55;
}
```

- [ ] **Step 5 : lancer le test pour le voir passer**

Depuis `client/` : `npx vitest run src/components/AflotAgendaPanel.test.ts`
Attendu : PASS — 8 tests.

- [ ] **Step 6 : vérifier que la carte n'a pas régressé**

Depuis `client/` : `npx vitest run src/components/StatCards.test.ts`
Attendu : PASS — `.aflot-past` n'est plus qu'un nom de classe pour ces tests, son déplacement est
sans effet sur eux.

- [ ] **Step 7 : commit**

```bash
git add client/src/components/AflotAgendaPanel.vue client/src/components/AflotAgendaPanel.test.ts \
        client/src/components/StatCards.vue client/src/assets/app.css
git commit -m "$(cat <<'MSG'
feat(aflot): panneau latéral listant toutes les remises à flot

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4 : la carte ouvre le panneau et perd son dépliement

**Files:**
- Modify: `client/src/components/StatCards.vue` (`<script setup>` et carte « Prochaines remises à flot »)
- Modify: `client/src/components/StatCards.test.ts` (bloc `describe('StatCards — repli …')`)
- Modify: `client/src/views/Dashboard.vue` (import + montage du panneau)

**Interfaces:**
- Consumes: l'offcanvas `#aflotAgendaOffcanvas` (tâche 3), `aflotAgenda(tides, offsets, now, days)`
- Produces: la fonctionnalité complète — c'est à la fin de cette tâche qu'elle est utilisable.

- [ ] **Step 1 : réécrire les tests de la carte**

Dans `client/src/components/StatCards.test.ts`, **remplacer** le helper `toggle` (l. 24) :

```ts
const toggle = (w: ReturnType<typeof mount>) => w.find('[aria-controls="aflot-days-list"]');
```

par :

```ts
/** Bouton d'ouverture du panneau d'agenda (offcanvas piloté par les attributs Bootstrap). */
const agendaButton = (w: ReturnType<typeof mount>) =>
  w.find('[data-bs-target="#aflotAgendaOffcanvas"]');
```

Puis, dans le `describe('StatCards — repli de la carte « Prochaines remises à flot »', …)` :
renommer le bloc en `describe('StatCards — carte « Prochaines remises à flot »', …)`, remplacer
dans son `beforeEach` la ligne `useSettings().settings.aFlotDays = 7;` par
`useSettings().settings.aFlotDays = 3;`, et **supprimer** les six tests du dépliement :
« n’affiche que 3 jours au repos », « annonce le nombre de jours masqués », « déplie tous les jours
au clic, puis replie », « n’affiche aucun bouton quand tous les jours tiennent », « accorde le
libellé au singulier pour un seul jour masqué », « referme la carte si le réglage retombe sous le
budget pendant qu’elle est dépliée ».

Les remplacer par :

```ts
  it('liste les jours du réglage', () => {
    const wrapper = mount(StatCards, { props: { allTides: tides } });
    expect(rows(wrapper)).toHaveLength(3);
  });

  it('suit le réglage à la baisse', () => {
    useSettings().settings.aFlotDays = 2;
    const wrapper = mount(StatCards, { props: { allTides: tides } });
    expect(rows(wrapper)).toHaveLength(2);
  });

  // Le panneau n'est pas un « déplier autrement » : c'est une destination stable, dont l'accès ne
  // doit pas dépendre d'un réglage.
  it('offre toujours le panneau, même quand tous les jours tiennent dans la carte', () => {
    const wrapper = mount(StatCards, { props: { allTides: tides } });
    expect(agendaButton(wrapper).exists()).toBe(true);
    expect(agendaButton(wrapper).attributes('data-bs-toggle')).toBe('offcanvas');
  });

  it('ne déplie plus la carte', () => {
    const wrapper = mount(StatCards, { props: { allTides: tides } });
    expect(wrapper.text()).not.toContain('autres jours');
    expect(wrapper.text()).not.toContain('Voir moins');
  });
```

- [ ] **Step 2 : lancer les tests pour les voir échouer**

Depuis `client/` : `npx vitest run src/components/StatCards.test.ts`
Attendu : ÉCHEC — « offre toujours le panneau » et « ne déplie plus la carte » rougissent
(`agendaButton(...).exists()` vaut `false`, et le texte contient encore « + 4 autres jours »).
Les deux premiers tests, eux, passent déjà.

- [ ] **Step 3 : simplifier le `<script setup>` de la carte**

Dans `client/src/components/StatCards.vue`, **supprimer** tout le bloc `COLLAPSED_DAYS` /
`expanded` / `shownAflotDays` / `hiddenDays` / `canExpand` / `watch` (du commentaire
« Jours affichés au repos… » jusqu'à la fermeture du `watch`), et ramener la première ligne
d'import à :

```ts
import { computed } from 'vue';
```

Le commentaire de tête d'`aflotDays` devient :

```ts
// Agenda des remises à flot (décalage fixe `aFlot`, pas l'estimation par seuil) sur les
// `aFlotDays` prochains jours, chacune rangée au jour où elle a **réellement** lieu. Les heures
// passées restent listées (estompées) : c'est un agenda, pas un compte à rebours.
//
// La carte est un **aperçu court** : son budget de 3 lignes — calé sur la hauteur des trois autres
// cartes de la rangée, dont elle imposerait sinon la hauteur — est tenu par la **borne du
// réglage** (`aFlotDays` ∈ [1, 3], bornée à la lecture comme à l'écriture par `sanitizeSettings`).
// Un plafond ici serait du code que rien ne peut atteindre. L'agenda complet est dans
// `AflotAgendaPanel`.
const aflotDays = computed(() =>
  aflotAgenda(props.allTides, offsets, new Date(), settings.aFlotDays)
);
```

- [ ] **Step 4 : remplacer le dépliement par le bouton d'ouverture**

Toujours dans `StatCards.vue`, dans la carte « Prochaines remises à flot » : remplacer
`v-for="d in shownAflotDays"` par `v-for="d in aflotDays"`, retirer l'attribut
`id="aflot-days-list"` du `<div class="aflot-list …">` (plus rien ne le référence), et remplacer
tout le `<button v-if="canExpand" …>…</button>` par :

```html
                <button
                  type="button"
                  class="btn btn-link btn-sm p-0 mt-1 small text-decoration-none align-self-start"
                  data-bs-toggle="offcanvas"
                  data-bs-target="#aflotAgendaOffcanvas"
                  aria-controls="aflotAgendaOffcanvas"
                >
                  Voir l'agenda complet<i class="bi bi-chevron-right ms-1"></i>
                </button>
```

⚠️ Ce bouton doit sortir du `<template v-else>` pour être rendu **aussi** quand il n'y a aucune
remise à flot (le panneau sait dire « aucune ») : le placer **après** la fermeture de ce
`</template>`, avant la fermeture du `<div class="flex-grow-1">`.

- [ ] **Step 5 : lancer les tests pour les voir passer**

Depuis `client/` : `npx vitest run src/components/StatCards.test.ts`
Attendu : PASS — l'ensemble du fichier.

- [ ] **Step 6 : monter le panneau dans le dashboard**

Dans `client/src/views/Dashboard.vue`, ajouter l'import à côté de celui de `StatCards` (l. 11) :

```ts
import AflotAgendaPanel from '../components/AflotAgendaPanel.vue';
```

et, dans le `<template v-else>`, juste après `<StatCards :all-tides="allTides" />` (l. 64) :

```html
      <AflotAgendaPanel :all-tides="allTides" />
```

Le panneau est monté **en frère** de `StatCards` : les deux reçoivent déjà `allTides`, `StatCards`
reste une rangée de tuiles, et l'offcanvas n'est pas imbriqué dans un `.card`. Le bouton le
rejoint par son `id`, les attributs `data-bs-*` de Bootstrap ne demandant aucune parenté.

- [ ] **Step 7 : vérifier l'ensemble du client**

Depuis la racine : `npm -w client test && npm -w client run type-check`
Attendu : tous les tests client au vert, aucune erreur de type.

- [ ] **Step 8 : commit**

```bash
git add client/src/components/StatCards.vue client/src/components/StatCards.test.ts \
        client/src/views/Dashboard.vue
git commit -m "$(cat <<'MSG'
feat(aflot): la carte ouvre le panneau d'agenda au lieu de se déplier

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5 : borner `aFlotDays` à 3

**Files:**
- Modify: `server/src/service/SettingsStore.ts` (commentaire du type l. 25, `clampInt` l. 102)
- Modify: `server/src/service/SettingsStore.test.ts`
- Modify: `client/src/types.ts` (commentaire du champ, l. 146)
- Modify: `client/src/components/SettingsPanel.vue` (`setAFlotDays` l. 47-49, champ l. 229-240)

**Interfaces:**
- Consumes: rien des tâches précédentes.
- Produces: l'invariant sur lequel la carte s'appuie (tâche 4, step 3) — `settings.aFlotDays` ne
  dépasse jamais 3, y compris pour une base qui stocke encore 7 ou 14.

- [ ] **Step 1 : écrire le test qui échoue**

Dans `server/src/service/SettingsStore.test.ts`, ajouter à la suite du test qui vérifie déjà le
bornage bas (`aFlotDays: 0` → `1`) :

```ts
  // La carte n'a la place que de 3 lignes : au-delà, le réglage ne ferait plus rien. Les bases
  // amorcées avant le panneau d'agenda stockent encore 7 ou 14 — `sanitizeSettings` passant aussi
  // à la **lecture**, elles sont servies bornées, sans migration.
  it('borne aFlotDays au budget de la carte', () => {
    expect(sanitizeSettings({ aFlotDays: 14 }).aFlotDays).toBe(3);
  });
```

- [ ] **Step 2 : lancer le test pour le voir échouer**

Depuis `server/` : `npx vitest run -t "borne aFlotDays"`
Attendu : ÉCHEC — `expected 14 to be 3`.

- [ ] **Step 3 : borner côté serveur**

Dans `server/src/service/SettingsStore.ts`, remplacer (l. 102) :

```ts
    aFlotDays: clampInt(o.aFlotDays, 1, 14, DEFAULT_SETTINGS.aFlotDays),
```

par :

```ts
    aFlotDays: clampInt(o.aFlotDays, 1, 3, DEFAULT_SETTINGS.aFlotDays),
```

et le commentaire du champ dans le type `Settings` (l. 25) :

```ts
  aFlotDays: number; // jours listés sur la **carte** (1–3) ; l'agenda complet est dans le panneau
```

- [ ] **Step 4 : lancer les tests pour les voir passer**

Depuis `server/` : `npx vitest run src/service/SettingsStore.test.ts`
Attendu : PASS — l'ensemble du fichier, `DEFAULT_SETTINGS.aFlotDays` valant 3, il est inchangé.

- [ ] **Step 5 : aligner le formulaire de réglages**

Dans `client/src/components/SettingsPanel.vue`, remplacer :

```ts
function setAFlotDays(event: Event): void {
  settings.aFlotDays = clamp(Number((event.target as HTMLInputElement).value), 1, 14);
}
```

par :

```ts
function setAFlotDays(event: Event): void {
  settings.aFlotDays = clamp(Number((event.target as HTMLInputElement).value), 1, 3);
}
```

et, dans le champ correspondant, `max="14"` par `max="3"`, le libellé et le texte d'aide par :

```html
          <label class="form-label small text-muted mb-1">Jours listés sur la carte (1–3)</label>
```

```html
          <div class="form-text">
            aperçu de la carte « Prochaines remises à flot » ; l'agenda complet est dans le panneau
          </div>
```

Aligner enfin le commentaire du champ dans `client/src/types.ts` (l. 146) :

```ts
  aFlotDays: number; // jours listés sur la carte « Prochaines remises à flot » (1–3)
```

- [ ] **Step 6 : vérifier les deux workspaces**

Depuis la racine : `npm test && npm run type-check`
Attendu : tous les tests serveur **et** client au vert, aucune erreur de type.

- [ ] **Step 7 : commit**

```bash
git add server/src/service/SettingsStore.ts server/src/service/SettingsStore.test.ts \
        client/src/components/SettingsPanel.vue client/src/types.ts
git commit -m "$(cat <<'MSG'
feat(settings): borne aFlotDays au budget de la carte (1-3)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6 : documentation et vérification finale

**Files:**
- Modify: `CLAUDE.md` (sections « Client », « Fichiers clés », description de `aFlotDays`)

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: rien de consommé par une tâche ultérieure.

`CLAUDE.md` est la carte du projet et documente les décisions qui ne se lisent pas dans le code.
Trois passages mentionnent le dépliement et deviennent faux.

- [ ] **Step 1 : mettre à jour la description de la carte**

Dans `CLAUDE.md`, dans le paragraphe `StatCards.vue`, remplacer la phrase qui va de
« Comme cette carte est la plus haute de la rangée, elle **imposerait** sa hauteur : » jusqu'à
« …refermé automatiquement si `aFlotDays` retombe sous le budget. » par :

```markdown
  Comme cette carte est la plus haute de la rangée, elle **imposerait** sa hauteur : son budget est
  de **3 lignes** (calé sur les 3 autres cartes), tenu non par un plafond dans le composant mais par
  la **borne du réglage** `aFlotDays` ∈ [1, 3] — `sanitizeSettings` bornant à la **lecture** comme à
  l'écriture, une base antérieure qui stocke 7 ou 14 est servie bornée, sans migration. L'agenda
  complet vit dans **`AflotAgendaPanel`** (cf. ci-dessous), ouvert par un bouton **toujours présent**
  de la carte : le panneau est une destination stable, son accès ne doit pas dépendre d'un réglage.
  ⚠️ Ne pas réintroduire le dépliement « + N autres jours » qu'il remplace : déplier étirait toute
  la rangée, c'est-à-dire exactement ce que le budget cherchait à éviter.
```

- [ ] **Step 2 : documenter le panneau**

Toujours dans la section « Client » de `CLAUDE.md`, ajouter une entrée juste après celle de
`StatCards.vue` :

```markdown
- `components/AflotAgendaPanel.vue` — **panneau « Remises à flot »** (offcanvas `offcanvas-end`,
  monté par `Dashboard.vue` en frère de `StatCards`) : agenda des remises à flot sur **toute la
  plage disponible** (aujourd'hui → fin des horaires), un bloc par jour, chaque créneau portant
  l'heure « Remise à flot » (décalage **fixe**, jamais l'estimation par seuil), le **coefficient de
  la pleine mer suivante** (`AflotTime.coefficient` — une basse mer n'en porte pas, et le coef « du
  jour » serait faux pour un à-flot rangé au lendemain) et la **basse mer Navihan** dont il découle,
  datée de son propre jour et **écrite seulement** quand elle diffère. ⚠️ **Ouvert à tous les
  rôles**, contrairement aux six autres offcanvas, tous admin-only : lire un agenda de marées n'est
  pas de l'administration. `now` est rafraîchi sur `show.bs.offcanvas` (l'app reste ouverte des
  heures ; sinon des remises à flot dépassées s'afficheraient comme à venir). `aflotAgenda` appelée
  **sans `days`** rend toute la plage. `.aflot-past` a quitté le `scoped` de `StatCards` pour
  `assets/app.css`, deux composants la rendant désormais. `AflotAgendaPanel.test.ts`.
```

- [ ] **Step 3 : mettre à jour « Fichiers clés »**

Dans la section « Fichiers clés » de `CLAUDE.md`, après la ligne
`- `client/src/views/Dashboard.vue` + `client/src/components/*.vue` — dashboard.`, ajouter :

```markdown
- `client/src/components/AflotAgendaPanel.vue` — panneau latéral d'agenda des remises à flot.
```

- [ ] **Step 4 : vérification finale**

Depuis la racine : `npm test && npm run type-check`
Attendu : tests serveur **et** client au vert, aucune erreur de type. Ne rien annoncer comme
terminé avant d'avoir lu cette sortie.

- [ ] **Step 5 : vérification visuelle**

Depuis la racine : `npm run dev`, puis ouvrir `http://localhost:5173`. Contrôler :
1. la carte « Prochaines remises à flot » liste au plus 3 jours et porte « Voir l'agenda complet » ;
2. le clic ouvre un panneau à droite listant plusieurs mois ;
3. un créneau d'après minuit (heure de petit matin) cite bien une basse mer datée de la veille ;
4. le panneau s'affiche correctement en thème clair **et** sombre, et à 360 px de large.

- [ ] **Step 6 : commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'MSG'
docs(aflot): consigne le panneau d'agenda et le budget de la carte

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```
