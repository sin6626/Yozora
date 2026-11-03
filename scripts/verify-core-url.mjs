import assert from "node:assert/strict";
import { coreUrl } from "./lib/core-url.mjs";

assert.equal(coreUrl("http://127.0.0.1:2333", "/snippets/group/ps"), "http://127.0.0.1:2333/snippets/group/ps");
assert.equal(coreUrl("https://api.sin6626.me/api/v2", "/snippets/group/ps"), "https://api.sin6626.me/api/v2/snippets/group/ps");
assert.equal(coreUrl("https://api.sin6626.me/api/v2/", "/drafts?page=1"), "https://api.sin6626.me/api/v2/drafts?page=1");
assert.equal(coreUrl("https://api.sin6626.me/api/v2", "fn/ps/update"), "https://api.sin6626.me/api/v2/fn/ps/update");
console.log("verify-core-url: ok");
