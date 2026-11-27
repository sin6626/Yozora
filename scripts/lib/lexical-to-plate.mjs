import { TEXT_TYPE_TO_FORMAT } from 'lexical'
import { createEnvelope, validateDocument } from '../../apps/core/node_modules/@suzuri/editor/dist/schema/index.js'

// Only these source fields are consumed or deliberately accounted for below.
const fields = {
  root: 'children', paragraph: 'children', heading: 'children tag', quote: 'children',
  text: 'text', 'code-highlight': 'text highlightType', linebreak: '',
  list: 'children listType start tag', listitem: 'children value checked',
  horizontalrule: '', link: 'children url target rel title', autolink: 'children url target rel title isUnlinked',
  code: 'children language', 'code-block': 'code language',
  table: 'children colWidths', tablerow: 'children height', tablecell: 'children headerState colSpan rowSpan backgroundColor',
  image: 'src altText caption thumbhash width height align', 'live-photo': 'src videoSrc altText caption thumbhash width height align',
  'alert-quote': 'alertType content', banner: 'bannerType content',
  'katex-inline': 'equation', 'katex-block': 'equation',
  tab: 'panels tabs text', 'link-card': 'url title description id source favicon image',
}
const metadata = new Set(['type', 'version', 'direction', 'format', 'indent', 'style', 'textStyle', 'textFormat', 'mode', 'detail', '$'])
const marks = ['bold', 'italic', 'strikethrough', 'underline', 'code', 'highlight']
const supportedMask = marks.reduce((mask, mark) => mask | TEXT_TYPE_TO_FORMAT[mark], 0)
const listTypes = { bullet: 'bulleted', number: 'numbered', check: 'task' }
const icons = { note: 'ℹ️', tip: '💡', important: '❗', warning: '⚠️', caution: '🛑', info: 'ℹ️', success: '✅', error: '🛑' }
const leaf = (text = '') => ({ text })
const element = (type, children, props) => ({ type, ...props, children: children.length ? children : [leaf()] })
const inline = (n) => Object.hasOwn(n, 'text') || n.type === 'link' || n.type === 'inlineEquation'
const optional = (props) => Object.fromEntries(Object.entries(props).filter(([, value]) => value != null && value !== ''))

function requireValue(condition, message) {
  if (!condition) throw new Error(message)
}

// Some legacy articles wrap whole sections in a paragraph. Lift each block in
// source order and wrap only the inline runs before and after it.
function wrapRuns(nodes, type = 'paragraph', props) {
  if (!nodes.length) return [element(type, [], props)]
  const blocks = []
  let run = []
  for (const node of nodes) {
    if (inline(node)) run.push(node)
    else {
      if (run.length) blocks.push(element(type, run, props))
      run = []
      blocks.push(node)
    }
  }
  if (run.length) blocks.push(element(type, run, props))
  return blocks
}

