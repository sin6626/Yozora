"use client";

import { Popover } from "@base-ui/react/popover";
import { Smile } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useT } from "./locale-provider";
import "./emoji-picker.css";

// 常用的系统 Unicode 表情，按组排（不引入表情库：全量表情库几百 KB，评论里用得到的就这些）。
// 用空格分开写，因为 ❤️、✌️ 这类带变体选择符的不能按字符拆。
const groups = {
  smileys: "😀 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 😘 😋 😜 🤔 🤗 🤭 😏 😌 😴 🥱 😮 😳 🥺 😭 😤 😱 🙃 🫠 🤯",
  gestures: "👍 👎 👏 🙌 👋 🙏 💪 🤝 ✌️ 🤞 👌 🫡 🤙 👀 🫶 ✍️",
  hearts: "❤️ 🧡 💛 💚 💙 💜 🤍 🖤 💖 💕 💔 ✨",
  night: "🌙 🌛 🌕 🌑 ⭐ 🌟 💫 🌠 🌌 🔭 🪐 ☄️ 🌃 🦉 😪 💤",
  nature: "🌸 🌻 🍀 🍁 🌧️ ⛄ 🌈 🔥 🐱 🐶 🐰 🦊 🐧 🐟 🌊 🌱",
  food: "☕ 🍵 🧋 🍰 🍩 🍪 🍜 🍙 🍉 🍓 🍺 🍻",
  things: "💻 ⌨️ 🖥️ 📱 🎧 🎮 📚 📝 💡 🐛 🚀 🎉 🎁 ✅ ❌ ❓",
} as const;
const list = Object.entries(groups).map(([name, emojis]) => [name as keyof typeof groups, emojis.split(" ")] as const);

// 评论输入框旁的表情按钮：点开面板，选一个插到输入框光标处（替换选中的文字），面板收起、光标回到输入框表情后面。
// 键盘：打开时焦点在第一个表情上，方向键在表情间移动（上下按实际排布找最近的一个），Home/End 到头尾，回车/空格选中，Esc 收起回到按钮。
export default function EmojiPicker({ target }: { target: RefObject<HTMLTextAreaElement | null> }) {
  const t = useT().commentForm;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const picked = useRef(false);
  const uid = useId();

  function pick(emoji: string) {
    const textarea = target.current;
    if (!textarea) return;
    textarea.setRangeText(emoji, textarea.selectionStart, textarea.selectionEnd, "end");
    picked.current = true;
    setOpen(false);
  }

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const cells = [...(panel.current?.querySelectorAll<HTMLButtonElement>(".emoji-cell") ?? [])];
    const index = cells.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    let next = index;
    if (event.key === "ArrowLeft") next = index - 1;
    else if (event.key === "ArrowRight") next = index + 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = cells.length - 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      // 各组个数不一定凑满一行，按屏幕位置找上/下一行里横向最近的那个
      const down = event.key === "ArrowDown";
      const here = cells[index].getBoundingClientRect();
      const rows = cells.map((cell) => cell.getBoundingClientRect());
      const tops = rows.map((rect) => rect.top).filter((top) => (down ? top > here.top + 1 : top < here.top - 1));
      if (!tops.length) return event.preventDefault();
      const row = down ? Math.min(...tops) : Math.max(...tops);
      next = rows.reduce((best, rect, i) => (rect.top === row && (best < 0 || Math.abs(rect.left - here.left) < Math.abs(rows[best].left - here.left)) ? i : best), -1);
    } else return;
    event.preventDefault();
    const cell = cells[Math.max(0, Math.min(cells.length - 1, next))];
    cell.focus();
    setActive(cells.indexOf(cell));
  }

  let count = 0;
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          picked.current = false;
          setActive(0);
        }
      }}
    >
      <Popover.Trigger className="emoji-trigger" type="button" aria-label={t.emoji} title={t.emoji}>
        <Smile size={18} strokeWidth={1.75} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="emoji-positioner" side="top" align="start" sideOffset={8} collisionPadding={12}>
          <Popover.Popup
            className="emoji-popup"
            ref={panel}
            aria-label={t.emoji}
            initialFocus={(type) => (type === "touch" ? true : panel.current?.querySelector<HTMLElement>(".emoji-cell") ?? true)}
            finalFocus={() => (picked.current ? target.current : true)}
            onKeyDown={move}
          >
            {list.map(([name, emojis]) => (
              <div key={name} role="group" aria-labelledby={`${uid}-${name}`}>
                <p className="emoji-group-label" id={`${uid}-${name}`}>{t.emojiGroups[name]}</p>
                <div className="emoji-grid">
                  {emojis.map((emoji) => {
                    const index = count++;
                    return (
                      <button key={emoji} type="button" className="emoji-cell" tabIndex={index === active ? 0 : -1} onClick={() => pick(emoji)}>
                        {emoji}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
