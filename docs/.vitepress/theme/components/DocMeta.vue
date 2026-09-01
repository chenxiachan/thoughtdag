<script setup lang="ts">
defineProps<{
  status?: string;
  verified?: string;
  series?: string;
}>();
</script>

<template>
  <div class="doc-meta" aria-label="Document status">
    <span v-if="series">{{ series }}</span>
    <span v-if="status">{{ status }}</span>
    <span v-if="verified">Verified with {{ verified }}</span>
  </div>
</template>
