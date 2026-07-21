import { computed, onMounted, reactive, ref, watch } from 'vue';
import { getMeta, getTides } from '../api/tides';
import { filterTides, flatten, matchNavihanReference, resolveWindow } from '../lib/tides';
import { computeNavihan } from '../lib/navihan';
import { useSettings } from './useSettings';
import { useSite } from './useSite';
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

  // Filtres éphémères (non persistés).
  const filters = reactive<TideDisplayFilters>({ type: 'all', minCoef: null });

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
  const filteredTides = computed(() => {
    const { from, to } = dateWindow.value;
    return filterTides(rows.value, { from, to, type: filters.type, minCoef: filters.minCoef })
      .map(t => ({
        ...t,
        navihan: t.refTime ? computeNavihan({ time: t.refTime, type: t.type }, settings.navihan) : {}
      }));
  });

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

  onMounted(load);

  return { loading, error, meta, settings, filters, dateWindow, filteredTides, allTides, reload: load };
}
