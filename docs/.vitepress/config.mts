import { defineConfig } from 'vitepress';

const docsBase = process.env.DOCS_BASE || '/';

const enSidebar = [
  {
    text: 'Get started',
    items: [
      { text: 'Install and quick start', link: '/' },
      { text: 'Guide map', link: '/guides/' },
      { text: 'Interface overview', link: '/guides/interface-overview' },
    ],
  },
  {
    text: 'Canvas and nodes',
    items: [
      { text: 'Canvas, navigation, and frames', link: '/guides/canvas-projects' },
      { text: 'Conversation nodes and panel', link: '/guides/conversations' },
      { text: 'Control context', link: '/guides/context-control' },
      { text: 'Material nodes and reader', link: '/guides/materials' },
      { text: 'Merge, highlight, and condense', link: '/guides/organize' },
      { text: 'Versions, staleness, and replay', link: '/guides/versions-replay' },
    ],
  },
  {
    text: 'Tools and data',
    items: [
      { text: 'Models, tools, and memory', link: '/guides/models-tools' },
      { text: 'Why layer: CLI and MCP', link: '/guides/why-layer' },
      { text: 'Session Atlas', link: '/guides/session-atlas' },
      { text: 'DeepSeek Harness plugin', link: '/guides/deepseek-harness' },
      { text: 'Data, backup, and sharing', link: '/guides/data-sharing' },
    ],
  },
  {
    text: 'Understand the model',
    items: [
      { text: 'How the context graph works', link: '/concepts/' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'Reference overview', link: '/reference/' },
      { text: 'Supported inputs', link: '/reference/supported-inputs' },
      { text: 'Keyboard shortcuts', link: '/reference/shortcuts' },
      { text: 'Privacy and storage', link: '/reference/privacy-storage' },
      { text: 'Troubleshooting', link: '/reference/troubleshooting' },
      { text: 'Feature status', link: '/reference/feature-status' },
      { text: 'Complete feature index', link: '/features' },
      { text: 'Connect a model', link: '/setup' },
    ],
  },
];

const zhSidebar = [
  {
    text: '开始使用',
    items: [
      { text: '安装与快速开始', link: '/zh/' },
      { text: '功能导航', link: '/zh/guides/' },
      { text: '认识界面', link: '/zh/guides/interface-overview' },
    ],
  },
  {
    text: '画布与节点',
    items: [
      { text: '画布、导航与分区', link: '/zh/guides/canvas-projects' },
      { text: '对话节点与侧栏', link: '/zh/guides/conversations' },
      { text: '控制上下文', link: '/zh/guides/context-control' },
      { text: '材料节点与阅读器', link: '/zh/guides/materials' },
      { text: '合并、高亮与凝练', link: '/zh/guides/organize' },
      { text: '版本、陈旧与重放', link: '/zh/guides/versions-replay' },
    ],
  },
  {
    text: '工具与数据',
    items: [
      { text: '模型、工具与记忆', link: '/zh/guides/models-tools' },
      { text: 'Why 层：CLI 与 MCP', link: '/zh/guides/why-layer' },
      { text: 'Agent 对话地图', link: '/zh/guides/session-atlas' },
      { text: 'DeepSeek Harness 插件', link: '/zh/guides/deepseek-harness' },
      { text: '数据、备份与分享', link: '/zh/guides/data-sharing' },
    ],
  },
  {
    text: '理解交互模型',
    items: [
      { text: '上下文图如何工作', link: '/zh/concepts/' },
    ],
  },
  {
    text: '参考',
    items: [
      { text: '参考总览', link: '/zh/reference/' },
      { text: '支持的输入类型', link: '/zh/reference/supported-inputs' },
      { text: '键盘快捷键', link: '/zh/reference/shortcuts' },
      { text: '隐私与存储', link: '/zh/reference/privacy-storage' },
      { text: '常见问题', link: '/zh/reference/troubleshooting' },
      { text: '功能状态', link: '/zh/reference/feature-status' },
      { text: '完整功能索引', link: '/zh/features' },
      { text: '连接模型', link: '/zh/setup' },
    ],
  },
];

const enTheme = {
  nav: [
    { text: 'Start', link: '/' },
    { text: 'Features', link: '/guides/' },
    { text: 'Concepts', link: '/concepts/' },
    { text: 'Reference', link: '/reference/' },
    { text: 'Download', link: 'https://chenxiachan.github.io/thoughtdag/#download' },
  ],
  sidebar: enSidebar,
  outline: { label: 'On this page', level: [2, 3] },
  editLink: { text: 'Edit this page on GitHub' },
  lastUpdated: { text: 'Last updated' },
  docFooter: { prev: 'Previous page', next: 'Next page' },
};

const zhTheme = {
  nav: [
    { text: '开始', link: '/zh/' },
    { text: '功能', link: '/zh/guides/' },
    { text: '概念', link: '/zh/concepts/' },
    { text: '参考', link: '/zh/reference/' },
    { text: '下载', link: 'https://chenxiachan.github.io/thoughtdag/?lang=zh#download' },
  ],
  sidebar: zhSidebar,
  outline: { label: '本页内容', level: [2, 3] },
  editLink: { text: '在 GitHub 上编辑此页' },
  lastUpdated: { text: '最后更新' },
  docFooter: { prev: '上一页', next: '下一页' },
  footer: {
    message: 'ThoughtDAG 以 MIT License 开源。',
    copyright: '文档随产品一起维护。',
  },
};

export default defineConfig({
  title: 'ThoughtDAG Docs',
  description: 'Install, use, and understand ThoughtDAG.',
  rewrites: {
    'features_ZH.md': 'zh/features.md',
    'setup_ZH.md': 'zh/setup.md',
  },
  base: docsBase,
  cleanUrls: true,
  lastUpdated: true,
  markdown: {
    lineNumbers: true,
  },
  head: [
    ['meta', { name: 'theme-color', content: '#f7f4ed' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${docsBase}thoughtdag-mark.svg` }],
  ],
  locales: {
    root: {
      label: 'English',
      lang: 'en-US',
      title: 'ThoughtDAG Docs',
      description: 'Install, use, and understand ThoughtDAG.',
      themeConfig: enTheme,
    },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      title: 'ThoughtDAG 文档',
      description: '安装、使用并理解 ThoughtDAG。',
      themeConfig: zhTheme,
    },
  },
  themeConfig: {
    logo: '/thoughtdag-mark.svg',
    siteTitle: 'ThoughtDAG',
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                noResultsText: '没有找到结果',
                resetButtonTitle: '清除查询',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/chenxiachan/thoughtdag' },
    ],
    editLink: {
      pattern: 'https://github.com/chenxiachan/thoughtdag/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'ThoughtDAG is open source under the MIT License.',
      copyright: 'Documentation maintained with the product.',
    },
  },
});
