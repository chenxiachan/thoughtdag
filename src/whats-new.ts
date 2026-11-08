// What a release changed, in the user's words. Two readers: the dialog that
// opens once after an update, and the release history behind the ⋯ menu.
// Every release gets an entry here, so the history is complete; `announce`
// decides only whether the entry also pops up on the first launch after the
// update. Most releases pass silently: the dialog is for the few where a
// person opening the app should learn that a new door exists. Content lives
// here, not in a network call: the app is local-first and this must work
// offline. Links open in the system browser through the shell's window-open
// handler. Newest first.

import type { Lang } from './i18n';

/** A short clip or picture bundled with the app (public/whats-new/…), so it
 *  shows offline: an .mp4/.webm plays muted in a loop, anything else is an image. */
export interface WhatsNewMedia { src: Record<Lang, string>; alt: Record<Lang, string>; /** intrinsic size, for a stable box while it loads */ width: number; height: number }

export interface WhatsNewItem {
  title: Record<Lang, string>;
  body: Record<Lang, string>;
  /** where to read more, if anywhere */
  link?: { label: Record<Lang, string>; href: string };
  media?: WhatsNewMedia;
}

export interface WhatsNewEntry {
  version: string;
  /** release day, YYYY-MM-DD */
  date: string;
  /** pop up on the first launch after updating to this version */
  announce: boolean;
  /** one line under the version: what this release is about */
  lead: Record<Lang, string>;
  /** shown under the lead */
  media?: WhatsNewMedia;
  items: WhatsNewItem[];
}

