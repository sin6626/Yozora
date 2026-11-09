// Integration fixture: real admin editor + web ArticleBody, intercepted uploads, no post/database writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { openBrowser, sleep } from "../headless-browser.mjs";
const admin = process.env.ADMIN_URL ?? "http://127.0.0.1:9528";
const web = process.env.WEB_URL ?? "http://127.0.0.1:2323";
const browser = await openBrowser({
  port: 9479,
  args: ["--renderer-process-limit=2"],
});
const { evaluate, send } = browser;
const fixture = (name) =>
  fileURLToPath(
    new URL("../../apps/web/public/sample-media/" + name, import.meta.url),
  );
const uploads = [];
let rejectVideo = true;
async function wait(js, description) {
  for (let i = 0; i < 160; i++) {
    if (await evaluate(`Boolean(${js})`).catch(() => false)) return;
    await sleep(125);
  }
  throw Error(
    description +
      ": " +
      (await evaluate("document.body.innerText.slice(-900)")) +
      " " +
      JSON.stringify({
        uploads,
        errors: browser.errors.slice(-3),
        url: await evaluate("location.href"),
      }),
  );
}
async function setFile(selector, path) {
  const {
    result: { root },
  } = await send("DOM.getDocument");
  const {
    result: { nodeId },
  } = await send("DOM.querySelector", { nodeId: root.nodeId, selector });
  assert.ok(nodeId, selector);
  await send("DOM.setFileInputFiles", { nodeId, files: [path] });
}
async function click(selector) {
  const { x, y } = await evaluate(
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    x,
    y,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    x,
    y,
  });
}
async function hold(selector) {
  await wait(
    `document.querySelector(${JSON.stringify(selector)})?.complete && document.querySelector(${JSON.stringify(selector)})?.naturalWidth > 0`,
    "cover",
  );
  await wait(
    "document.querySelector('.yz-live-badge:not(:disabled)')",
    "player ready",
  );
  await evaluate(
    `document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`,
  );
  await wait(
    `(()=>{const el=document.querySelector(${JSON.stringify(selector)}),r=el.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height*0.65)===el})()`,
    "cover hit target",
  );
  const { x, y } = await evaluate(
    `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height*0.65}})()`,
  );
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    clickCount: 1,
    x,
    y,
  });
  await wait(
    "Array.from(document.querySelectorAll('video')).some(v=>!v.paused && v.currentTime>0 && getComputedStyle(v).opacity==='1')",
    "hold did not play",
  );
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    clickCount: 1,
    x,
    y,
  });
  await wait(
    "Array.from(document.querySelectorAll('video')).every(v=>v.paused && getComputedStyle(v).opacity==='0')",
    "release did not restore cover",
  );
}
try {
  await browser.setViewport(1360, 900);
  browser.listeners.push(async (message) => {
    if (message.method !== "Fetch.requestPaused") return;
    const { requestId, request } = message.params;
    const u = new URL(request.url);
    if (u.pathname.endsWith("/files/live-photo/normalize/video")) {
      // The standard fixture MP4 is compatible: real normalization is covered by the Core HTTP tests.
      await send("Fetch.fulfillRequest", {requestId, responseCode:204});
      return;
    }
    if (request.method === "POST" && u.pathname.endsWith("/files/upload")) {
      const type = u.searchParams.get("type");
      uploads.push(type);
      const name = type === "image" ? "live-cover.jpg" : "live-clip.mp4";
      const fail = type === "file" && rejectVideo;
      await send("Fetch.fulfillRequest", {
        requestId,
        responseCode: fail ? 422 : 200,
        responseHeaders: [{ name: "content-type", value: "application/json" }],
        body: Buffer.from(
          JSON.stringify(
            fail
              ? { message: "fixture upload failure" }
              : {
                  url:
                    "/sample-media/" +
                    name +
                    (type === "file" && uploads.length > 3
                      ? "?replacement=1"
                      : ""),
                  name,
                },
          ),
        ).toString("base64"),
      });
      return;
    }
    if (u.origin === admin && u.pathname.startsWith("/sample-media/")) {
      const name = u.pathname.split("/").at(-1);
      assert.ok(["live-cover.jpg", "live-clip.mp4"].includes(name));
      await send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [
          {
            name: "content-type",
            value: name.endsWith("mp4") ? "video/mp4" : "image/jpeg",
          },
        ],
        body: (await readFile(fixture(name))).toString("base64"),
      });
      return;
    }
    await send("Fetch.failRequest", {
      requestId,
      errorReason: "BlockedByClient",
    });
  });
  await send("Fetch.enable", {
    patterns: [
      { urlPattern: "*/files/upload*" },
      { urlPattern: "*/files/live-photo/normalize/*" },
      { urlPattern: admin + "/sample-media/*" },
    ],
  });
  await browser.goto(admin + "/test/live-photo.html", 300);
  await wait(
    `document.querySelector('button[aria-label="Live photo"]')`,
    "toolbar",
  );
  await click("[contenteditable=true] p");
  await send("Input.insertText", { text: "Start" });
  await evaluate(
    "document.querySelector('[contenteditable=true] p').dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:45,clientY:140}))",
  );
  await wait(
    "document.querySelector('button[aria-label=\"Add block\"]')",
    "block handle",
  );
  await sleep(180);
  await click('button[aria-label="Add block"]');
  await wait(
    "document.querySelectorAll('[contenteditable=true] p').length === 2",
    "paragraph inserted",
  );
  await send("Input.insertText", { text: "Drag target" });
  await wait(
    "[...document.querySelectorAll('[contenteditable=true] p')].some(p=>p.textContent==='Drag target')",
    "add block kept input focus",
  );
  await click('button[aria-label="Live photo"]');
  await sleep(250);
  await wait("document.querySelector('[role=dialog] input')", "dialog");
  await setFile(
    'input[aria-label="Cover image"]',
    fixture("live-cover.jpg"),
  );
  await setFile('input[aria-label="Video clip"]', fixture("live-clip.mp4"));
  const insert = async () => {
    await evaluate(
      "[...document.querySelectorAll('[role=dialog] button')].find(b=>b.textContent==='Insert').dataset.testInsert='true'",
    );
    await click("button[data-test-insert]");
  };
  await insert();
  await wait(
    "document.querySelector('[role=dialog] [role=alert]')",
    "retry message",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('[data-live-photo]').length"),
    0,
  );
  rejectVideo = false;
  await insert();
  await wait(
    "document.querySelector('[data-live-photo] video') && sessionStorage.getItem('fixture-doc')?.includes('videoSrc')",
    "insert/save",
  );
  assert.deepEqual(uploads, ["image", "file", "file"]);
  const saved = await evaluate(
    "JSON.parse(sessionStorage.getItem('fixture-doc')).root.children.find(n=>n.type==='live-photo')",
  );
  assert.deepEqual(
    [saved.src, saved.videoSrc],
    ["/sample-media/live-cover.jpg", "/sample-media/live-clip.mp4"],
  );
  await browser.goto(admin + "/test/live-photo.html", 250);
  await wait("document.querySelector('[data-live-photo] video')", "reload");
  await hold("[data-live-photo] img");
  await wait(
    "document.querySelector('[data-live-selected=true]')",
    "node selection",
  );
  await send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
  });
  await send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
  });
  await wait(
    "!document.querySelector('[data-live-photo]')",
    "delete selection",
  );
  await click('button[aria-label="Undo"]');
  await wait("document.querySelector('[data-live-photo] video')", "undo");
  const clipUrl = await evaluate(
    "document.querySelector('[data-live-photo] video').src",
  );
  await setFile(
    'input[aria-label="Replacement clip"]',
    fixture("live-clip.mp4"),
  );
  await wait(
    "document.querySelector('[data-live-photo] video').src.includes('replacement')",
    "replace clip",
  );
  await click('button[aria-label="Undo"]');
  assert.equal(
    await evaluate("document.querySelector('[data-live-photo] video').src"),
    clipUrl,
  );
  await evaluate(
    `(()=>{const block=document.querySelector('[data-live-photo]'), image=block.querySelector('img'), r=image.getBoundingClientRect(); image.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+12}));})()`,
  );
  await sleep(160);
  const firstBlock = () =>
    evaluate(
      "document.querySelector('[contenteditable=true]').firstElementChild?.hasAttribute('data-live-photo')",
    );
  assert.equal(await firstBlock(), false);
  // Drive the handle's native drag events with the same DataTransfer through drop.
  await evaluate(`(()=>{const root=document.querySelector('[contenteditable=true]'), block=root.querySelector('[data-live-photo]'), r=block.getBoundingClientRect(), target=root.firstElementChild,t=target.getBoundingClientRect(),dt=new DataTransfer();
    block.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.x+10,clientY:r.y+12}));
    document.querySelector('button[aria-label="Block actions"]').dispatchEvent(new DragEvent('dragstart',{dataTransfer:dt,bubbles:true,cancelable:true,clientX:r.x,clientY:r.y+12}));
    for(const type of ['dragover','drop'])target.dispatchEvent(new DragEvent(type,{dataTransfer:dt,bubbles:true,cancelable:true,clientX:t.x+10,clientY:t.y+1}));
    document.dispatchEvent(new DragEvent('dragend',{dataTransfer:dt,bubbles:true}));
  })()`);
  await wait(
    "document.querySelector('[contenteditable=true]').firstElementChild?.hasAttribute('data-live-photo')",
    "drag changed document order",
  );
  await browser.goto(web + "/debug/live-photo", 300);
  await hold(".article-rich .yz-live-frame img");
  console.log(
    "PASS: actual admin insert/retry, persistent media URLs, reopen, selection/delete/undo, public renderer hold/release",
  );
} finally {
  await browser.close();
}
