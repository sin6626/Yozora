import { defineComponent } from 'vue'
import type { DraftModel } from '~/models/draft'
import type { PropType } from 'vue'

import { plateMarkdown } from '~/utils/plate-text'

import { DraftDetailBase } from './draft-detail-base'
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
    const isLexical = () => props.draft.contentFormat === 'lexical'
    // Plate 的历史版本只存 content，对比两版派生的 Markdown
    const isPlate = () => props.draft.contentFormat === 'plate'

    return () => (
      <DraftDetailBase
        draft={props.draft}
        isMobile={props.isMobile}
        onBack={props.onBack}
        onDelete={props.onDelete}
        diffContent={(slotProps) =>
          isLexical() &&
          slotProps.selectedRichContent &&
          slotProps.currentRichContent ? (
            <RichDiffPanel
              oldContent={slotProps.selectedRichContent}
              newContent={slotProps.currentRichContent}
            />
          ) : (
            <MarkdownDiffPanel
              oldText={
                isPlate()
                  ? plateMarkdown(slotProps.selectedRichContent ?? '') ||
                    slotProps.selectedText
                  : slotProps.selectedText
              }
              newText={
                isPlate()
                  ? plateMarkdown(slotProps.currentRichContent ?? '') ||
                    slotProps.currentText
                  : slotProps.currentText
              }
              oldVersion={slotProps.selectedVersion}
              newVersion={slotProps.currentVersion}
            />
          )
        }
      />
    )
  },
})
