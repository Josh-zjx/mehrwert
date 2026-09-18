/**
 * Light / dark theme, chosen by the user and remembered in localStorage.
 *
 * With no choice stored the page follows the OS preference. A choice is applied as
 * `data-theme` on <html>, which base.css maps to `color-scheme`, so every token
 * defined with light-dark() switches at once.
 */

import { computed, ref, watchEffect } from 'vue';

const STORAGE_KEY = 'theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const storedTheme = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
};

const mediaQuery = typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null;

// Module-level state: one theme for the whole app, however many components ask
const chosen = ref(storedTheme());
const systemDark = ref(mediaQuery?.matches ?? false);

mediaQuery?.addEventListener('change', (event) => {
  systemDark.value = event.matches;
});

const isDark = computed(() => (chosen.value ? chosen.value === 'dark' : systemDark.value));

watchEffect(() => {
  const root = document.documentElement;
  if (chosen.value) {
    root.dataset.theme = chosen.value;
  } else {
    delete root.dataset.theme;
  }

  try {
    if (chosen.value) {
      localStorage.setItem(STORAGE_KEY, chosen.value);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private mode or blocked storage: the choice just does not survive a reload
  }
});

/**
 * @returns {{ isDark: import('vue').ComputedRef<boolean>, toggleTheme: () => void }}
 */
export function useTheme() {
  const toggleTheme = () => {
    chosen.value = isDark.value ? 'light' : 'dark';
  };

  return { isDark, toggleTheme };
}
