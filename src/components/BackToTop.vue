<script setup>
import { useScrolledPast } from '../composables/useScrolledPast.js';

const props = defineProps({
  /** How far down the page must be scrolled before the button appears, in px */
  threshold: { type: Number, default: 600 },
});

const visible = useScrolledPast(props.threshold);

const scrollToTop = () => {
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
};
</script>

<template>
  <Transition name="pop">
    <button
      v-if="visible"
      type="button"
      class="back-to-top"
      aria-label="Back to top"
      @click="scrollToTop"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="18 15 12 9 6 15" />
      </svg>
    </button>
  </Transition>
</template>

<style scoped>
.back-to-top {
  position: fixed;
  right: max(20px, env(safe-area-inset-right));
  bottom: max(20px, env(safe-area-inset-bottom));
  z-index: 10;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  color: var(--ink-inverse);
  background: var(--ink);
  border: 0;
  border-radius: 50%;
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: transform 0.15s;
}

.back-to-top:hover {
  transform: translateY(-2px);
}

.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (prefers-reduced-motion: reduce) {
  .back-to-top,
  .pop-enter-active,
  .pop-leave-active {
    transition: none;
  }
}
</style>
