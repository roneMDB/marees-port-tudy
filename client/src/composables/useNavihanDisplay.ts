import { reactive, watch } from 'vue';

/** Types Navihan affichables dans la colonne du tableau. */
export type NavihanKey = 'bm' | 'flot' | 'flotEst' | 'flotObs' | 'pm';
export type NavihanVisibility = Record<NavihanKey, boolean>;

const STORAGE_KEY = 'marees-navihan-display';

/** Défaut : tous les types sont affichés. */
const DEFAULTS: NavihanVisibility = { bm: true, flot: true, flotEst: true, flotObs: true, pm: true };
const KEYS = Object.keys(DEFAULTS) as NavihanKey[];

/** Lit la sélection stockée, en complétant toute clé absente/non booléenne par le défaut (`true`). */
function readInitial(): NavihanVisibility {
  const stored: Partial<Record<NavihanKey, unknown>> = (() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Partial<Record<NavihanKey, unknown>>;
    } catch {
      return {};
    }
  })();
  const out = {} as NavihanVisibility;
  for (const k of KEYS) out[k] = typeof stored[k] === 'boolean' ? (stored[k] as boolean) : true;
  return out;
}

// État partagé (singleton) : le choix d'affichage vaut pour toute l'application (comme le thème).
const visible = reactive<NavihanVisibility>(readInitial());

// Persiste le choix (préférence personnelle par navigateur, comme `useSite`/`useTheme`).
watch(
  visible,
  v => localStorage.setItem(STORAGE_KEY, JSON.stringify(v)),
  { deep: true }
);

export function useNavihanDisplay() {
  function toggle(key: NavihanKey): void {
    visible[key] = !visible[key];
  }

  return { visible, toggle };
}