export function lexicalToPlate(lexicalJsonString) {
  const report = { status: 'blocked', before: Object.create(null), after: Object.create(null), unsupported: [], warnings: [] }
  const blocked = { envelope: null, report }
  const reject = (node, path, reason) => report.unsupported.push({ type: node?.type ?? '(missing)', path, reason })
  const warn = (path, message) => report.warnings.push(`${path}: ${message}`)

  // Inventory first, even inside blocked subtrees. A drawing's internal scene
  // is opaque; only children and nested Lexical editor states are documents.
  function inspect(node, path) {
    const type = node?.type
    report.before[type ?? '(missing)'] = (report.before[type ?? '(missing)'] ?? 0) + 1
    if (!Object.hasOwn(fields, type)) reject(node, path, 'Unsupported Lexical node')
    else {
      const allowed = fields[type].split(' ')
      for (const [key, value] of Object.entries(node)) {
        if (!metadata.has(key) && !allowed.includes(key) && value != null && value !== '' && value !== false)
          reject(node, path, `Unsupported field: ${key}`)
      }
      const align = typeof node.format === 'string' && node.format
      if (node.style || node.textStyle || node.direction === 'rtl' || (align && !['left', 'start'].includes(align)))
        reject(node, path, 'Unsupported style, alignment or writing direction')
      else if (align) warn(path, `Default ${align} alignment dropped`)
      if (node.indent && !['listitem', 'paragraph', 'heading'].includes(type)) reject(node, path, 'Unsupported indent')
      if (node.version != null && node.version !== 1) reject(node, path, 'Unknown node version')
      if ((node.mode && node.mode !== 'normal') || (node.detail && type !== 'tab'))
        reject(node, path, 'Unsupported text behavior')
      if (node.$) {
        if (Object.keys(node.$).some((key) => key !== 'blockId')) reject(node, path, 'Unknown Lexical node state')
        if (node.$.blockId) warn(path, 'Lexical blockId has no Suzuri property')
      }
      if (['text', 'tab', 'code-highlight'].includes(type) && node.format != null) {
        const mask = node.format
        if (!Number.isSafeInteger(mask) || mask < 0 || mask > 255 || (mask & ~supportedMask)) {
          const names = Object.keys(TEXT_TYPE_TO_FORMAT).filter((mark) => !marks.includes(mark) && (mask & TEXT_TYPE_TO_FORMAT[mark]))
          reject(node, path, `Unsupported text format ${mask} (${names.join(', ')})`)
        }
      }
    }
    if (Array.isArray(node?.children)) node.children.forEach((child, i) => inspect(child, `${path}.children[${i}]`))
    function nested(value, at) {
      if (!value || typeof value !== 'object') return
      if (Object.hasOwn(value, 'root')) inspect(value.root, `${at}.root`)
      else if (Array.isArray(value)) value.forEach((item, i) => nested(item, `${at}[${i}]`))
      else for (const [key, child] of Object.entries(value)) nested(child, `${at}.${key}`)
    }
    for (const key of ['content', 'caption', 'tabs', 'panels', 'cells', 'definitions']) nested(node?.[key], `${path}.${key}`)
  }

  function convert(node, path, depth = 0) {
    const children = () => {
      requireValue(Array.isArray(node.children), `${path}: missing children`)
      return node.children.flatMap((child, i) => convert(child, `${path}.children[${i}]`, depth))
    }
    function document(state, at) {
      if (state?.editorState) return document(state.editorState, `${at}.editorState`)
      requireValue(state?.root?.type === 'root', `${at}: expected nested editor state`)
      return convert(state.root, `${at}.root`)
    }
    function caption(state, at) {
      if (typeof state === 'string') return [leaf(state)]
      const blocks = document(state, at)
      requireValue(blocks.every((block) => block.type === 'paragraph' && Object.keys(block).length === 2), `${at}: only plain paragraph containers fit inline content`)
      if (blocks.length > 1) warn(at, 'Paragraph boundaries represented by blank lines')
      return blocks.flatMap((p, i) => i ? [leaf('\n\n'), ...p.children] : p.children)
    }
    switch (node.type) {
      case 'root': return wrapRuns(children())
      case 'paragraph':
      case 'heading': {
        const props = optional({ indent: node.indent || undefined })
        if (node.type === 'heading') {
          requireValue(/^h[1-6]$/.test(node.tag), `${path}: invalid heading level`)
          props.level = Number(node.tag[1])
        }
        return wrapRuns(children(), node.type, props)
      }
      case 'linebreak': return leaf('\n')
      case 'text':
      case 'code-highlight': {
        requireValue(typeof node.text === 'string', `${path}: missing text`)
        return { text: node.text, ...Object.fromEntries(marks.filter((key) => node.format & TEXT_TYPE_TO_FORMAT[key]).map((key) => [key, true])) }
      }
      case 'quote': return element('blockquote', wrapRuns(children()))
      case 'list': {
        requireValue(Object.hasOwn(listTypes, node.listType) && Array.isArray(node.children) && node.children.length, `${path}: invalid list`)
        const listType = listTypes[node.listType]
        const blocks = []
        let first = true
        let ordinal = node.start ?? 1
        node.children.forEach((item, i) => {
          const at = `${path}.children[${i}]`
          requireValue(item.type === 'listitem' && Array.isArray(item.children), `${at}: expected listitem`)
          let run = []
          let nested = false
          const flush = () => {
            const props = { listType, listId: path, indent: depth + 1 }
            if (listType === 'numbered') {
              if (first && node.start != null && item.value != null && node.start !== item.value)
                throw new Error(`${at}: conflicting list start and first item value`)
              if (first && ordinal !== 1) props.listStart = ordinal
              if (item.value != null && item.value !== ordinal) props.listRestart = item.value
              ordinal = (item.value ?? ordinal) + 1
            }
            if (listType === 'task') props.checked = item.checked ?? false
            blocks.push(element('paragraph', run, props))
            first = false
            run = []
          }
          item.children.forEach((child, j) => {
            const childPath = `${at}.children[${j}]`
            if (child.type === 'list') {
              if (run.length) flush()
              nested = true
              blocks.push(...convert(child, childPath, depth + 1))
            } else {
              requireValue(!nested, `${childPath}: text after a nested list cannot share its parent item`)
              const values = [convert(child, childPath)].flat()
              requireValue(values.every(inline), `${childPath}: list item contains block content`)
              run.push(...values)
            }
          })
          if (run.length || !item.children.length) flush()
        })
        return blocks
      }
      case 'horizontalrule': return element('horizontalRule', [])
      case 'link':
      case 'autolink':
        if (node.isUnlinked) return children()
        requireValue(!node.title && (!node.rel || node.rel === 'noopener' && (!node.target || node.target === '_blank')), `${path}: link title or rel cannot be preserved`)
        if (node.rel) warn(path, `Link rel=${node.rel} has no Suzuri property`)
        return element('link', children(), optional({ url: node.url, target: node.target }))
      case 'code':
      case 'code-block': {
        let code = node.code
        if (node.type === 'code') {
          const lines = children()
          requireValue(lines.every((line) => Object.keys(line).length === 1 && typeof line.text === 'string'), `${path}: code contains rich children`)
          code = lines.map((line) => line.text).join('')
        }
        requireValue(typeof code === 'string', `${path}: missing code`)
        return element('codeBlock', [leaf(code)], optional({ language: node.language }))
      }
      case 'table': return element('table', children(), optional({ columnWidths: node.colWidths }))
      case 'tablerow': return element('tableRow', children(), optional({ height: node.height }))
      case 'tablecell':
        requireValue([undefined, 0, 1, 2, 3].includes(node.headerState), `${path}: invalid headerState`)
        if (node.headerState > 1) warn(path, 'Column/combined header mapped to header=true')
        return element('tableCell', wrapRuns(children()), optional({ header: node.headerState ? true : undefined, colSpan: node.colSpan, rowSpan: node.rowSpan, backgroundColor: node.backgroundColor }))
      case 'image':
      case 'live-photo': {
        const live = node.type === 'live-photo'
        requireValue(typeof node.src === 'string' && node.src && (!live || (typeof node.videoSrc === 'string' && node.videoSrc)), `${path}: missing media URL`)
        return element(live ? 'livePhoto' : 'image', caption(node.caption ?? '', `${path}.caption`), optional({
          url: node.src, videoUrl: live ? node.videoSrc : undefined, alt: node.altText, thumbhash: node.thumbhash,
          width: node.width || undefined, naturalWidth: typeof node.width === 'number' && node.width || undefined,
          naturalHeight: node.height || undefined, align: node.align,
        }))
      }
      case 'banner':
      case 'alert-quote': {
        const variant = node.alertType ?? node.bannerType
        requireValue(Object.hasOwn(icons, variant) && node.content != null, `${path}: invalid callout`)
        return element('callout', caption(node.content, `${path}.content`), { variant, icon: icons[variant] })
      }
      case 'katex-block':
      case 'katex-inline':
        requireValue(typeof node.equation === 'string', `${path}: missing equation`)
        return element(node.type === 'katex-inline' ? 'inlineEquation' : 'equation', [], { latex: node.equation })
      case 'tab': {
        const key = node.panels ? 'panels' : 'tabs'
        if (node.text === '\t' && !node[key]) return convert({ ...node, type: 'text' }, path)
        requireValue(Array.isArray(node[key]) && node[key].length && node.text == null && !(node.panels && node.tabs), `${path}: unrecognized tab representation`)
        warn(path, 'Tab panels converted to heading sections')
        return node[key].flatMap((panel, i) => {
          const at = `${path}.${key}[${i}]`
          requireValue(typeof panel.label === 'string' && panel.label.trim(), `${at}: missing panel label`)
          requireValue(Object.keys(panel).every((k) => ['id', 'label', 'content'].includes(k)), `${at}: unrecognized panel fields`)
          return [element('heading', [leaf(panel.label)], { level: 4 }), ...document(panel.content, `${at}.content`)]
        })
      }
      case 'link-card': {
        requireValue(typeof node.url === 'string' && (node.description == null || typeof node.description === 'string'), `${path}: invalid link-card`)
        warn(path, 'Link card converted to title, URL and description')
        const link = element('link', [leaf(node.title || node.url)], { url: node.url })
        return element('paragraph', node.description ? [link, leaf(' — ' + node.description)] : [link])
      }
      default: throw new Error(`${path}: misplaced ${node.type}`)
    }
  }

  try {
    const state = JSON.parse(lexicalJsonString)
    requireValue(state?.root?.type === 'root', 'Expected Lexical root')
    inspect(state.root, '$.root')
    if (report.unsupported.length) return blocked
    const envelope = createEnvelope(convert(state.root, '$.root'))
    const result = validateDocument(JSON.stringify(envelope), { requireEnvelope: true })
    requireValue(result.ok, result.error)
    function count(node) {
      const type = node.type ?? 'text'
      report.after[type] = (report.after[type] ?? 0) + 1
      node.children?.forEach(count)
    }
    envelope.document.children.forEach(count)
    report.status = 'converted'
    return { envelope, report }
  } catch (error) {
    report.error = error.message
    return blocked
  }
}
