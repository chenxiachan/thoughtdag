import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import DocMeta from './components/DocMeta.vue';
import MediaSlot from './components/MediaSlot.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('DocMeta', DocMeta);
    app.component('MediaSlot', MediaSlot);
  },
} satisfies Theme;
