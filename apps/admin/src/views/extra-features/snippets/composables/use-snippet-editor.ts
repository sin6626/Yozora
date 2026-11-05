import { omit } from 'es-toolkit/compat'
import { dump, load } from 'js-yaml'
import JSON5 from 'json5'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { Ref } from 'vue'

import { snippetsApi } from '~/api'
import { BusinessError } from '~/utils/request'

import {
  defaultServerlessFunction,
  SnippetModel,
  SnippetType,
} from '../../../../models/snippet'

export function useSnippetEditor(selectedId: Ref<string | null>) {
  const editData = ref<SnippetModel>(new SnippetModel())

  const typeToValueMap = reactive<Record<SnippetType, string>>({
    [SnippetType.JSON]: JSON.stringify({ name: 'hello world' }, null, 2),
    [SnippetType.JSON5]: JSON5.stringify({ name: 'hello world' }, null, 2),
    [SnippetType.YAML]: 'name: hello world',
    [SnippetType.Function]: defaultServerlessFunction,
    [SnippetType.Text]: '',
  })

  let jsonFormatBeforeType: SnippetType = SnippetType.JSON
  // 打开时 Core 里存的原文（JSON 在编辑器里会被重新排版，所以单独记）。保存时作为 baseRaw 交给 Core：
  // 这期间片段被别处（比如“Yozora 主题”页）改过，Core 就拒绝，不会拿旧内容盖掉新修改。
  let baseRaw: string | undefined

  const isNew = computed(() => !selectedId.value)
  const isFunctionType = computed(
    () => editData.value.type === SnippetType.Function,
  )
  const isBuiltFunction = computed(
    () =>
      editData.value.type === SnippetType.Function &&
      editData.value.builtIn &&
      !!selectedId.value,
  )

  watch(
    () => editData.value.type,
    (type, beforeType) => {
      if (type === 'function' || type === 'text') {
        editData.value.raw = typeToValueMap[type]

        if (type !== 'text') {
          editData.value.method ??= 'GET'
          editData.value.enable ??= true
        }
        return
      }

      if (beforeType !== 'function' && beforeType !== 'text') {
        jsonFormatBeforeType = beforeType
      }

      const object = (() => {
        switch (jsonFormatBeforeType) {
          case 'json':
            return JSON.parse(typeToValueMap.json)
          case 'yaml':
            return load(typeToValueMap.yaml)
          case 'json5':
            return JSON5.parse(typeToValueMap.json5)
          case 'function':
            delete editData.value.method
            delete editData.value.enable
            return ''
        }
      })()

      const current = (() => {
        switch (type) {
          case 'json':
            return JSON.stringify(object, null, 2)
          case 'yaml':
            return dump(object)
          case 'json5':
            return JSON5.stringify(object, null, 2)
        }
      })()

      editData.value.raw = current || ''
      typeToValueMap[type] = current || ''
    },
  )

  const fetchSnippet = async (id: string) => {
    const data = await snippetsApi.getById(id)
    baseRaw = data.raw

    if (data.type === SnippetType.JSON) {
      data.raw = JSON.stringify(JSON5.parse(data.raw), null, 2)
    }

    editData.value = data
    jsonFormatBeforeType = data.type
    typeToValueMap[data.type] = data.raw
  }

  const reset = (reference?: string) => {
    baseRaw = undefined
    editData.value = new SnippetModel()
    if (reference) {
      editData.value.reference = reference
    }

    typeToValueMap[SnippetType.JSON] = JSON.stringify(
      { name: 'hello world' },
      null,
      2,
    )
    typeToValueMap[SnippetType.JSON5] = JSON5.stringify(
      { name: 'hello world' },
      null,
      2,
    )
    typeToValueMap[SnippetType.YAML] = 'name: hello world'
    typeToValueMap[SnippetType.Function] = defaultServerlessFunction
    typeToValueMap[SnippetType.Text] = ''

    jsonFormatBeforeType = SnippetType.JSON
  }

  const save = async (): Promise<SnippetModel | null> => {
    const tinyJson = (text: string) => {
      try {
        return JSON.stringify(JSON.parse(text), null, 0)
      } catch {
        toast.error('JSON 格式错误')
        return null
      }
    }

    const handleRawText = () => {
      const currentTypeText = typeToValueMap[editData.value.type]
      switch (editData.value.type) {
        case SnippetType.JSON:
          return tinyJson(currentTypeText)
        case SnippetType.YAML:
          try {
            load(currentTypeText)
          } catch {
            toast.error('YAML 格式错误')
            return null
          }
          return currentTypeText
        case SnippetType.Function:
          return currentTypeText
        default:
          return currentTypeText
      }
    }

    const rawText = handleRawText()
    if (rawText === null) return null

    const omitData = omit(editData.value, ['_id', 'id', 'created', 'data'])
    const finalData = { ...omitData, raw: rawText }

    if (!finalData.metatype) {
      delete finalData.metatype
    }

    try {
      let result: SnippetModel
      if (selectedId.value) {
        result = await snippetsApi.update(selectedId.value, { ...finalData, baseRaw })
        baseRaw = result.raw
        toast.success('更新成功')
      } else {
        result = await snippetsApi.create(finalData as any)
        toast.success('创建成功')
      }
      return result
    } catch (error) {
      if (error instanceof BusinessError && error.statusCode === 409) {
        toast.error('这个片段在你打开之后已在别处被修改（比如“Yozora 主题”页），这次没有保存。编辑器里的内容还在：先复制出来，重新打开这个片段，再把要改的地方改上去。', { duration: 10000 })
        return null
      }
      toast.error('保存失败')
      return null
    }
  }

  const updateEditorValue = (value: string) => {
    typeToValueMap[editData.value.type] = value
  }

  const editorValue = computed(() => typeToValueMap[editData.value.type])

  return {
    editData,
    typeToValueMap,
    isNew,
    isFunctionType,
    isBuiltFunction,
    editorValue,
    fetchSnippet,
    reset,
    save,
    updateEditorValue,
  }
}
