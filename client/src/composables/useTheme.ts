import { computed, ref, watch } from 'vue';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'marees-theme';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

// État partagé (singleton) : le thème vaut pour toute l'application.
const theme = ref<Theme>(getInitialTheme());

// Applique le thème à Bootstrap (data-bs-theme) et le persiste. `immediate` = pas de flash.
watch(
  theme,
  value => {
    document.documentElement.setAttribute('data-bs-theme', value);
    localStorage.setItem(STORAGE_KEY, value);
  },
  { immediate: true }
);

export function useTheme() {
  const isDark = computed(() => theme.value === 'dark');

  function toggle(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  return { theme, isDark, toggle };
}
