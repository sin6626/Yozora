import { defineComponent } from 'vue'
import type { DraftModel } from '~/models/draft'
import type { PropType } from 'vue'

import { DraftDetailBase } from './draft-detail-base'
import { diffSides } from './draft-versions'
import { MarkdownDiffPanel } from './markdown-diff-panel'
import { RichDiffPanel } from './rich-diff-panel'

export const DraftDetail = defineComponent({
  name: 'DraftDetail',
  props: {
    draft: {
      type: Object as PropType<DraftModel>,
      required: true,
    },
    isMobile: {
      type: Boolean,
      default: false,
    },
    onBack: {
      type: Function as PropType<() => void>,
    },
    onDelete: {
      type: Function as PropType<(id: string) => void>,
      required: true,
    },
  },
  setup(props) {
    // 每个版本按它自己的格式对比：两边都是 Lexical 才用富文本对比，否则各自投影成 Markdown（Plate 历史只存 content）
    return () => (
      <DraftDetailBase
        draft={props.draft}
        isMobile={props.isMobile}
        onBack={props.onBack}
        onDelete={props.onDelete}
        diffContent={(slotProps) => {
          const sides = diffSides(slotProps.selected, slotProps.current)
          return sides.kind === 'rich' ? (
            <RichDiffPanel
              oldContent={sides.oldContent}
              newContent={sides.newContent}
            />
          ) : (
            <MarkdownDiffPanel
              oldText={sides.oldText}
              newText={sides.newText}
              oldVersion={slotProps.selectedVersion}
              newVersion={slotProps.currentVersion}
            />
          )
        }}
      />
    )
  },
})
