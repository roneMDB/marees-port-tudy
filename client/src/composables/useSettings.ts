import { nextTick, reactive, ref, watch } from 'vue';
import { getSettings, saveSettings } from '../api/settings';
import { DEFAULT_WEATHER_LINKS } from '../types';
import type { Settings } from '../types';

const DEFAULTS: Settings = {
  startMode: 'today',
  startDate: null,
  rangeDays: 30,
  navihan: { basseMer: 75, pleineMer: 75, aFlot: 160 },
  aFlotDays: 3,
  weatherLinks: DEFAULT_WEATHER_LINKS.map(l => ({ ...l }))
};

// État partagé (singleton) : la config vaut pour toute l'application.
const settings = reactive<Settings>({
  ...DEFAULTS,
  navihan: { ...DEFAULTS.navihan },
  weatherLinks: DEFAULTS.weatherLinks.map(l => ({ ...l }))
});
const loaded = ref(false);
let loadPromise: Promise<void> | null = null;
let hydrating = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function snapshot(): Settings {
  return {
    ...settings,
    navihan: { ...settings.navihan },
    weatherLinks: settings.weatherLinks.map(l => ({ ...l }))
  };
}

// Sauvegarde automatique débouncée (~500 ms) à chaque changement (hors hydratation).
watch(
  settings,
  () => {
    if (hydrating) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveSettings(snapshot()).catch(() => {
        /* échec réseau : la prochaine modification retentera */
      });
    }, 500);
  },
  { deep: true }
);

/** Charge la config depuis le serveur (une seule fois), sans déclencher de sauvegarde. */
function load(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const s = await getSettings();
      hydrating = true;
      Object.assign(settings, s, { navihan: { ...s.navihan } });
      await nextTick(); // laisse passer le flush du watcher avant de réactiver la sauvegarde
      hydrating = false;
    } catch {
      /* serveur indisponible : on garde les défauts */
    } finally {
      loaded.value = true;
    }
  })();
  return loadPromise;
}

export function useSettings() {
  return { settings, loaded, load };
}
