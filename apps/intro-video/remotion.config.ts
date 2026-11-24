import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Config } from "@remotion/cli/config";

// 放在 ~/Documents 里的 chrome-headless-shell 在这台 Mac 上打不开页面（根组件一直加载不出来），
// 所以用放在 ~/.cache/remotion 里的同版本浏览器；没有就用 Remotion 自己下载的那份。
const dir = path.join(os.homedir(), ".cache/remotion/chrome-headless-shell");
const found = fs.existsSync(dir)
  ? fs.readdirSync(dir).map((v) => path.join(dir, v, "mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell")).find((p) => fs.existsSync(p))
  : undefined;
if (found) Config.setBrowserExecutable(found);
