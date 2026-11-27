function hasNodeContent(node: unknown): boolean {
  if (typeof node !== 'object' || node === null || !('type' in node)) {
    return true
  }
  switch (node.type) {
    case 'root':
    case 'paragraph':
      return !('children' in node) || !Array.isArray(node.children)
        ? true
        : node.children.some(hasNodeContent)
    case 'text':
      return !('text' in node) || typeof node.text !== 'string'
        ? true
        : node.text.trim().length > 0
    case 'linebreak':
    case 'tab':
      return false
    default:
      return true
  }
}

// Plate (Suzuri envelope): empty paragraphs are not content; any other element (image, table, …) or text is.
function hasPlateNodeContent(node: unknown): boolean {
  if (typeof node !== 'object' || node === null) return false
  if ('text' in node) return typeof node.text === 'string' && node.text.trim().length > 0
  if (!('children' in node) || !Array.isArray(node.children)) return true
  if ('type' in node && node.type !== 'paragraph') return true
  return node.children.some(hasPlateNodeContent)
}

export function hasRichContent(content: unknown): boolean {
  if (content === undefined || content === null || content === '') return false
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content)
    } catch {
      return true
    }
  }
  if (typeof content !== 'object' || content === null) return true
  if ('root' in content) return hasNodeContent(content.root)
  if ('document' in content && isRecord(content.document) && Array.isArray(content.document.children)) {
    return content.document.children.some(hasPlateNodeContent)
  }
  return true
}

const elementTypes = new Set([
  'root', 'paragraph', 'heading', 'quote', 'list', 'listitem',
  'table', 'tablerow', 'tablecell', 'details',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function richContentForComparison(content?: string): string | undefined {
  if (!content) return content
  try {
    const value: unknown = JSON.parse(content)
    const nodes = new WeakSet<object>()
    const withText = new WeakSet<object>()
    function visitDocument(document: unknown) {
      if (isRecord(document) && isRecord(document.root)
        && document.root.type === 'root' && Array.isArray(document.root.children)) visitNode(document.root)
    }
    function visitNode(node: Record<string, unknown>): boolean {
      nodes.add(node)
      let hasText = node.type === 'text' || node.type === 'tab'
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          if (isRecord(child) && visitNode(child)) hasText = true
        }
      }
      if (hasText) withText.add(node)
      visitDocument(node.content)
      if (Array.isArray(node.cells)) node.cells.forEach(visitDocument)
      return hasText
    }
    visitDocument(value)
    return JSON.stringify(value, (_key, item: unknown) => {
      if (!isRecord(item)) return item
      const element = nodes.has(item) && typeof item.type === 'string'
        && elementTypes.has(item.type) && Array.isArray(item.children)
      return Object.fromEntries(Object.keys(item).sort().filter((key) => {
        if (nodes.has(item) && (item.type === 'link' || item.type === 'autolink')
          && key === 'title' && item[key] === null) return false
        if (!element || (key !== 'textFormat' && key !== 'textStyle')) return true
        // Without text descendants, these values preserve the next typed character's style.
        return !withText.has(item) && item[key] !== (key === 'textFormat' ? 0 : '')
      }).map((key) => [key, item[key]]))
    })
  } catch {
    return content
  }
}
