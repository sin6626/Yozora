// 手记编辑器（以及草稿历史对比）的正文用思源宋体。
// Haklex 手记主题的字体栈以 "Noto Serif CJK SC" 开头，但只写了字体名、不加载字体文件：电脑没装思源宋体时会落到系统宋体
// （macOS 是 Songti SC），它自带的英文数字比汉字小、还悬在基线上方，中英混排看着不在一条线上。
// 这里加载按字符切片的思源宋体（浏览器只下载用到的字，与博客前台手记同款），并把它排到手记字体栈最前面。
// 加粗用黑体（手记主题自带的无衬线字体栈，苹方开头），字重沿用主题的 600：中文排版里宋体正文的强调本来就用黑体，
// 宋体自己加粗笔画还是细，和正文分不太出来（Innei 的博客、原版 Shiro 的手记也是这样做的）。
// 以前看着还行，是因为落到系统宋体时 600 会直接用它很重的粗体；换成可变字重的思源宋体后 600 就真是 600。
// 选择器直接用 Haklex 导出的 noteVariant、editorTheme 拼出来（多个类名连写，优先级高于主题自身的写法），升级后类名变了也会跟着变。
import '@fontsource-variable/noto-serif-sc'

import { editorTheme, noteVariant } from '@haklex/rich-editor'

const SERIF_STACK = `'Noto Serif SC Variable', "Noto Serif CJK SC", "Source Han Serif SC", "Source Han Serif", "source-han-serif-sc", "Songti SC", STSong, "华文宋体", serif`
const classes = (names: string) =>
  names
    .split(/\s+/)
    .filter(Boolean)
    .map((name) => `.${name}`)
    .join('')
const selector = classes(noteVariant)

const style = document.createElement('style')
style.dataset.noteSerifFont = ''
style.textContent = `${selector}{--rc-font-family:${SERIF_STACK};--rc-font-family-serif:${SERIF_STACK}}${selector} ${classes(editorTheme.text!.bold!)}{font-family:var(--rc-font-family-sans)}`
document.head.append(style)
