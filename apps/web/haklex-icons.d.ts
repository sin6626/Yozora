// @haklex/rich-renderer-codeblock 0.0.85 的 package.json 把 ./icons 的类型指到不存在的 dist/icons.d.ts（真实类型在 dist/icons/index.d.ts），
// 这里按那份类型补上用到的部分。升级 Haklex 后包里修好了就删掉这个文件。
declare module "@haklex/rich-renderer-codeblock/icons" {
  import type { FC } from "react";
  export const LanguageIcon: FC<{ language: string; size?: number; className?: string }>;
}
