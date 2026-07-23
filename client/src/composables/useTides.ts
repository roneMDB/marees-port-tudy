import { computed, onMounted, reactive, ref, watch } from 'vue';
import { getMeta, getTides } from '../api/tides';
import { filterTides, flatten, matchNavihanReference, periodWindow, resolveWindow } from '../lib/tides';
import { addDays } from '../lib/format';
import { computeNavihan } from '../lib/navihan';
import { useSettings } from './useSettings';
import { useSite } from './useSite';
import { useDataRefresh } from './useDataRefresh';
import type { FlatTide, TideDisplayFilters, TidesMeta } from '../types';

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

  // Filtres éphémères (non persistés).
  const filters = reactive<TideDisplayFilters>({ type: 'all', minCoef: null });

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
      ? allTides.value.map(t => ({ ...t, refTime: t.time }))
      : matchNavihanReference(siteTides.value, allTides.value)
  );

  // Filtrage (fenêtre + filtres éphémères) + calcul Navihan depuis l'heure Port-Tudy appariée.
  function windowedTides(from: string, to: string): FlatTide[] {
    return filterTides(rows.value, { from, to, type: filters.type, minCoef: filters.minCoef }).map(t => ({
      ...t,
      navihan: t.refTime ? computeNavihan({ time: t.refTime, type: t.type }, settings.navihan) : {}
    }));
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
  const tableTides = computed(() => windowedTides(tablePeriod.value.from, tablePeriod.value.to));

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
      const [, m, data] = await Promise.all([loadSettings(), getMeta(), getTides()]);
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
    filters,
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
