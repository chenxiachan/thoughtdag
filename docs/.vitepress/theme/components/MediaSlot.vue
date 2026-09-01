<script setup lang="ts">
withDefaults(defineProps<{
  id: string;
  title: string;
  action: string;
  src?: string;
  alt?: string;
  kind?: 'screenshot' | 'video';
}>(), {
  src: '',
  alt: '',
  kind: 'screenshot',
});
</script>

<template>
  <figure class="media-slot" :data-ready="Boolean(src)">
    <video
      v-if="src && kind === 'video'"
      :src="src"
      :aria-label="alt || title"
      controls
      playsinline
      preload="metadata"
    />
    <img v-else-if="src" :src="src" :alt="alt || title" />
    <div v-else class="media-slot-placeholder">
      <span class="media-slot-id">{{ id }}</span>
      <span class="media-slot-kind">{{ kind === 'video' ? 'VIDEO CLIP' : 'SCREENSHOT' }}</span>
      <strong>{{ title }}</strong>
      <p>{{ action }}</p>
    </div>
    <figcaption>{{ title }}</figcaption>
  </figure>
</template>
