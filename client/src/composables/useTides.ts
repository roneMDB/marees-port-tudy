import { computed, onMounted, ref, watch } from 'vue';
import { getMeta, getTides } from '../api/tides';
import { filterTides, flatten, matchNavihanReference, periodWindow, resolveWindow } from '../lib/tides';
import { addDays } from '../lib/format';
import { aflotTimeByThreshold, computeNavihan } from '../lib/navihan';
import { useSettings } from './useSettings';
import { useSite } from './useSite';
import { useDataRefresh } from './useDataRefresh';
import { useAflotObservations } from './useAflotObservations';
import type { FlatTide, TidesMeta } from '../types';

/**
 * Charge la config, les métadonnées et l'ensemble des marées au montage, puis
 * expose un filtrage réactif côté client (données petites → pas de refetch).
 *
 * Les **lignes** sont les marées du **port sélectionné** (ses propres heure/hauteur/coef).
 * Les heures **Navihan** restent dérivées de **Port-Tudy** : chaque marée est reliée à la
 * marée Port-Tudy de même type la plus proche (`matchNavihanReference` → `refTime`), « — »
 * si aucune. Quand le port sélectionné est la référence, `refTime = time` (comportement initial).
 */
export function useTides() {
  const loading = ref(true);
  const error = ref<string | null>(null);
  const meta = ref<TidesMeta | null>(null);
  const allTides = ref<FlatTide[]>([]); // référence Port-Tudy (marégramme, à flot, Navihan)
  const siteTides = ref<FlatTide[]>([]); // marées du port sélectionné (si ≠ référence)

  const { settings, load: loadSettings } = useSettings();
  const { siteId, isReference, load: loadSites } = useSite();
  const { token: refreshToken } = useDataRefresh();
  const { get: observedFor, load: loadObservations } = useAflotObservations();

  // Décalage de période transitoire du tableau (navigation Précédent/Suivant, non persisté).
  const periodOffset = ref(0);

  // Fenêtre de dates dérivée de la config persistée (bornes = référence Port-Tudy).
  const dateWindow = computed(() =>
    resolveWindow(settings, meta.value?.minDate ?? '', meta.value?.maxDate ?? '')
  );

  // Lignes = marées du port sélectionné, chacune reliée à une heure de référence Port-Tudy
  // (`refTime`) pour le Navihan. Pour le port de référence, `refTime` = sa propre heure.
  const rows = computed<FlatTide[]>(() =>
    isReference.value
      ? allTides.value.map(t => ({ ...t, refTime: t.time, refDate: t.date }))
      : matchNavihanReference(siteTides.value, allTides.value)
  );

  // Retrouve la basse mer **Port-Tudy** correspondant à une heure de référence (`refTime`), la plus
  // proche en date — nécessaire pour dériver la remise à flot d'un port secondaire sur les hauteurs
  // de Port-Tudy (jamais celles du port sélectionné).
  function resolvePortTudyLow(date: string, refTime: string): FlatTide | undefined {
    const target = new Date(`${date}T${refTime}:00`).getTime();
    return allTides.value
      .filter(e => e.type === 'low' && e.time === refTime)
      .map(e => ({ e, d: Math.abs(new Date(`${e.date}T${e.time}:00`).getTime() - target) }))
      .sort((a, b) => a.d - b.d)[0]?.e;
  }

  // Remise à flot (« A flot ») d'une basse mer par **modèle seuil de hauteur** (issue #4), toujours
  // calculée sur la courbe **Port-Tudy** (`allTides`). Pour la référence, la ligne est déjà la basse
  // Port-Tudy ; sinon on retrouve la basse Port-Tudy appariée via `refTime`.
  function aflotFor(t: FlatTide): string | null {
    if (!t.refTime) return null;
    const low = isReference.value ? t : resolvePortTudyLow(t.date, t.refTime);
    return low ? aflotTimeByThreshold(allTides.value, low, settings.navihan, settings.aFlotThreshold) : null;
  }

  // Fenêtre de dates + Navihan. Les **filtres d'affichage** ne passent plus par ici : ils portent sur
  // le jour et ne concernent que le tableau (`useTideFilters`, issue #10) — le graphe des
  // coefficients garde donc sa série complète.
  // Par basse mer, on expose trois heures de remise à flot : `A flot` = décalage fixe (historique,
  // `computeNavihan`) ; `aflotEstimate` = modèle seuil (issue #4) ; `aflotObserved` = heure
  // réellement constatée (saisie). Estimation et constaté sont toujours dérivés des hauteurs / de la
  // basse mer **Port-Tudy** (`refDate`/`refTime`).
  function windowedTides(from: string, to: string): FlatTide[] {
    return filterTides(rows.value, { from, to }).map(t => {
      const navihan = t.refTime ? computeNavihan({ time: t.refTime, type: t.type }, settings.navihan) : {};
      if (t.type !== 'low') return { ...t, navihan };
      return {
        ...t,
        navihan,
        aflotEstimate: aflotFor(t),
        aflotObserved: observedFor(t.refDate, t.refTime)
      };
    });
  }

  // Graphe des coefficients : durée **éphémère** (session), initialisée sur le réglage `coefDays`
  // et re-synchronisée si le réglage change (hydratation / édition dans les réglages). La modifier
  // depuis le titre de la carte ne persiste pas → au rechargement, on repart du réglage.
  const coefDaysView = ref(settings.coefDays);
  watch(() => settings.coefDays, v => { coefDaysView.value = v; });
  function setCoefDaysView(n: number): void {
    if (Number.isFinite(n)) coefDaysView.value = Math.min(90, Math.max(1, Math.round(n)));
  }
  const coefTides = computed(() =>
    windowedTides(dateWindow.value.from, addDays(dateWindow.value.from, coefDaysView.value))
  );

  // Fenêtre du tableau, décalée par `periodOffset` (Précédent/Suivant), bornée aux dates dispo.
  const tablePeriod = computed(() =>
    periodWindow(
      dateWindow.value.from,
      settings.rangeDays,
      periodOffset.value,
      meta.value?.minDate ?? '',
      meta.value?.maxDate ?? ''
    )
  );
  // Un jour d'**amorce** en amont : les heures Navihan de la veille qui franchissent minuit sont
  // rendues sur la première ligne de la période. `TideDayTable` reçoit `from` et n'affiche pas ce
  // jour supplémentaire comme une ligne.
  const tableTides = computed(() =>
    windowedTides(addDays(tablePeriod.value.from, -1), tablePeriod.value.to)
  );

  const canPrevPeriod = computed(() => {
    const min = meta.value?.minDate ?? '';
    return !!min && tablePeriod.value.from > min;
  });
  const canNextPeriod = computed(() => {
    const max = meta.value?.maxDate ?? '';
    return !!max && tablePeriod.value.to < max;
  });
  function prevPeriod(): void {
    if (canPrevPeriod.value) periodOffset.value -= 1;
  }
  function nextPeriod(): void {
    if (canNextPeriod.value) periodOffset.value += 1;
  }
  function resetPeriod(): void {
    periodOffset.value = 0;
  }

  // Changer le paramétrage de période ramène le tableau à la période configurée.
  watch(
    () => [settings.startMode, settings.startDate, settings.rangeDays],
    () => {
      periodOffset.value = 0;
    }
  );

  /** Charge les marées du port sélectionné (inutile quand c'est la référence). */
  async function loadSiteTides(): Promise<void> {
    if (isReference.value) {
      siteTides.value = [];
      return;
    }
    siteTides.value = flatten(await getTides(undefined, undefined, siteId.value));
  }

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await loadSites(); // hydrate la liste des ports + réconcilie un id stocké obsolète
      const [, m, data] = await Promise.all([loadSettings(), getMeta(), getTides(), loadObservations()]);
      meta.value = m;
      allTides.value = flatten(data);
      await loadSiteTides();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  // Changement de port : recharge seulement les marées du port (pas de spinner global).
  watch(siteId, async () => {
    try {
      await loadSiteTides();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  });

  // Rechargement complet déclenché après un import d'horaires (admin).
  watch(refreshToken, async () => {
    try {
      await load();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    }
  });

  onMounted(load);

  return {
    loading,
    error,
    meta,
    settings,
    dateWindow,
    coefTides,
    coefDaysView,
    setCoefDaysView,
    allTides,
    tableTides,
    tablePeriod,
    prevPeriod,
    nextPeriod,
    resetPeriod,
    canPrevPeriod,
    canNextPeriod,
    periodOffset,
    reload: load
  };
}
