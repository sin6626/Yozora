import { Fragment, type ReactNode } from "react";

// 一整句话里的 {名字} 换成元素（链接、加粗的名字……），其余文字原样。服务端、客户端组件都能用。
// 句子不拆成前后两截：拆开交给 AI 翻译时，它只看得到半句话（英文“Commenting as {name}”后半截是空的）。
// text：给句子里的普通文字套一层（比如最近发生的事里文字用 <small> 淡色）；套了的文字去掉首尾空白，词间距交给布局。
export function rich(template: string, slots: Record<string, ReactNode>, text?: (part: string) => ReactNode): ReactNode[] {
  return template.split(/(\{[A-Za-z][A-Za-z0-9]*\})/).flatMap<ReactNode>((part, index) => {
    const name = /^\{([A-Za-z][A-Za-z0-9]*)\}$/.exec(part)?.[1];
    if (name && name in slots) return [<Fragment key={index}>{slots[name]}</Fragment>];
    if (!text) return part ? [part] : [];
    const trimmed = part.trim();
    return trimmed ? [<Fragment key={index}>{text(trimmed)}</Fragment>] : [];
  });
}
