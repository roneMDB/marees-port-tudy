import { computed, onMounted, reactive, ref } from 'vue';
import { getMeta, getTides } from '../api/tides';
import { filterTides, flatten, resolveWindow } from '../lib/tides';
import { computeNavihan } from '../lib/navihan';
import { useSettings } from './useSettings';
import type { FlatTide, TideDisplayFilters, TidesMeta } from '../types';

/**
 * Charge la config, les métadonnées et l'ensemble des marées au montage, puis
 * expose un filtrage réactif côté client (données petites → pas de refetch).
 */
export function useTides() {
  const loading = ref(true);
  const error = ref<string | null>(null);
  const meta = ref<TidesMeta | null>(null);
  const allTides = ref<FlatTide[]>([]);

  const { settings, load: loadSettings } = useSettings();

  // Filtres éphémères (non persistés).
  const filters = reactive<TideDisplayFilters>({ type: 'all', minCoef: null });

  // Fenêtre de dates dérivée de la config persistée.
  const dateWindow = computed(() =>
    resolveWindow(settings, meta.value?.minDate ?? '', meta.value?.maxDate ?? '')
  );

  // Filtrage (fenêtre + filtres éphémères) + recalcul Navihan selon les décalages courants.
  const filteredTides = computed(() => {
    const { from, to } = dateWindow.value;
    return filterTides(allTides.value, { from, to, type: filters.type, minCoef: filters.minCoef })
      .map(t => ({ ...t, navihan: computeNavihan(t, settings.navihan) }));
  });

  async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [, m, data] = await Promise.all([loadSettings(), getMeta(), getTides()]);
      meta.value = m;
      allTides.value = flatten(data);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);

  return { loading, error, meta, settings, filters, dateWindow, filteredTides, allTides, reload: load };
}
