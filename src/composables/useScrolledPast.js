/**
 * Whether the window is scrolled past a given offset.
 *
 * One passive scroll listener feeds a shared position, so every floating element
 * that reacts to scrolling reads the same number instead of each adding its own
 * listener.
 */

import { computed, ref } from 'vue';

const scrollY = ref(typeof window === 'undefined' ? 0 : window.scrollY);

if (typeof window !== 'undefined') {
  window.addEventListener('scroll', () => {
    scrollY.value = window.scrollY;
  }, { passive: true });
}

/**
 * @param {number} threshold - Offset in px below which the result is false
 * @returns {import('vue').ComputedRef<boolean>}
 */
export function useScrolledPast(threshold) {
  return computed(() => scrollY.value > threshold);
}
