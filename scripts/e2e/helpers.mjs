// e2e 测试共用的小工具（在页面里执行的表达式字符串）。

// 点顶部导航里指向 href 的链接（真实的站内跳转），等地址变了再等页面渲染完
export const clickNav = (href, settle = 1500) => `(async () => {
  document.querySelector('.navigation-List a[href="${href}"]').click();
  for (let i = 0; i < 100 && location.pathname !== "${href}"; i++) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => setTimeout(r, ${settle}));
  return location.pathname;
})()`;

// 点导航后立刻抓取视图过渡的动画（只取第一帧出现的那一批）：伪元素、动画名、时长、关键帧里的尺寸和位置
export const clickNavAndCaptureTransition = (href) => `(async () => {
  document.querySelector('.navigation-List a[href="${href}"]').click();
  for (let i = 0; i < 300; i++) {
    const list = document.getAnimations().filter((a) => a.effect?.pseudoElement?.startsWith("::view-transition"));
    if (list.length) return list.map((a) => ({
      pseudo: a.effect.pseudoElement,
      name: a.animationName,
      frames: a.effect.getKeyframes().map((k) => ({ width: k.width, transform: k.transform })),
    }));
    await new Promise((r) => requestAnimationFrame(r));
  }
  return [];
})()`;

// 页面加载前注入（Page.addScriptToEvaluateOnNewDocument）：把 Core 的实时连接换成页面里的假 WebSocket，
// 按 socket.io 协议回握手；window.__emit(message) 往 /web 推一条消息，window.__sent 记下页面发出去的包（加入房间等）。不连真的 Core。
export const fakeSocket = `{
  const Native = window.WebSocket;
  window.__sockets = [];
  window.__sent = [];
  class Fake extends EventTarget {
    constructor(url, protocols) {
      super();
      if (!String(url).includes("/socket.io")) return new Native(url, protocols);
      this.url = String(url); this.readyState = 0; this.binaryType = "blob"; this.protocol = ""; this.extensions = "";
      window.__sockets.push(this);
      setTimeout(() => { this.readyState = 1; this.onopen?.({}); this.deliver("0" + JSON.stringify({ sid: "fake", upgrades: [], pingInterval: 600000, pingTimeout: 600000, maxPayload: 1000000 })); }, 0);
    }
    deliver(data) { this.onmessage?.({ data }); }
    send(data) {
      window.__sent.push(String(data));
      const connect = /^40(\\/[^,]*)?,?/.exec(String(data));
      if (connect) setTimeout(() => this.deliver("40" + (connect[1] ? connect[1] + "," : "") + JSON.stringify({ sid: "fake-nsp" })), 0);
    }
    close() { this.readyState = 3; this.onclose?.({ code: 1000, reason: "" }); }
  }
  for (const [name, value] of [["CONNECTING", 0], ["OPEN", 1], ["CLOSING", 2], ["CLOSED", 3]]) { Fake[name] = value; Fake.prototype[name] = value; }
  window.WebSocket = Fake;
  window.__emit = (message) => window.__sockets.forEach((socket) => socket.deliver("42/web," + JSON.stringify(["message", message])));
}`;