const DOCS = 'https://chenxiachan.github.io/thoughtdag/docs';

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    // a quiet release: the 0.5.27 entry stays the announcement, this one is history only
    version: '0.5.28',
    date: '2026-11-08',
    announce: false,
    lead: {
      zh: '从 Claude Code 会话中间的某一轮接着问，且只连着这一个节点时，会在那一轮分出一个新会话：它带着到这一轮为止的原始记录，后面的轮次不在其中，原会话保持不变，新节点标「分叉」（#89）。在分出的会话上继续问，接的是这个新会话。Claude Code 拒绝运行时，节点上显示它给出的原因，不再只有退出码。对话地图扫描大的 Harness 会话不再卡住：标题只从日志开头读取，两次扫描之间记住已经读过的卡片（@MrUncleXiang 的 PR #82，#80）。凝练窗口只列 API 模型，「自动」一项写明会用哪个；模型选择器停在 Agent 上时，凝练不再每次开一个 Agent 会话（#85）。',
      en: 'A question asked off an earlier turn of a Claude Code session, with that node as its only input, branches a new session at that turn: it holds the original record up to that turn and none of the later ones, the original session stays as it was, and the new node is marked forked (#89). Questions asked on the branch continue the new session. When Claude Code refuses a run, the node shows the reason it gave instead of an exit code. The session map no longer stalls on large Harness sessions: a title is read from the start of the log, and cards already read are remembered between scans (@MrUncleXiang\'s PR #82, #80). The condense window lists API models only and its Automatic entry names the one it will use; with the model picker on an agent, condensing no longer opens an agent session on every run (#85).',
    },
    items: [],
  },
  {
    version: '0.5.27',
    date: '2026-11-01',
    announce: true,
    lead: {
      zh: '🧰 Agent 每一轮的工具记录有了自己的开关，新导入的轮次默认不往下传。画布发起的 Harness 会话归到对应的工作区。',
      en: '🧰 Each agent turn\'s tool record has its own switch, and newly imported turns start with it off. Harness sessions started from the canvas are filed under their workspace.',
    },
    items: [
      {
        title: { zh: '🧰 工具记录每轮一个开关', en: '🧰 One switch per turn for the tool record' },
        body: {
          zh: '导入的 Agent 会话里，每一轮的工具调用和结果在侧栏有一个开关。新导入的轮次默认关闭，后面的提问只知道这一轮动过哪些文件；打开后，会读到每一步的调用和结果。已经在画布上的轮次保持原样。思考只在卡片上显示约多少 token，不往下传。卡片的小条里，实心是往下传的部分，斜纹是留在本卡的部分。',
          en: 'In an imported agent session, each turn\'s tool calls and results have a switch in the side panel. Newly imported turns start with it off, so questions below learn only which files the turn touched; switched on, they read every call and its result. Turns already on a canvas stay as they were. Thinking shows on the card as an approximate token count and is not passed on. On the card\'s bar, solid is what passes on and hatched is what stays on the card.',
        },
        link: { label: { zh: '为什么这样设计：Agent 一轮的 token 去了哪里', en: 'Why: where an agent turn\'s tokens go' }, href: 'https://chenxiachan.github.io/thoughtdag/research/agent-turn-tokens/' },
      },
      {
        title: { zh: '🗂 Harness 会话归到工作区', en: '🗂 Harness sessions land in their workspace' },
        body: {
          zh: '在画布上用 Harness Agent 提问、开了新会话时，如果工作目录正是 Harness 里的某个工作区，这个会话会归到该工作区，不再出现在「未分组」里（#85）。没有选目录时，会话在工作目录芯片显示的文件夹里运行。',
          en: 'When a Harness Agent question on the canvas starts a new session and its working directory is one of Harness\'s workspaces, the session is filed under that workspace instead of Ungrouped (#85). With no folder chosen, the session runs in the folder the working-directory chip shows.',
        },
      },
    ],
  },
  {
    // a quiet release: the 0.5.21 entry stays the announcement, this one is history only
    version: '0.5.26',
    date: '2026-10-25',
    announce: false,
    lead: {
      zh: '追问、探索、合并或重新生成时只摆放新节点，你拖好的卡片留在原处；想整体对齐时点「一键排版」。高亮和探索标记不再写进代码块，选区跨过代码块时只高亮正文部分。PDF 阅读器里的对话气泡移到页面右侧空白处，不再挡住文字。',
      en: 'Asking a follow-up, exploring, merging or regenerating places only the new node, and the cards you arranged stay where they are; Tidy layout rearranges the whole canvas when you want it. Highlights and explore marks no longer go into code blocks, and a selection that crosses a code block highlights its text part. The conversation bubble in the PDF reader sits in the page margin and no longer covers text.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.21 entry stays the announcement, this one is history only
    version: '0.5.25',
    date: '2026-10-24',
    announce: false,
    lead: {
      zh: '文件和链接在画布缩小时保持原来的卡片，和拖入的 md 文档一样，高度不再随缩放变化，内容在阅读器里看。便签缩小后仍显示摘要。识别过的 PDF 不会再在节点上露出页码标记。',
      en: 'Files and links keep their card when you zoom out, as a dropped .md file always did, so their height no longer changes with the zoom; their text is read in the reader. Notes still turn into a summary when zoomed out. A recognized PDF no longer shows its page markers on the node.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.21 entry stays the announcement, this one is history only
    version: '0.5.24',
    date: '2026-10-22',
    announce: false,
    lead: {
      zh: 'Agent 回答的节点重新有了摘要和类型标记。摘要、材料标签、记忆这类后台调用统一挑模型：不交给 Agent，一个模型出错就换下一个，接口不接受关闭思考时改发普通请求。所有模型都没有回应时会提示一次，右键节点选「更新节点摘要」可以重试；批量更新连续三个节点没有回应会停下并说明原因。识图和 PDF 识字只用普通模型，并设了超时。缩放摘要不再把小标题和表格行当成句子。',
      en: 'Nodes answered by an agent get their summaries and move badges again. Background calls such as summaries, material labels and memory pick models one way: never an agent, the next model when one fails, and an ordinary request when an interface does not take the switch that turns thinking off. When no model answers you hear it once, and right-click, Update node summary, tries again; a batch update stops after three nodes in a row without an answer and says why. Image text and PDF pages are read by ordinary models only, with a time limit. Zoom summaries no longer take headings and table rows for sentences.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.21 entry stays the announcement, this one is history only
    version: '0.5.23',
    date: '2026-10-22',
    announce: false,
    lead: {
      zh: '可以把 .ipynb 拖进画布当材料。阅读器的原版视图按单元格显示文字、代码、保存的输出和图；提取文本视图是模型读到的内容。保存的输出作为作者上次运行的记录交给模型，问到改参数再跑时，模型会说明该怎么跑。图随上下文发给能看图的模型，也可以切换为仅文本。',
      en: 'Drop a .ipynb on the canvas as material. The reader\'s original view shows its cells as the author left them: text, code, saved outputs and figures; the text view shows what the model reads. Saved outputs reach the model as a record of the author\'s last run, so asked to change a parameter and run again, it says what to run. Figures go along to models that can see images, or switch to text only.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.21 entry stays the announcement, this one is history only
    version: '0.5.22',
    date: '2026-10-21',
    announce: false,
    lead: {
      zh: '撤销和重做按步进行：撤销一步再重做，画布回到原样；输入框里的 Cmd/Ctrl+Z 只撤销刚打的字；拖动、调整大小、分区框和折叠各算一步；正在生成的节点不会被撤销删掉（#79）。关闭窗口不再中断正在生成的回答：Mac 上关窗口改为隐藏，Windows 和 Linux 可以在画布菜单里选择关闭时留在托盘（#77）。没有手动调过大小的长便签，正文到回答框的高度为止，超出部分滚动。已归档的节点不再进入摘要读到的上下文，也不再被重算（#51）。',
      en: 'Undo and redo go step by step: undoing a step and redoing it returns the canvas as it was; Cmd/Ctrl+Z in a text field takes back only the typing; moves, resizes, frames and folds are steps of their own; a node still generating is never removed by an undo (#79). Closing the window no longer stops an answer in progress: on macOS the window hides, and on Windows and Linux the canvas menu can keep the app in the tray (#77). A long note that was never resized stops at the answer box\'s height and scrolls. Archived steps stay out of what the summariser reads and out of replay (#51).',
    },
    items: [],
  },
  {
    version: '0.5.21',
    date: '2026-10-20',
    announce: true,
    lead: {
      zh: '💬 Agent 的问题在节点上回答，权限用一个开关设定。Harness 插件里的模型也能联网搜索了。',
      en: '💬 Answer an agent\'s questions on its node, and set its permissions with one switch. Models inside the Harness plugin can now search the web.',
    },
    items: [
      {
        title: { zh: '💬 在节点上回答 Agent 的问题', en: '💬 Answer the agent on its node' },
        body: {
          zh: 'Harness、Claude Code 和 Codex 向你提问时，问题以一张表单出现在节点上：可以单选或多选，能看到每个选项的说明，也可以自己写答案；审阅计划时，计划全文也在卡片里。有问题在等你时，工具栏显示「N 个问题在等你」，点一下回到那个节点；画布缩小时，这个节点保持展开；窗口在后台时会发系统通知。',
          en: 'When Harness, Claude Code or Codex asks you something, the questions arrive on the node as one form: pick one or several, read what each option means, or write your own answer; a plan under review shows in full on the card. While a question waits, the toolbar shows how many are waiting and takes you to the node in one click; the node stays open when you zoom out, and a system notification appears when the window is in the background.',
        },
      },
      {
        title: { zh: '🛡 一个权限开关', en: '🛡 One permission switch' },
        body: {
          zh: '选了 Agent 模型后，工作目录旁边多了「权限」：每次询问、自动审查、全部放行，每张画布各自记住。菜单写明每一档对当前 Agent 的含义：Claude Code 和 Codex 用它们自己的自动审查；Harness 的设置只对画布发起的那一轮生效，这一轮结束后会话恢复原来的设置。Harness 的审批也可以选「本对话一直允许」，只对完全相同的操作生效。',
          en: 'With an agent model picked, a Permissions switch sits beside the working directory: Ask, Auto review or Allow all, remembered per canvas. The menu says what each choice means for the agent you picked: Claude Code and Codex use their own auto review; for Harness the choice applies to the turn the canvas starts, and the session returns to its own setting afterwards. A Harness approval can now be allowed for the rest of the session, for that exact step only.',
        },
      },
      {
        title: { zh: '🔎 联网搜索', en: '🔎 Web search' },
        body: {
          zh: 'Harness 插件里，打开联网开关后，Harness 自带的模型通过 Harness 的网页搜索查资料，来源按编号引用；在 Harness 的网页搜索设置里打开新版 Web 搜索 API，每条结果会带摘要。桌面版的搜索引擎可以选 DeepSeek 搜索，用你 DeepSeek 接口的 key，按成功的搜索次数计费。DeepSeek 的 Flash 模型改用新名 deepseek-flash，它可以看图；固定在旧名上的节点会自动改用新名。',
          en: 'Inside the Harness plugin, with the web switch on, Harness\'s own models search through Harness\'s web search and cite their sources by number; turning on the new Web Search API in Harness\'s web search settings adds an excerpt to each result. The desktop app can use DeepSeek Search as its engine, with your DeepSeek interface\'s key, billed per successful search. DeepSeek\'s Flash model now goes by deepseek-flash and reads images; nodes pinned to the old name move to the new one.',
        },
      },
    ],
  },
  {
    // a quiet release: the 0.5.19 entry stays the announcement, this one is history only
    version: '0.5.20',
    date: '2026-10-19',
    announce: false,
    lead: {
      zh: '回答里的 mermaid 代码块在侧栏、阅读器和全屏查看里画成图；画布上的节点卡显示固定高度的占位，卡片高度不变（#76）。导入的 Agent 会话里，工具调用记录改成一块执行记录交给模型，写明那一轮已经执行过、本对话没有工具，普通模型不再接着写工具调用标记或编造执行结果；回答里仍有写成文字的调用时，折成一行说明，插件里可以交给同一模型的 Agent 重跑（#74）。',
      en: 'Mermaid code blocks in an answer draw as diagrams in the side panel, the reader and the full-screen view; canvas cards show a fixed-height stand-in and keep their height (#76). In imported agent sessions, tool steps reach the model as one execution record that says the turn already ran and this conversation has no tools, so a plain model no longer writes the next tool call as markup or makes up its results; a call still written as text folds to one line, and inside the plugin the node can be rerun as the same model\'s agent (#74).',
    },
    items: [],
  },
  {
    version: '0.5.19',
    date: '2026-10-14',
    announce: true,
    lead: {
      zh: '🧭 Harness 插件：ThoughtDAG 进了宿主侧栏。开关不再浮在顶条上，侧栏「插件」下面一行 ThoughtDAG，点开画布在主栏，三端一样。',
      en: '🧭 Harness plugin: ThoughtDAG moves into the host\'s sidebar. No floating switch over the top strip any more; a ThoughtDAG row under Plugins opens the canvas in the main column, the same on every platform.',
    },
    items: [
      {
        title: { zh: '🧭 侧栏入口', en: '🧭 The sidebar entry' },
        body: {
          zh: '插件用的是宿主给「插件」「自动化任务」的同一套机制：侧栏一行 ThoughtDAG，画布在主栏打开，回对话点侧栏里的任一会话。标签随宿主语言，样式随宿主主题，右侧文档预览可以和画布并排，侧栏收起画布跟着扩。画布里那对「对话 | 思维图」按钮去掉了。需要 Harness 0.2.0-rc.2 或更新，老版本宿主退回原来的浮动开关。感谢 @yoczhang、@orphiczhou、@Archiloss 在 #55、#61、#63、#73 里把浮动开关的每一处碰撞都量了出来。',
          en: 'The plugin now uses the mechanism the host gives its own Plugins and Scheduled tasks pages: a ThoughtDAG row in the sidebar, the canvas in the main column, and any session in the sidebar to return to the chat. The label follows the host\'s language and the row its theme; the right-side document preview sits beside the canvas, and the canvas widens when the sidebar collapses. The Chat | Thought graph pair inside the canvas is gone. Needs Harness 0.2.0-rc.2 or later; older hosts fall back to the floating switch. Thanks to @yoczhang, @orphiczhou and @Archiloss for measuring every collision of the floating switch in #55, #61, #63 and #73.',
        },
      },
    ],
  },
  {
    // a quiet release: the 0.5.17 entry stays the announcement, this one is history only
    version: '0.5.18',
    date: '2026-10-12',
    announce: false,
    lead: {
      zh: 'Harness 插件的一批修正。本地自动备份在插件里改由宿主写文件：文件夹用 Harness 自己的对话框选，Windows 桌面端不再选完没反应（@Heizaillica469 的 PR #67）；之前在 Harness 里用浏览器授权启用过备份的，更新后请重选一次文件夹。桌面端 0.2 的 v4 会话里，从画布带入上下文提问或注入消息不再让那一轮失败（#69）。插件注入的样式表标明归属，不再被宿主误认领给别的插件后删掉，画布浮层不再塌掉（#70）。插件里的能力面板不再显示宿主用不了的搜索引擎下拉和 AnySearch key 入口（#72）。',
      en: 'A batch of harness plugin corrections. Inside the plugin the local backup is now written by the host: the folder comes from Harness\'s own dialog, and the Windows desktop no longer goes silent after picking one (@Heizaillica469\'s PR #67); if you had enabled the backup inside Harness through the browser\'s own permission, pick the folder once more after updating. In the desktop 0.2 app\'s v4 sessions, asking from the canvas with inherited context or injecting a message no longer kills that turn (#69). The plugin\'s style sheet now names its owner, so the host\'s loader no longer hands it to another plugin and drops it, which collapsed the canvas overlay (#70). The capabilities panel inside the plugin no longer shows the engine picker or the AnySearch key the host cannot use (#72).',
    },
    items: [],
  },
  {
    version: '0.5.17',
    date: '2026-10-07',
    announce: true,
    lead: {
      zh: '📖 阅读器停靠在画布左侧：原文常驻，画布和节点面板在旁边照常工作。',
      en: '📖 The reader docks on the canvas\'s left: the text stays, the canvas and the node panel keep working beside it.',
    },
    items: [
      {
        title: { zh: '📖 阅读器停靠', en: '📖 The docked reader' },
        body: {
          zh: '双击材料，阅读器现在停靠在画布左侧，宽度可拖，画布和右侧节点面板照常操作。在阅读器里提问，回答显示在原文下方的线索带里，画布不会跳走。标题带下拉可以切换材料；在画布上选中一份材料，阅读器跟着切过去；选中带页码的问题，原文滚到那一页。右上角可以展开成以前的全屏形态，再切回来；窗口太窄时自动用全屏。',
          en: 'Double-click a material and the reader now docks on the canvas\'s left, as wide as you drag it, with the canvas and the node panel live beside it. Ask from the reader and the answer reads in a thread band under the text; the canvas stays put. The title\'s dropdown switches materials; selecting a material on the canvas switches the reader too, and selecting a page-anchored question scrolls the text to that page. The top-right button expands to the former full-screen view and back; a narrow window uses full screen on its own.',
        },
      },
      {
        title: { zh: '⬚ 分区框不再自己长大', en: '⬚ Frames stay where you drew them' },
        body: {
          zh: '自动布局不再移动或改动分区框。以前框会按成员的新位置重新包一圈，同一棵对话树上的两个框会互相吞并（#64）。布局后跑到框外的节点，拖动分区框重新包住即可；拖框带节点的行为不变。',
          en: 'Auto layout no longer moves or resizes a frame. It used to re-wrap a frame around its members\' new positions, and two frames on one conversation tree would swallow each other (#64). Nodes that layout moves out of a frame are yours to re-frame by dragging the frame; dragging a frame still carries its nodes.',
        },
      },
    ],
  },
  {
    // a quiet release: the 0.5.12 entry stays the announcement, this one is history only
    version: '0.5.16',
    date: '2026-10-03',
    announce: false,
    lead: {
      zh: '问画布的三处修正：问题属于提问时的那张画布，回答只存在那里，切画布时对话框关闭（#59）；一轮回答记住自己请求时的编号，之后落到画布上芯片和连线一致（#60）；全新机器上的全量回忆计数直接得 0，不再一直显示刷新中（#57）。示例画布的欢迎便签和指南写全了平移画布的每种方式。',
      en: 'Three corrections to ask-the-canvas: a question belongs to the canvas it was asked on, its answer is stored there alone, and switching canvases closes the dialog (#59); a turn keeps the numbers its request used, so chips and wires agree when it is dropped later (#60); the full-recall count on a fresh machine reads zero instead of refreshing forever (#57). The example canvas\'s welcome note and the guides name every way to pan.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.12 entry stays the announcement, this one is history only
    version: '0.5.15',
    date: '2026-10-02',
    announce: false,
    lead: {
      zh: 'Harness 插件的「对话 | 思维图」开关固定在窗口顶部中间偏右，所有平台一致，带上了三点标记；Windows 上不再在标题栏里画标题带，画布从标题栏下方开始（#55 的回访）。',
      en: 'The harness plugin\'s Chat | Thought graph switch sits at the top of the window, centre-right, on every platform, with the three-dot mark; on Windows the title band is gone and the canvas starts below the title bar (the #55 follow-up).',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.12 entry stays the announcement, this one is history only
    version: '0.5.14',
    date: '2026-10-02',
    announce: false,
    lead: {
      zh: '三条回仓库的路：更新公告底部的「GitHub 点个星」，⋯ 菜单里带星数的 GitHub 入口（更新历史底下也有 Releases 和点星的链接），以及插件页的描述和说明里的仓库地址。',
      en: 'Three doors back to the repository: a star link at the foot of the update notice, a GitHub entry with the star count in the ⋯ menu (with Releases and star links under the release history), and the repository named in the plugin\'s description and README.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.12 entry stays the announcement, this one is history only
    version: '0.5.13',
    date: '2026-10-02',
    announce: false,
    lead: {
      zh: '打开大会话时页面不再卡住：材料、高光、时间轴三个总览在关闭时不再每次节点更新都遍历整张画布（@suhyungJang 的 PR #58，时间轴照同样方式补上）。',
      en: 'Opening a large session no longer freezes the page: the materials, highlights and timeline overviews stop walking the whole canvas on every node update while closed (@suhyungJang\'s PR #58; the timeline follows the same way).',
    },
    items: [],
  },
  {
    version: '0.5.12',
    date: '2026-10-01',
    announce: true,
    lead: {
      zh: '💬 新增「问画布」：让模型读整张画布，回答里的每个编号都能点回节点。',
      en: '💬 New: Ask the canvas. The model reads the whole canvas, and every number in its answer points back at a node.',
    },
    items: [
      {
        title: { zh: '💬 问画布', en: '💬 Ask the canvas' },
        body: {
          zh: '工具栏 ⌘F 旁的问号气泡。它读画布的大纲（每个节点一行：编号、主题、结论、上游），选中节点时再读它的脉络和材料。回答用编号引用：悬停点亮节点，点击定位，画布上没有的编号标红。「落到画布」把这轮问答变成节点，引用线连到它提到的每个节点。空白时给了五个起手问题：总览、定位、溯源、比对、进展。只看画布，不联网，不进上下文。',
          en: 'The question bubble next to ⌘F on the toolbar. It reads an outline of the canvas (one line a node: number, topic, takeaway, upstream) and, with a node selected, that node\'s chain and materials. Answers cite by number: hover lights the node, click locates it, a number the canvas lacks shows red. "Drop onto the canvas" turns the exchange into a node wired by reference to every node it cited. Five opening questions wait in the empty state: overview, locate, grounds, compare, progress. It reads only the canvas: no web, nothing enters your context.',
        },
      },
      {
        title: { zh: '。 标点不再孤立', en: '。 Punctuation stays with its word' },
        body: {
          zh: '缩小后牌子上的句号、逗号不再掉到下一行开头。',
          en: 'On zoomed-out plaques a full stop or comma no longer opens a line by itself.',
        },
      },
      {
        title: { zh: '🔧 两处修复', en: '🔧 Two fixes' },
        body: {
          zh: '侧栏里点到已不存在的探索标记，面板不再空白（#56）。索引升级后第一次选「全量」回忆，不再卡住整个应用：索引在后台刷新，菜单里提示一句（#57）。',
          en: 'Clicking a stale explore mark in the panel no longer blanks it (#56). The first "full" recall after an index upgrade no longer stalls the app: the index refreshes in the background and the menu says so (#57).',
        },
      },
    ],
  },
  {
    // a quiet release: the 0.5.2 entry stays the announcement, this one is history only
    version: '0.5.11',
    date: '2026-10-01',
    announce: false,
    lead: {
      zh: '一批围绕提问的收口。空节点里选的全量回忆现在真的会跑，之前发送时被丢掉了；问题编辑器（卡片和侧栏）里多了这个节点自己的联网、学术、回忆开关，改的只是这个节点；任何节点都能设自己的角色，编辑器改成侧栏头部下方的整宽条；问题也按 Markdown 渲染；全量回忆的确认框按实测重算，只说要多等一会儿和费用；模型选择器把别名解析到的型号标为上次运行；Harness 插件对话页的浮动开关挪到标题行下方，Windows 上不再被拖拽区吞掉点击。',
      en: 'A batch around asking. A full recall chosen on an empty card now runs (the choice was dropped on send); the question editors (card and panel) carry the node\'s own web, scholar and recall switches, and edit only that node; any node can set its own role, in a full-width editor under the panel header; questions render as Markdown; the full-recall dialog is re-measured and names the wait and the cost; the model picker marks an alias\'s resolved model as the last run\'s; the harness plugin\'s floating switch sits below the title row, so the Windows drag region no longer swallows its clicks.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.2 entry stays the announcement, this one is history only
    version: '0.5.10',
    date: '2026-10-01',
    announce: false,
    lead: {
      zh: '修复 0.5.9 带出的一处：索引升级后、第一次搜索之前，「全量」回忆的确认框把索引读成 0 条、0 秒、0 美元。现在计数会先把索引更新到位；索引真的空着或还在重建时，只提示一句，不弹确认框。',
      en: 'Fixes one thing 0.5.9 brought: after the index upgrade and before the first search, the confirm dialog for a full recall read the index as 0 turns, 0 seconds, $0.00. The count now brings the index up to date first; an index that is empty or still rebuilding gets a notice instead of a dialog.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.2 entry stays the announcement, this one is history only
    version: '0.5.9',
    date: '2026-10-01',
    announce: false,
    lead: {
      zh: '回忆与记忆的四处收口，都出自 #51 的复审：归档的节点退出回忆索引（这次启动会把索引重建一遍）；画像文档的每一行记着来自哪个画布、哪天、是本人说的还是推断的，模型改写后不再丢；新拉出的空节点和阅读器底栏有了和追问框一样的联网、学术、回忆开关；基准的 repair 用例多了一格带陈旧标记的条件。',
      en: 'Four follow-ups from the #51 review, all on recall and memory: archived nodes leave the recall index (the index rebuilds once on this start); every line of the profile documents keeps which canvas it came from, when, and whether you said it or it was inferred, through the model\'s rewrites; a fresh node and the reader\'s footer carry the same web, scholar and recall switches as a follow-up; the benchmark\'s repair cases gain a condition that carries the stale mark.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.2 entry stays the announcement, this one is history only
    version: '0.5.8',
    date: '2026-09-30',
    announce: false,
    lead: {
      zh: '修复 0.5.7 的一处遗漏：回答里的消毒把画布自己加的标记也剥掉了，从回答文字跳到分支的入口失效，用户高亮和探索标记都退化成默认黄底。现在两种标记保留各自的类和目标，跳转、点状下划线、高亮填色都回来了。',
      en: 'Fixes an oversight in 0.5.7: the answer sanitizer also stripped the marks the canvas adds itself, so the jump from an answer to the branch it bore stopped working and highlights and explore marks fell back to the browser\'s plain yellow. Both marks keep their class and target again; the jump, the dotted underline and the highlight fill are back.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.2 entry stays the announcement, this one is history only
    version: '0.5.7',
    date: '2026-09-30',
    announce: false,
    lead: {
      zh: '安全修补：回答里的原始 HTML 先经过消毒再渲染，折叠块、上下标、键帽、高亮、表格、换行照旧，能执行脚本或嵌入外部页面的标签（iframe、object、script、style、form 等）被去掉；此前分享链接、导入的画布或模型引用的网页都能借 srcdoc 的 iframe 在本页面的源里执行代码。托管代理的模型探测只接受公网 https 地址，两处网页快照抓取共用一套地址检查并逐跳核对重定向。另外两处小修：「重跑上游已变」只跑确认框里数到的那些，牌子摘要不再参考已归档的步骤。',
      en: 'Security: raw HTML in an answer is sanitized before rendering; folds, sub/sup, kbd, highlights, tables and line breaks stay, while tags that run scripts or embed pages (iframe, object, script, style, form and the like) are stripped. Until now a shared link, an imported canvas or a page the model quoted could run code in this origin through a srcdoc iframe. The hosted proxy\'s model probe takes public https endpoints only, and both page-snapshot fetchers share one address guard and check every redirect hop. Two small fixes: replay reruns exactly the stale nodes the dialog counts, and plaque summaries no longer read archived steps.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.2 entry stays the announcement, this one is history only
    version: '0.5.6',
    date: '2026-09-30',
    announce: false,
    lead: {
      zh: '回忆改成安静的小标签，默认关：输入框旁一个「回忆」，点开是开关、搜索范围（轻量 40 条 / 深挖 2,000 条 / 全量）和带入上下文，改的只对这一次提问生效，「设为默认」写回全局；深挖和全量由判断模型分批看候选，全量先告诉你条数、秒数和费用。判断模型页的开关并进供应商下拉（最后一项「关闭，按规则」）；联网和学术搜索也默认关。每个节点都有可缩放的摘要：一句话的回答、笔记、文件都上梯子。双击卡片上的问题，侧栏编辑框带着原文打开。Harness 插件：思维图顶上是自己的标题带（不再压住红绿灯）；自己的模型接口回来了，添加、拉模型列表、调用都走插件；不再提示桌面版新版本，插件更新提示直接说在插件页重新添加哪个包；桌面版 0.2 写的 v4 会话文件进得了对话地图。',
      en: 'Recall is a quiet chip, off by default: a "Recall" beside the composer opens the switch, the search reach (light 40 / deep 2,000 / full) and the context brought in; a change there holds for the next ask only, "set as default" writes it back. Deep and full have the decision model read candidates in batches; full first says how many turns, seconds and dollars. The decision model page folds its switch into the provider dropdown (last entry: off, rules decide); web and scholar search start off too. Every node zooms: one-line answers, notes and files get a ladder. Double-clicking a card\'s question opens the side panel editor with the text in place. Harness plugin: the map wears its own title band (clear of the traffic lights); its own model interfaces are back, added, listed and called through the plugin; no more desktop-app update nudge, and the plugin\'s own notice names the package to re-add on the Plugins page; the 0.2 desktop\'s v4 session files reach the atlas.',
    },
    items: [],
  },
  {
    // a quiet release: the 0.5.2 entry stays the announcement, this one is history only
    version: '0.5.5',
    date: '2026-09-29',
    announce: false,
    lead: {
      zh: '换档不再互相盖住：缩小到地图层时，节点的牌子不会超出布局留给它的位置，写不下的摘要在底部渐隐，再放大一档就能看全；折叠卡显示和牌子同一段摘要，放大缩小之间只是字号在变。节点间距略微拉开，已有画布的位置不动，按「一键排版」才换成新间距。另外：从 Finder 启动时也能找到本机的 Pi、Codex、Claude Code 命令行，找不到会说明查过哪些地方，可重新检测；子 Agent 的运行展开在父画布上，作为那一轮旁边的分支；模型接口分成「慢思考 · 回答模型」和「快思考 · 判断模型」两页，只用 Agent 的人也能单独接判断模型；新装机没有模型时会先问一次本机的 Agent。',
      en: 'Zoom tiers no longer cover each other: at map zoom a node\'s plaque stays inside the room the layout keeps for it, an abstract that runs past it fades out at the bottom and shows in full one step in; the folded card carries the same abstract as the plaque, so zooming only changes the type size. Node gaps open slightly; existing canvases keep their positions until you choose Tidy layout. Also: the Pi, Codex and Claude Code CLIs are found under a Finder launch, and a missing one says where it looked, with a recheck; a subagent\'s run unfolds on the parent canvas as a branch beside its turn; the model dialog has two pages, slow thinking for answering models and fast thinking for the decision model, which agent-only users can connect on its own; a fresh install with no model asks the local agents first.',
    },
    items: [],
  },
  {
    // a patch: the 0.5.2 entry stays the announcement, this one is history only
    version: '0.5.4',
    date: '2026-09-29',
    announce: false,
    lead: {
      zh: '鼠标滚轮恢复缩放画布，和 0.5.2 一样。0.5.3 起滚轮改成了平移，这对触控板顺手，却让鼠标用户没法用滚轮缩放。触控板用户可以在画布 ⋯ 菜单打开「滚轮平移画布」：双指滑动即平移，捏合或按住 ⌘/Ctrl 滚动来缩放。',
      en: 'The mouse wheel zooms the canvas again, as in 0.5.2. Since 0.5.3 it panned, which suits a trackpad but left mouse users without wheel zoom. On a trackpad, turn on ⋯ → Wheel pans the canvas: a two-finger scroll pans, pinch or hold ⌘/Ctrl while scrolling to zoom.',
    },
    items: [],
  },
  {
    // a patch: the 0.5.2 entry below stays the announcement, this one is history only
    version: '0.5.3',
    date: '2026-09-27',
    announce: false,
    lead: {
      zh: '圈选多个节点后，工具栏多了「更新节点摘要」：用当前选中的模型为它们一次更新四层摘要，文件、便签和短回答自动跳过。进度在右下角，随时可停。旧画布想整体升级到新摘要，圈一下就行。右键单个节点也是同一个入口。',
      en: 'With several nodes selected, the toolbar gains "Update node summaries": the picked model updates their four summary levels in one go, files, notes and short answers skipped. Progress shows bottom right and can be stopped any time. An older canvas upgrades to the new summaries with one lasso; the right-click item on a single node is the same door.',
    },
    items: [
      {
        title: { zh: '🧭 摘要写的是这一步新增了什么', en: '🧭 Summaries say what the step adds' },
        body: {
          zh: '结论与短述改为由模型撰写。写之前它先读这条思路里前面各步的牌匾，只写本步新增的结论、决定或转向，不重复前面已经说过的；概要仍是原答里的原文摘句，作为证据。旧节点用「更新节点摘要」换新即可。',
          en: 'The takeaway and brief are now written by the model. It first reads the plaques of the earlier steps in the thread, then writes only what this step adds, a conclusion, a decision or a turn, without repeating what came before; the abstract stays verbatim sentences of the answer, as evidence. Older nodes switch over with "Update node summaries".',
        },
      },
      {
        title: { zh: '🖐️ 触控板双指滑动即平移', en: '🖐️ Two-finger scroll pans' },
        body: {
          zh: '在触控板上双指滑动就能移动画布，不用再按住按键拖。捏合缩放不变。鼠标滚轮现在同样是平移，缩放请按住 ⌘（Windows 上是 Ctrl）再滚。感谢 @Pireirik 的贡献。',
          en: 'On a trackpad, a two-finger scroll moves the canvas; no button to hold. Pinch still zooms. A mouse wheel now pans too; hold ⌘ (Ctrl on Windows) to zoom with it. Contributed by @Pireirik.',
        },
      },
    ],
  },
  {
    version: '0.5.2',
    date: '2026-09-27',
    announce: true,
    lead: {
      zh: '🔍 上下文管理重大更新！现在，无论画布缩放至何种比例，节点内容始终保持极佳的阅读体验。',
      en: '🔍 A major update to context management! Whatever the zoom, every node on the canvas now stays a pleasure to read.',
    },
    media: { src: { zh: 'whats-new/zoom-ladder-zh.mp4', en: 'whats-new/zoom-ladder-en.mp4' }, alt: { zh: '缩小画布时，牌匾上的结论逐词长成短述再长成摘要', en: 'Zooming out, a plaque\'s takeaway grows word by word into a brief, then an abstract' }, width: 960, height: 600 },
    items: [
      {
        title: { zh: '🪜 智能四层摘要', en: '🪜 Four smart summary levels' },
        body: {
          zh: '每个回答自动构建「主题、结论、短述、完整概要」四个递进层级，随缩放比例自动无缝切换。',
          en: 'Every answer builds four progressive levels, topic, takeaway, brief and full abstract, and switches between them seamlessly as you zoom.',
        },
      },
      {
        title: { zh: '✨ 丝滑的视觉过渡', en: '✨ Silky visual transitions' },
        body: {
          zh: '缩放时，文字会逐词自然展开或收起。保留的关键词会平滑移动，新文本自然淡入，核心重点始终高亮加深。视线聚焦零中断，数十个节点的全局脉络一眼即达。',
          en: 'As you zoom, text unfolds or folds word by word. The words that stay glide into place, new text fades in, and the key points stay highlighted in full ink. Your focus is never broken, and the shape of dozens of nodes reads at a glance.',
        },
      },
      {
        title: { zh: '🔁 新旧节点全面兼容', en: '🔁 New and old nodes alike' },
        body: {
          zh: '新回答自动生效该特性；旧节点会在浏览时实时生成摘要层级，若需更精准的 AI 总结，只需右键一键生成。',
          en: 'New answers get it automatically; older nodes build their levels live as you browse, and for a sharper AI-selected summary, one right-click does it.',
        },
      },
      {
        title: { zh: '🎚️ 时间线详略随手调', en: '🎚️ Timeline detail at your fingertips' },
        body: {
          zh: '时间线弹窗新增详略滑块，从主题一路拉到完整概要，字号与行距随手指流动，每一步文字完整呈现，告别省略号。',
          en: 'The timeline overview gains a detail slider: glide from topic to full abstract, type and spacing flowing with your drag, every step shown whole, no ellipsis anywhere.',
        },
        media: { src: { zh: 'whats-new/timeline-detail-zh.mp4', en: 'whats-new/timeline-detail-en.mp4' }, alt: { zh: '拖动时间线弹窗的详略滑块，每一步的文字逐词展开', en: 'Dragging the timeline overview\'s detail slider, each step\'s text unfolds word by word' }, width: 720, height: 760 },
      },
      {
        title: { zh: '🛡️ 所见即所发', en: '🛡️ What you see is what is sent' },
        body: {
          zh: '判断模型认定上游改动与答案无关时，「上游已变」标记现在同时从预览和请求中退场，两者始终一致。感谢 Agent Memory Atlas 的审阅指出这一点。',
          en: 'When the decision model rules an upstream change irrelevant, the "upstream changed" mark now leaves the preview and the request together, always in step. Thanks to the Agent Memory Atlas review for catching it.',
        },
      },
      {
        title: { zh: '🧹 右键菜单焕新', en: '🧹 A refreshed right-click menu' },
        body: {
          zh: '「重新生成」更简洁，CLI 相关操作合并为一项，新增「用模型重选摘要」。手动修改过的回答会自动重做摘要。',
          en: '"Regenerate" is simpler, the CLI actions merge into one, and "Update node summary" joins the menu. Hand-edited answers get their summaries redone automatically.',
        },
      },
    ],
  },
  {
    // a patch: the 0.5 entry below stays the announcement, this one is history only
    version: '0.5.1',
    date: '2026-09-26',
    announce: false,
    lead: {
      zh: '0.5 之后的一批修正。删除正在生成的节点时，那一轮生成随之中止，不再在后台跑完。记忆的自动写入上限按画布分开计，切换画布后重新计；之前是全局三条写满就静默。档案更新只带走模型读过的那几条待归档事实，更新期间新归档的保留下来；档案文件的写入排队进行，不再互相覆盖。why 层不再把执行失败的文件操作算作改动足迹，更新后索引会重建一次。判断模型直接沿用模型接入里保存的 OpenRouter key，不再显示为空、测试不可点。',
      en: 'A round of fixes after 0.5. Deleting a node that is still generating stops that generation instead of letting it run on in the background. The memory judge\'s automatic-write cap counts per canvas and starts over on a canvas switch; it used to be one global count of three, after which memory went quiet. A dossier update takes only the filed facts the model read and keeps anything filed while it was writing; dossier writes queue instead of overwriting one another. The why layer no longer counts a file operation the harness answered with an error as a change, and the index rebuilds once. The decision model uses the OpenRouter key saved with your model providers, instead of showing an empty field with a disabled test.',
    },
    items: [],
  },
  {
    version: '0.5.0',
    date: '2026-09-26',
    announce: true,
    lead: {
      zh: '🎉 ThoughtDAG 0.5：记忆上线。你在 Pi、Codex、Claude Code、DeepSeek Harness 里聊过的一切，现在接成一个可以回忆的整体。散在几百个会话里的碎片，按主题整理成档案；提问时相关的档案和对话自动带进上下文，跨 Agent、跨时间。背后是快思考与慢思考的分工：慢思考模型回答，快思考模型判断。所有信息都在你自己的机器上。',
      en: '🎉 ThoughtDAG 0.5: memory. Everything you discussed in Pi, Codex, Claude Code and DeepSeek Harness now forms one whole you can recall. Fragments scattered across hundreds of sessions are organised into dossiers by topic; when you ask, the relevant dossiers and conversations ride into the context, across agents and across time. Behind it, a division of labour: a slow-thinking model answers, a fast-thinking model decides. Everything stays on your machine.',
    },
    items: [
      {
        title: { zh: '碎片串成一条线', en: 'Fragments become a thread' },
        body: {
          zh: '昨天在 Codex 里定的阈值，上周在 Claude Code 里排除的方案，今天在画布上问起时都在。每个主题一份档案：是什么、定过什么、到哪一步、还没解决什么，每句都能点回原来的那轮对话。「你」是两份文档：偏好与身份，记到新东西时改写而不是堆砌。原来的记忆条目已并入。',
          en: 'The threshold you settled in Codex yesterday and the approach you ruled out in Claude Code last week are there when you ask on the canvas today. Every topic keeps a dossier: what it is, what was decided, where it stands, what is still open, each line pointing back to its turn. Your profile is two documents, preferences and identity, rewritten rather than piled up. Earlier memory entries were folded in.',
        },
        link: { label: { zh: '记忆指南', en: 'The memory guide' }, href: `${DOCS}/zh/guides/memory` },
      },
      {
        title: { zh: '提问时自动回忆', en: 'Recall as you ask' },
        media: { src: { zh: 'whats-new/jev-recall.mp4', en: 'whats-new/jev-recall.mp4' }, alt: { zh: '回忆流程里，判断模型半秒内从候选片段中选出相关的几条', en: 'In the recall flow the decision model picks the relevant excerpts from the candidates in under a second' }, width: 1200, height: 720 },
        body: {
          zh: '开着「回忆」提问，先判断问题涉及哪些主题，把档案整份带进去；问的是细节时再补几条原话。带了什么、花了多少，面板上一条一条看得见，不想要的划掉就不带。带入量三档：省、标准、多带。',
          en: 'With recall on, a question is first matched to its topics and their dossiers ride in whole; a question about a detail brings a few verbatim excerpts too. What came in and what it cost is listed item by item; strike one and it stays out. Three amounts: lean, standard, generous.',
        },
      },
      {
        title: { zh: '快思考，慢思考', en: 'Fast thinking, slow thinking' },
        body: {
          zh: '回答你的是慢思考模型。判断「这条相关吗」「这句是决定吗」「这处改动影响吗」的是快思考模型：半秒一次，返回校准过的概率，让回忆、地图徽章和「上游已变」都有依据。模型选择器里一行开关，默认开；关掉全部退回规则，功能不变。',
          en: 'The slow-thinking model answers you. The fast-thinking model decides — is this relevant, is this line a decision, does this change matter — in half a second, with calibrated probabilities, so recall, map badges and “upstream changed” rest on evidence. One switch in the model picker, on by default; off, every decision falls back to a rule and nothing stops working.',
        },
      },
      {
        title: { zh: '接入一个快思考模型', en: 'Connect a fast-thinking model' },
        body: {
          zh: 'Jev 类判断模型可以经你已保存的聚合商接入直接使用，也支持官方接口和自建服务；没有接入时会提示，一切照常。',
          en: 'A Jev-class decision model runs through the aggregator access you already saved, through the official endpoint, or from a self-hosted server; without one you are told, and everything still works.',
        },
        link: { label: { zh: '怎么接入', en: 'How to connect one' }, href: `${DOCS}/zh/setup#decision-model` },
      },
      {
        title: { zh: '一切都在本地', en: 'All of it stays local' },
        body: {
          zh: '索引、主题标签、档案存在本机 .thoughtdag 目录，画像文档存在应用本地。判断时发出去的只有问题和候选片段，发给你自己选的接入。',
          en: 'The index, topic labels and dossiers live in your machine\'s .thoughtdag folder; your profile lives in the app\'s own storage. A decision sends only the question and the candidate excerpts, to the access you chose.',
        },
      },
    ],
  },
  {
    version: '0.4.20',
    date: '2026-09-23',
    announce: false,
    lead: {
      zh: 'DeepSeek Harness 插件一轮实测后的整理。「对话 | 思维图」开关：对话页顶部仍是浮动的，切到思维图后它移到画布顶栏「画布名」右侧，不再压住画布工具栏。工作目录改用 Harness 自己的目录选择器：本机运行时弹的就是系统的文件夹对话框，远程访问时回落为输入路径；0.4.19 里自带的目录浏览器撤掉。Harness Agent 也能选工作目录，新会话按所选目录运行。插件里去掉配置模型 API 的入口。实时镜像刷新会话时不再把镜头拉回节点。节点记录的是发起请求时的模型，执行中切换选择器不再改写徽章。Harness 执行中的每个工具调用都列为一条步骤，思考尾巴显示在下方。备份提醒去掉。',
      en: 'DeepSeek Harness plugin, after a round of hands-on testing. The 对话 | 思维图 switch still floats over the chat; on the canvas it sits in the canvas\'s own top bar next to the canvas chip, so it never covers the toolbar. The working directory is chosen in the harness\'s own picker: the system folder dialog when the harness runs on this machine, a typed path when reached remotely; the folder browser 0.4.19 carried is withdrawn. The Harness Agent gets the folder chip too, and a fresh session runs where it says. The API-key door is gone inside the plugin. The live mirror no longer drags the camera back to a node while its session refreshes. A node records the model it was asked with; switching the picker mid-run no longer relabels it. Every tool call of a harness run is listed as a step, the thinking beneath. The backup reminder is removed.',
    },
    items: [],
  },
  {
    version: '0.4.19',
    date: '2026-09-23',
    announce: false,
    lead: {
      zh: 'DeepSeek Harness 插件：Harness Agent 节点的回答不再「闪一下就没了」。新版 Harness（0.1.5-rc.3）不再把逐字流写进会话日志，一步只落一条 assistant/message；画布续读实时日志时按会话列表报的序号少读了一条，恰好是带答案的那条，节点随后被镜像成空回答。现在按实际持有的最后一条事件续读，且镜像永不把已有回答改写为空。思考过程重新同步显示：宿主订阅 Harness 新的流事件（agent/assistant-stream），正文和思考逐字到达节点，没有流的运行时从每步的 reasoning 块补发。「对话 | 思维图」开关回到浮动位置，空态也能切换（0.4.18 的标题栏开关撤回）。Agent 的工作目录改为浏览宿主机的文件夹来选，也仍可直接输入路径。',
      en: 'DeepSeek Harness plugin: a Harness Agent node no longer shows its answer for a moment and then loses it. Newer Harness builds (0.1.5-rc.3) stop writing the token stream into the session log; a step lands as one assistant/message. When the canvas read the live log incrementally it asked from the seq the session list reported and skipped exactly one event, the one carrying the answer, and the node was then mirrored as an empty reply. It now continues from the last event it actually holds, and a mirror never rewrites an existing answer to nothing. Reasoning shows live again: the host subscribes to the Harness\'s new stream event (agent/assistant-stream), so text and reasoning reach the node as they are produced; a runtime without that stream gets each step\'s reasoning block instead. The 对话 | 思维图 switch floats again and works on the empty page (the 0.4.18 header switch is withdrawn). An agent\'s working directory is chosen by browsing the host\'s folders, with a path field still there for typing.',
    },
    items: [],
  },
  {
    version: '0.4.18',
    date: '2026-09-23',
    announce: false,
    lead: {
      zh: 'DeepSeek Harness 插件：历史会话列表在新版 Harness 上不再为空。dsh 从 0.1.5-rc.2 起把会话格式版本写进日志文件名（session.v3.jsonl.zstd），插件现在按已知文件名探测，新旧两种都认（#44，感谢 @LHN-xiao-hai-tun）。模型选择器加宽，条目悬停显示完整名称，Agent 执行组的长名字改为换行而不是截断，flash 与 flash-vision 一眼可辨（#43）。',
      en: 'DeepSeek Harness plugin: the list of past sessions is no longer empty on newer Harness builds. From 0.1.5-rc.2 dsh writes the session format version into the log file name (session.v3.jsonl.zstd); the plugin now probes the known names and reads both (#44, thanks @LHN-xiao-hai-tun). The model picker is wider, every entry shows its full name on hover, and long names in the agent group wrap instead of being cut, so flash and flash-vision tell apart at a glance (#43).',
    },
    items: [],
  },
  {
    version: '0.4.17',
    date: '2026-09-21',
    announce: false,
    lead: {
      zh: 'DeepSeek Harness 插件：从画布向 Harness 提问时，节点只接自己那一轮。此前如果你同时在聊天框里发消息，画布节点会拿到你那轮的回答、在你那轮结束时提前收尾，并把镜像标记挂到错误的轮次上，产生重复节点；工具审批也可能被画布抢走。现在 Host 用 dsh 记在消息上的请求 id 精确认出自己的那一轮，文本、工具调用、审批、结束全部按这一轮过滤（#42，感谢 @nanami-0713）。桌面版本次只同步版本号。',
      en: 'DeepSeek Harness plugin: a question asked from the canvas now receives only its own turn. Before, if you were also typing in the chat, the canvas node could receive your turn\'s answer, finish early when your turn ended, and stamp its mirror mark on the wrong turn, leaving duplicate nodes; tool approvals could be captured by the canvas as well. The host now recognises its own turn by the request id dsh records on the message, and filters text, tool calls, approvals and the end of turn to that turn alone (#42, thanks @nanami-0713). The desktop app only moves its version number.',
    },
    items: [],
  },
  {
    version: '0.4.16',
    date: '2026-09-17',
    announce: false,
    lead: {
      zh: '分区框：两个只是部分重叠的框不再互相收编。拖动大框时，重叠的小框和它自己的节点留在原地；拖动和一键排版现在用同一条成员规则，普通节点按中心点归属，框只有完整落在另一个框里才算它的成员（#40，感谢 @nanami-0713）。DeepSeek Harness 插件：「插件有新版本」提示复制的命令带上具体版本号，发版当天也能立刻装到新版。',
      en: 'Frames: two frames that merely overlap no longer own each other. Dragging the larger one leaves the overlapping smaller frame and its own nodes in place; dragging and auto layout now share one membership rule, nodes by centre and a frame only when it lies fully inside another (#40, thanks @nanami-0713). DeepSeek Harness plugin: the update hint now copies a command naming the exact version, so a release installs on its first day too.',
    },
    items: [],
  },
  {
    version: '0.4.15',
    date: '2026-09-15',
    announce: false,
    lead: {
      zh: '分区框三件事：一键排版后，框跟着框内的节点重新包好（#32）；拖动外框会带动嵌套在里面的框；重叠时小框叠在大框上面，标题栏不再被盖住。三项均来自 @hexu321。DeepSeek Harness 插件：「对话 | 思维图」切换器移进会话标题栏，不再遮挡标题；返回按钮居中，画布右上的工具栏保持可见；从画布切回会话的跳转修好了（#30，来自 @nanami-0713）。插件重新在 npm 上发布，安装命令恢复为包名。',
      en: 'Frames, three fixes: after auto layout a frame re-wraps the nodes it held (#32); dragging an outer frame carries the frames nested inside it; where frames overlap, the smaller one stacks on top so its title bar stays reachable. All three by @hexu321. DeepSeek Harness plugin: the 对话 | 思维图 switch moves into the session header and no longer covers the title; the back button sits top centre, clear of the canvas toolbar; jumping from the canvas back to a session works again (#30, by @nanami-0713). The plugin is back on npm and the install command is the package name again.',
    },
    items: [],
  },
  {
    version: '0.4.14',
    date: '2026-09-11',
    announce: false,
    lead: {
      zh: '插件的「有新版本」提示现在复制 dsh plugin --profile web add dsh-thoughtdag@latest，这条命令对从 npm 装和从 Release 文件装的用户都有效（update 对文件安装无效）。其余同 0.4.13。',
      en: 'The plugin\'s update hint now copies dsh plugin --profile web add dsh-thoughtdag@latest, which works for installs from npm and from a release file alike (update does nothing for a file install). Otherwise the same as 0.4.13.',
    },
    items: [],
  },
  {
    version: '0.4.13',
    date: '2026-09-11',
    announce: false,
    lead: {
      zh: '修复：DeepSeek Harness 插件里，模型选择器丢失了「Harness · 模型」这一组 Agent 条目（0.4.11 起，机器上没装 Pi、Codex 等命令行时整组消失）。原因是思维图把 Harness 给的条目当成本机命令行的探测结果替换掉了，现在只替换命令行报来的那几种。插件里「如何使用」的教程动图也能显示了（#35，感谢 @Moya-Doc）。',
      en: 'Fix: inside the DeepSeek Harness plugin, the model picker lost the "Harness · model" agent entries (since 0.4.11; with no Pi or Codex CLI on the machine the whole group vanished). The canvas had been replacing the harness\'s entries with the local CLI probe; now only the entries the CLIs report get replaced. The tutorial gifs inside the plugin load again (#35, thanks @Moya-Doc).',
    },
    items: [],
  },
  {
    version: '0.4.12',
    date: '2026-09-10',
    announce: false,
    lead: {
      zh: 'DeepSeek Harness 插件里，Agent 子节点现在续接父节点的会话；同一父节点下的第二个分支从父节点那一轮分叉出自己的会话，preset 的会话状态不再在每个子节点重头开始（#28、#29）。插件的构建脚本在 Windows 上也能跑了（#24、#26）。桌面版本次只同步版本号。',
      en: 'Inside the DeepSeek Harness plugin, an agent child node now continues its parent\'s session, and a second branch off the same parent forks its own session at that parent\'s turn, so a preset\'s session state no longer restarts at every child (#28, #29). The plugin\'s build script runs on Windows too (#24, #26). The desktop app only moves its version number.',
    },
    items: [],
  },
  {
    version: '0.4.11',
    date: '2026-09-08',
    announce: false,
    lead: {
      zh: '性能优化：启动更快，后台更省，多个工具调用并行时更稳；300 节点以上的画布实测流畅。ThoughtDAG 现在可以用 Claude Code、Codex、Pi 作为节点的 Agent 运行时，处于测试阶段。',
      en: 'Performance: faster launch, lighter in the background, steadier when several tool calls run in parallel; canvases past 300 nodes measured smooth. ThoughtDAG can now run a node through Claude Code, Codex or Pi as its agent runtime, in testing.',
    },
    items: [],
  },
  {
    version: '0.4.10',
    date: '2026-09-07',
    announce: false,
    lead: {
      zh: 'Agent 执行预览继续：Codex 加入，和 Pi 一样在画布里带工具作答；这条通道现在在桌面版、本地网页版和 DeepSeek Harness 插件里都可用；插件里的 Harness Agent 按模型平铺；插件有新版本时画布会提示。',
      en: 'Agent runs, preview continued: Codex joins Pi, answering with tools right from the canvas; the lane now works in the desktop app, the local web app and the DeepSeek Harness plugin alike; inside the plugin the Harness agent lists one entry per model; the canvas tells you when a newer plugin is out.',
    },
    items: [],
  },
  {
    version: '0.4.9',
    date: '2026-09-07',
    announce: false,
    lead: {
      zh: 'Agent 执行预览：桌面版的模型选择器多了「Agent 执行」组，装了 Pi 的话可以直接在画布里让它带工具作答，轨迹、足迹、审批和提问都落在节点上，工作目录在顶栏可见可改。正式版会连同 Claude Code 与 Codex 一起发布。DeepSeek Harness 插件里的审批卡片同步更新。',
      en: 'Agent runs, preview: the desktop picker gains an "Agent runs" group; with Pi installed, a question runs through it with tools right from the canvas, and the trace, footprints, approvals and questions land on the node, with the working directory visible on the toolbar. The full release will arrive together with Claude Code and Codex. The approval card inside the DeepSeek Harness plugin is updated alike.',
    },
    items: [],
  },
  {
    version: '0.4.8',
    date: '2026-09-07',
    announce: false,
    lead: {
      zh: 'DeepSeek Harness 插件在 Windows 上能打开了：静态资源和会话目录的路径守卫此前只认正斜杠，Windows 用户看到的是一片 403。感谢 GitHub 上的报告（#23）。桌面版本次只同步版本号。',
      en: 'The DeepSeek Harness plugin now opens on Windows: the path guards for static assets and session directories only accepted forward slashes, so Windows users saw nothing but 403s. Thanks to the report on GitHub (#23). The desktop app only moves its version number this time.',
    },
    items: [],
  },
  {
    version: '0.4.7',
    date: '2026-09-07',
    announce: false,
    lead: {
      zh: 'DeepSeek Harness 插件里，Agent 需要你批准的操作现在直接出现在节点上：工具、命令、理由，允许一次或拒绝，决定留在节点记录里。桌面版本次只同步版本号。',
      en: 'Inside the DeepSeek Harness plugin, an action the agent needs approved now appears on the node itself: tool, command, reason, allow once or reject, and the decision stays in the node\'s record. The desktop app only moves its version number this time.',
    },
    items: [],
  },
  {
    version: '0.4.6',
    date: '2026-09-06',
    announce: true,
    lead: {
      zh: '🎉 Pi 的会话进了对话地图，「⋯」菜单里多了更新历史，随时能回看每一版改了什么。',
      en: '🎉 Pi sessions join the Session Atlas, and the ⋯ menu gains a release history, so what every version changed is one click away.',
    },
    items: [
      {
        title: { zh: 'Pi 的会话也在地图上了', en: 'Pi sessions are on the map' },
        body: {
          zh: '本地 Pi 会话按项目聚在一起，打开就是一张图。Pi 里的每次分叉在图上就是一条支线，不再压成一条直线。命令行 why 和 MCP 也同步认识 Pi 留下的文件足迹。',
          en: 'Local Pi sessions group by project and open as a graph. Every fork you made in Pi shows up as a branch instead of being flattened into one line. The why command and MCP index Pi\'s file footprints too.',
        },
        link: { label: { zh: '怎么用', en: 'How it works' }, href: `${DOCS}/zh/guides/session-atlas` },
      },
      {
        title: { zh: '更新历史，随时补看', en: 'Release history, whenever you like' },
        body: {
          zh: '右上「⋯」菜单，「如何使用」下面。每个版本改了什么都在这里，从新到旧，当前版本有标记。',
          en: 'In the ⋯ menu, under How it works: what each release changed, newest first, with the version you are running marked.',
        },
      },
    ],
  },
  {
    version: '0.4.5',
    date: '2026-09-06',
    announce: true,
    lead: {
      zh: '🎉 这是 ThoughtDAG 到目前为止最大的一次升级：散在各个 Agent 里的对话接成了一张地图，能从画布里查，还能直接在 DeepSeek Harness 里用。四件新东西，都值得试一试。',
      en: '🎉 The biggest ThoughtDAG release so far: the conversations scattered across your agents become one map, you can query them, and it all runs inside DeepSeek Harness. Four new things, each worth a try.',
    },
    items: [
      {
        title: { zh: '跨 Agent 的对话地图，终于连成一张', en: 'Session Atlas: all your agents, one map' },
        body: {
          zh: 'Claude Code、Codex 和 DeepSeek Harness 的本地会话按项目文件夹聚在一起，点开就是一张图，随对话实时生长。',
          en: 'Local Claude Code, Codex and DeepSeek Harness sessions, grouped by project; open one as a graph and it follows the conversation live.',
        },
        link: { label: { zh: '怎么用', en: 'How it works' }, href: `${DOCS}/zh/guides/session-atlas` },
      },
      {
        title: { zh: '命令行 why：一条命令找回塑造文件的那些对话', en: 'thoughtdag why: one command finds the conversations that shaped a file' },
        body: {
          zh: 'npx thoughtdag why <文件> 列出哪些轮次读过、改过它，当时问了什么、改了什么；find 按原话搜，MCP 让 Agent 自己来查。',
          en: 'npx thoughtdag why <file> lists the turns that read or changed it, what was asked and what changed; find searches verbatim; MCP lets your agent ask.',
        },
        link: { label: { zh: '命令与 MCP', en: 'CLI and MCP' }, href: `${DOCS}/zh/guides/why-layer` },
      },
      {
        title: { zh: 'DeepSeek Harness 插件上线', en: 'DeepSeek Harness plugin is live' },
        body: {
          zh: 'dsh plugin --profile web add dsh-thoughtdag，Harness 的网页里多一个"思维图"视图：在画布上提问、让 Harness 的 Agent 带工具作答，why 也成了它的原生工具。',
          en: 'dsh plugin --profile web add dsh-thoughtdag adds a canvas view to the Harness web UI: ask from the canvas, let its agent answer with tools, and why becomes a native tool there.',
        },
        link: { label: { zh: '插件说明', en: 'Plugin README' }, href: 'https://github.com/chenxiachan/thoughtdag/tree/main/dsh#readme' },
      },
      {
        title: { zh: '文档站上线', en: 'The docs site is live' },
        body: {
          zh: '概念、任务指南、命令字典和隐私说明各有一页，中英文对照。感谢一路同行，欢迎来 Discussions 说说你怎么用它。',
          en: 'Concepts, task guides, the command dictionary and the privacy notes, each on its own page, in both languages. Thank you for coming this far with us; tell us how you use it in Discussions.',
        },
        link: { label: { zh: '打开文档', en: 'Open the docs' }, href: `${DOCS}/zh/` },
      },
    ],
  },
  {
    version: '0.4.4',
    date: '2026-09-04',
    announce: false,
    lead: {
      zh: 'DeepSeek Harness 成为对话地图的内置来源：它的 zstd 日志由桌面壳逐帧解码，每条消息一个节点，工具调用与结果配对成附件。',
      en: 'DeepSeek Harness becomes a built-in Atlas source: the shell decodes its zstd logs frame by frame, one node per message, tool calls paired with their results as attachments.',
    },
    items: [],
  },
  {
    version: '0.4.3',
    date: '2026-09-03',
    announce: false,
    lead: {
      zh: '深链接可以直达某一轮，画布可以按稳定 id 打开；子 Agent 的会话文件不再打扰实时监听。',
      en: 'A deep link can land on a turn and a canvas opens by its stable id; subagent session files no longer disturb the live watcher.',
    },
    items: [],
  },
  {
    version: '0.4.2',
    date: '2026-09-02',
    announce: false,
    lead: {
      zh: '镜像节点列出那一轮碰过的文件（✏️ 改过、📖 读过），预览用结论而不是开头；子 Agent 的会话作为子线程识别，报告折回发起它的那一轮。',
      en: 'A mirrored node lists the files its turn touched (✏️ edited, 📖 read) and previews the conclusion rather than the opening line; subagent files are recognized as sub-threads and their reports fold into the launching turn.',
    },
    items: [],
  },
  {
    version: '0.4.1',
    date: '2026-09-01',
    announce: false,
    lead: {
      zh: 'Agent 对话地图首发：本地 Claude Code 与 Codex 的会话按项目文件夹聚成一张图，一键接入，随对话实时生长。',
      en: 'Session Atlas debuts: local Claude Code and Codex sessions group by project folder into one map, connect in one click, and grow with the conversation.',
    },
    items: [],
  },
];

/** Numeric compare of dotted versions: negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * What to show a person who last saw `after` (null: never saw any notes) and
 * now runs `upTo`: every announced entry in between, newest first. Skipped
 * releases are included, so an update that arrives two versions late still
 * tells the whole story.
 */
export function announcedSince(after: string | null, upTo: string): WhatsNewEntry[] {
  return WHATS_NEW.filter((e) => e.announce
    && compareVersions(e.version, upTo) <= 0
    && (after === null || compareVersions(e.version, after) > 0));
}
