import { computed, reactive, watch } from 'vue';
import type { TideDayFilters } from '../types';

const STORAGE_KEY = 'marees-tide-filters';

/** Défaut : aucun filtre posé (le tableau montre toute la période configurée). */
const DEFAULTS: TideDayFilters = {
  minCoef: null,
  maxCoef: null,
  weekdays: [],
  aflotFrom: null,
  aflotTo: null
};

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readTime(value: unknown): string | null {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : null;
}

/** Jours valides (0-6), dédupliqués et triés — une saisie douteuse ne doit pas vider le tableau. */
function readWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const kept = value.filter(
    (d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6
  );
  return [...new Set(kept)].sort((a, b) => a - b);
}

/**
 * Lit les filtres stockés en validant **chaque clé par son type** : un stockage écrit par une
 * version antérieure (ou trafiqué) ne doit jamais casser l'affichage, il retombe sur le défaut.
 */
function readInitial(): TideDayFilters {
  const stored: Record<string, unknown> = (() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  })();
  return {
    minCoef: readNumber(stored.minCoef),
    maxCoef: readNumber(stored.maxCoef),
    weekdays: readWeekdays(stored.weekdays),
    aflotFrom: readTime(stored.aflotFrom),
    aflotTo: readTime(stored.aflotTo)
  };
}

// État partagé (singleton) : les filtres valent pour toute l'application, comme le thème ou le port.
const filters = reactive<TideDayFilters>(readInitial());

// Persiste le choix (préférence personnelle par navigateur, comme `useSite`/`useNavihanDisplay`).
watch(
  filters,
  f => localStorage.setItem(STORAGE_KEY, JSON.stringify(f)),
  { deep: true }
);

/**
 * Nombre de **critères** actifs (0 à 3), et non de champs remplis : les deux bornes de coefficient
 * comptent pour un. C'est ce nombre que porte le badge du bouton « Filtres ».
 */
const activeCount = computed(() => {
  let n = 0;
  if (filters.minCoef != null || filters.maxCoef != null) n += 1;
  // Neutre à 0 comme à 7 jours : dans les deux cas, aucun jour n'est écarté.
  if (filters.weekdays.length > 0 && filters.weekdays.length < 7) n += 1;
  if (filters.aflotFrom || filters.aflotTo) n += 1;
  return n;
});

export function useTideFilters() {
  function reset(): void {
    Object.assign(filters, { ...DEFAULTS, weekdays: [] });
  }

  return { filters, activeCount, reset };
}
