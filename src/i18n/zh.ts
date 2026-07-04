import type { en } from './en';

export const zh: Record<keyof typeof en, string> = {
  // Landing
  'landing.tagline': '让想法在分支对话中生长',
  'landing.placeholder': '你想探索什么？',
  'landing.setRole': '设置角色（可选）',
  'landing.rolePlaceholder': '例如：你是一位物理学家，请用第一性原理解释。',
  'landing.roleLabel': '角色（System Prompt）',
  'landing.send': '发送',
  'landing.extracting': '解析中…',
  'landing.attach': '添加附件',
  'landing.howItWorks': '如何使用',
  'landing.feature1.title': '随处分支',
  'landing.feature1.desc': '选中回答中的任意一段文字，从那里岔出一条新的思路。',
  'landing.feature2.title': '连线即上下文',
  'landing.feature2.desc': 'AI 看到的内容，就是沿箭头流入节点的全部信息。',
  'landing.feature3.title': '自由裁剪',
  'landing.feature3.desc': '删掉一条连线，就把噪音从上下文中剪掉——一切都可以反悔。',

  // Tutorial
  'tutorial.title': 'ThoughtDAG 是怎么工作的',
  'tutorial.subtitle': '五个概念，两分钟',
  'tutorial.close': '明白了',
  'tutorial.step1.title': '1 · 提问',
  'tutorial.step1.desc': '每个问题都会变成画布上的一个节点：你的问题加上 AI 的回答。在下方输入，或双击画布空白处开启新话题。',
  'tutorial.step2.title': '2 · 追问',
  'tutorial.step2.desc': '追问会创建一个由实线连接的子节点。AI 沿着箭头看到上游的全部内容——完整的推理链。',
  'tutorial.step3.title': '3 · 从选中文字分支',
  'tutorial.step3.desc': '选中回答里的任意文字，点 Explore。一条橙色虚线分支向侧面生长——它继承上下文和你的选中内容，但不会污染主线。',
  'tutorial.step4.title': '4 · 裁剪与重连',
  'tutorial.step4.desc': '点击连线选中它，再删除——那段历史就从上下文中消失。在节点之间拖线即可连接，合并不同的思路。',
  'tutorial.step5.title': '5 · 精确控制 AI 读到什么',
  'tutorial.step5.desc': '高亮关键段落并选择它们如何向下游传递；为节点设置角色；输入框上方的「将发送」预览让你在提问前看到确切的上下文。',

  // Language switcher
  'lang.label': '语言',
};
