// 访客能不能读这篇手记（规则同 note.service 的 publicNoteCondition），用在已经读出来的文档上：文档要带上 password（它默认不读）。
// 单独一个文件、不引别的模块，AI 摘要等模块引用时不会绕出循环依赖。
export function isNoteVisibleToVisitors(
  note: { isPublished?: boolean; password?: string | null; publicAt?: Date | null },
  now = new Date(),
) {
  return note.isPublished !== false && !note.password && !(note.publicAt && note.publicAt > now)
}
