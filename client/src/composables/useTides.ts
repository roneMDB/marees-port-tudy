import { computed, onMounted, reactive, ref, watch } from 'vue';
import { getMeta, getTides } from '../api/tides';
import { filterTides, flatten, resolveWindow, withSiteTimes } from '../lib/tides';
import { computeNavihan } from '../lib/navihan';
import { useSettings } from './useSettings';
import { useSite } from './useSite';
import type { FlatTide, TideDisplayFilters, TidesMeta } from '../types';

/**
 * Charge la config, les métadonnées et l'ensemble des marées au montage, puis
 * expose un filtrage réactif côté client (données petites → pas de refetch).
 *
 * La **référence** Port-Tudy (`allTides`) pilote les lignes, la fenêtre de dates, le
 * coefficient et les heures **Navihan**. Le **port sélectionné** ne fait que substituer
 * l'heure et la hauteur affichées (`displayTime`/`displayHeight`, via `withSiteTimes`).
 */
export function useTides() {
  const loading = ref(true);
  const error = ref<string | null>(null);
  const meta = ref<TidesMeta | null>(null);
  const allTides = ref<FlatTide[]>([]); // référence Port-Tudy
  const siteTides = ref<FlatTide[]>([]); // marées du port sélectionné (si ≠ référence)

  const { settings, load: loadSettings } = useSettings();
  const { siteId, isReference, load: loadSites } = useSite();

  // Filtres éphémères (non persistés).
  const filters = reactive<TideDisplayFilters>({ type: 'all', minCoef: null });

  // Fenêtre de dates dérivée de la config persistée (bornes = référence Port-Tudy).
  const dateWindow = computed(() =>
    resolveWindow(settings, meta.value?.minDate ?? '', meta.value?.maxDate ?? '')
  );

  // Référence enrichie de l'heure/hauteur du port sélectionné (identité si port de référence).
  const tidesForSite = computed(() =>
    isReference.value ? allTides.value : withSiteTimes(allTides.value, siteTides.value)
  );

  // Filtrage (fenêtre + filtres éphémères) + recalcul Navihan depuis l'heure Port-Tudy.
  const filteredTides = computed(() => {
    const { from, to } = dateWindow.value;
    return filterTides(tidesForSite.value, { from, to, type: filters.type, minCoef: filters.minCoef })
      .map(t => ({ ...t, navihan: computeNavihan(t, settings.navihan) }));
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
