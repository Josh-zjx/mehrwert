<script setup>
import ItemCard from './ItemCard.vue';

const props = defineProps({
  /** 'hot' | 'mild' | 'cold' - also the color token name */
  classification: { type: String, required: true },
  label: { type: String, required: true },
  subtitle: { type: String, default: '' },
  /** Small remark after the item count, e.g. how the list is ordered */
  note: { type: String, default: '' },
  items: { type: Array, required: true },
  expanded: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
  /** 0-100 while loading */
  progress: { type: Number, default: 0 },
});

defineEmits(['toggle']);

const panelId = `${props.classification}-items`;
</script>

<template>
  <section class="section" :class="classification" :aria-label="`${label} items`">
    <button
      type="button"
      class="section-head"
      :aria-expanded="expanded"
      :aria-controls="panelId"
      @click="$emit('toggle')"
    >
      <span class="badge">{{ label }}</span>
      <span class="subtitle">{{ subtitle }}</span>
      <span class="count">{{ items.length }} items<template v-if="note"> · {{ note }}</template></span>
      <span class="spacer" />
      <span v-if="loading" class="status">Fetching prices from Universalis… {{ progress }}%</span>
      <span v-else-if="!expanded" class="status faint">Loads when opened</span>
      <svg class="chevron" :class="{ open: expanded }" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </button>
    <div v-if="loading" class="progress" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100">
      <span class="progress-fill" :style="{ width: `${progress}%` }" />
    </div>

    <div v-if="expanded" :id="panelId" class="panel">
      <p v-if="items.length === 0" class="none">No {{ classification }} items on this data center.</p>
      <div v-else class="grid">
        <ItemCard v-for="item in items" :key="item.id" :item="item" :loading="loading" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hot {
  --class: var(--hot);
  --class-tint: var(--hot-tint);
}

.mild {
  --class: var(--mild);
  --class-tint: var(--mild-tint);
}

.cold {
  --class: var(--cold);
  --class-tint: var(--cold-tint);
}

.section-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  width: 100%;
  min-height: 44px;
  padding: 0 0 12px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  cursor: pointer;
  text-align: left;
}

.badge {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--class);
  background: var(--class-tint);
  border-radius: 999px;
}

.subtitle {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
}

.count,
.status {
  font-size: 14px;
  color: var(--muted);
}

.status {
  font-size: 13px;
}

.faint {
  color: var(--faint);
}

.spacer {
  flex: 1;
}

.chevron {
  transition: transform 0.15s;
}

.chevron.open {
  transform: rotate(90deg);
}

.progress {
  height: 2px;
  margin-top: -16px;
  background: var(--hairline-soft);
  overflow: hidden;
}

.progress-fill {
  display: block;
  height: 100%;
  background: var(--class);
  transition: width 0.3s;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.none {
  padding: 24px 0;
  color: var(--muted);
}

@media (max-width: 480px) {
  .subtitle {
    font-size: 18px;
  }

  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
