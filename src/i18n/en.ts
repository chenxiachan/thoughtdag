// English dictionary — the source of truth for message keys.
// Naming: area.name (landing.*, tutorial.*, panel.*, node.*, switcher.*, ...)
export const en = {
  // Landing
  'landing.tagline': 'Explore ideas as branching conversations',
  'landing.placeholder': 'What would you like to explore?',
  'landing.setRole': 'Set role (optional)',
  'landing.rolePlaceholder': 'e.g. You are a physicist. Explain using first principles.',
  'landing.roleLabel': 'Role (System Prompt)',
  'landing.send': 'Send',
  'landing.extracting': 'Extracting...',
  'landing.attach': 'Attach files',
  'landing.howItWorks': 'How it works',
  'landing.feature1.title': 'Branch anywhere',
  'landing.feature1.desc': 'Select any passage of an answer and fork a new line of thought from it.',
  'landing.feature2.title': 'Edges are context',
  'landing.feature2.desc': 'What the AI sees is exactly what flows along the arrows into a node.',
  'landing.feature3.title': 'Prune freely',
  'landing.feature3.desc': 'Delete an edge to cut noise out of the context — nothing is ever locked in.',

  // Tutorial
  'tutorial.title': 'How ThoughtDAG works',
  'tutorial.subtitle': 'Five ideas, two minutes',
  'tutorial.close': 'Got it',
  'tutorial.step1.title': '1 · Ask',
  'tutorial.step1.desc': 'Every question becomes a node on the canvas: your question plus the AI\'s answer. Type below or double-click empty canvas to start a new thread.',
  'tutorial.step2.title': '2 · Follow up',
  'tutorial.step2.desc': 'A follow-up creates a child node connected by a solid edge. The AI sees everything upstream along the arrows — the whole chain of reasoning.',
  'tutorial.step3.title': '3 · Branch from a selection',
  'tutorial.step3.desc': 'Select any text inside an answer and hit Explore. A dashed orange branch grows sideways — it inherits the context plus your selection, without polluting the main line.',
  'tutorial.step4.title': '4 · Prune and rewire',
  'tutorial.step4.desc': 'Click an edge to select it, then delete it — that history disappears from the context. Drag between nodes to connect them and merge lines of thought.',
  'tutorial.step5.title': '5 · Control what the AI reads',
  'tutorial.step5.desc': 'Highlight key passages and choose how they flow downstream. Set per-node roles. The "will send" preview above the input shows the exact context before you ask.',

  // Language switcher
  'lang.label': 'Language',
} as const;
