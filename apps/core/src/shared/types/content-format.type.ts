export enum ContentFormat {
  Markdown = 'markdown',
  Lexical = 'lexical',
  Plate = 'plate',
}

export const CONTENT_FORMATS = [
  ContentFormat.Markdown,
  ContentFormat.Lexical,
  ContentFormat.Plate,
] as const

/** Formats whose source of truth is the JSON `content`; `text` is derived from it. */
export function isRichContentFormat(format: unknown): boolean {
  return format === ContentFormat.Lexical || format === ContentFormat.Plate
}
