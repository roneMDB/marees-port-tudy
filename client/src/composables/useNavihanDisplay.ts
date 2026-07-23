import { reactive, watch } from 'vue';

/** Types Navihan affichables dans la colonne du tableau. */
export type NavihanKey = 'bm' | 'flot' | 'pm';
export type NavihanVisibility = Record<NavihanKey, boolean>;

const STORAGE_KEY = 'marees-navihan-display';

/** Défaut : les trois types sont affichés. */
const DEFAULTS: NavihanVisibility = { bm: true, flot: true, pm: true };

/** Lit la sélection stockée, en complétant toute clé absente/non booléenne par le défaut (`true`). */
function readInitial(): NavihanVisibility {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<NavihanKey, unknown>>;
    return {
      bm: typeof parsed.bm === 'boolean' ? parsed.bm : true,
      flot: typeof parsed.flot === 'boolean' ? parsed.flot : true,
      pm: typeof parsed.pm === 'boolean' ? parsed.pm : true
    };
  } catch {
    return { ...DEFAULTS };
  }
}

// État partagé (singleton) : le choix d'affichage vaut pour toute l'application (comme le thème).
const visible = reactive<NavihanVisibility>(readInitial());

// Persiste le choix (préférence personnelle par navigateur, comme `useSite`/`useTheme`).
watch(
  visible,
  v => localStorage.setItem(STORAGE_KEY, JSON.stringify({ bm: v.bm, flot: v.flot, pm: v.pm })),
  { deep: true }
);

export function useNavihanDisplay() {
  function toggle(key: NavihanKey): void {
    visible[key] = !visible[key];
  }

  return { visible, toggle };
}
