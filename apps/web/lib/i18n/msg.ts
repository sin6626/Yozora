// 界面文字的“中文原文 + 占位符”写法（2026-11-05 起，见 docs/site-text-translation-plan.md）：
// 带参数的条目写成 msg<[name: string]>("已切换到{name}")，组件照旧 t.locale.switched(name) 调用；
// 中文原文推给 Core，由 AI 翻成后台“i18n 语言”里的每种语言，前台按当前语言换上译文（localize）。
// 这个文件不依赖 React/Next，服务端、客户端、脚本都能用。

export type Msg<A extends unknown[] = []> = ((...args: A) => string) & { readonly template: string; readonly params: readonly string[] };

const placeholder = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

// 占位符按在中文原文里第一次出现的顺序对应调用时的参数；译文里顺序可以变，按名字换
export function placeholders(template: string) {
  return [...new Set([...template.matchAll(placeholder)].map((match) => match[1]))];
}

function build<A extends unknown[]>(template: string, params: readonly string[]): Msg<A> {
  const format = (...args: A) => template.replace(placeholder, (whole, name: string) => {
    const index = params.indexOf(name);
    return index < 0 || args[index] === undefined ? whole : String(args[index]);
  });
  return Object.assign(format, { template, params });
}

export function msg<A extends unknown[] = []>(template: string): Msg<A> {
  return build<A>(template, placeholders(template));
}

const isMsg = (value: unknown): value is Msg<unknown[]> => typeof value === "function" && typeof (value as Msg).template === "string";
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

// 词典拍平成“条目名 → 中文原文”：条目名是对象路径用点连起来（locale.switched）
export function flatten(dictionary: unknown, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  if (!isObject(dictionary)) return result;
  for (const [key, value] of Object.entries(dictionary)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result[path] = value;
    else if (isMsg(value)) result[path] = value.template;
    else if (isObject(value)) Object.assign(result, flatten(value, path));
  }
  return result;
}

// 译文能不能用（Core 保存前做同样的检查，前台再核对一遍）：占位符一个不多一个不少，** 的个数一样，原文不空时译文也不能空
export function usable(source: string, translated: unknown): translated is string {
  if (typeof translated !== "string" || (source.trim() && !translated.trim())) return false;
  const a = placeholders(source).sort().join();
  const b = placeholders(translated).sort().join();
  const stars = (text: string) => text.split("**").length;
  return a === b && stars(source) === stars(translated);
}

// 按译文还原出同样结构的词典：缺的、不合格的条目用中文；带参数的条目保留中文原文里的参数顺序
export function localize<T>(dictionary: T, translations: Record<string, string> | null | undefined, prefix = ""): T {
  if (!translations || !Object.keys(translations).length || !isObject(dictionary)) return dictionary;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dictionary)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const translated = translations[path];
    if (typeof value === "string") result[key] = usable(value, translated) ? translated : value;
    else if (isMsg(value)) result[key] = usable(value.template, translated) ? build(translated, value.params) : value;
    else if (isObject(value)) result[key] = localize(value, translations, path);
    else result[key] = value;
  }
  return result as T;
}
