declare module '@joplin/turndown-plugin-gfm' {
  import type TurndownService from 'turndown';
  export function gfm(td: TurndownService): void;
  export function tables(td: TurndownService): void;
  export function strikethrough(td: TurndownService): void;
  export function taskListItems(td: TurndownService): void;
}
