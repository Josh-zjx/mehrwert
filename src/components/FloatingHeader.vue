<script setup>
import { useScrolledPast } from '../composables/useScrolledPast.js';

defineProps({
  region: { type: String, default: null },
  dataCenter: { type: String, default: null },
});

// Roughly where the page header, with its title and pickers, leaves the viewport
const visible = useScrolledPast(240);
</script>

<template>
  <Transition name="slide">
    <div v-if="visible" class="floating-header" role="banner">
      <div class="inner">
        <span class="brand">Mehrwert</span>
        <span v-if="dataCenter" class="place">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
          </svg>
          <span>{{ region }}</span>
          <span class="sep" aria-hidden="true">·</span>
          <span class="dc">{{ dataCenter }}</span>
        </span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.floating-header {
  position: fixed;
  inset: 0 0 auto;
  z-index: 20;
  padding-top: env(safe-area-inset-top);
  background: color-mix(in srgb, var(--ground) 82%, transparent);
  border-bottom: 1px solid var(--hairline);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: var(--page-width);
  height: 44px;
  margin: 0 auto;
  padding: 0 var(--page-gutter);
}

.brand {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.place {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
}

.dc {
  color: var(--ink);
}

.sep {
  color: var(--faint);
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s, opacity 0.2s;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-100%);
}

@media (prefers-reduced-motion: reduce) {
  .slide-enter-active,
  .slide-leave-active {
    transition: none;
  }
}
</style>
