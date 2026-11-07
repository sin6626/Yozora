"use client";

// 根布局 app/[locale]/layout.tsx 本身出错时的兜底：它替换掉整个根布局，所以要自己输出 <html>/<body>。
// 这时站内的词典（LocaleProvider）、globals.css 和字体都没有加载，不能用站内组件和样式变量：
// 文案用中文写死（读不到站点语言），颜色写死成熄灯夜色，只靠行内样式也能看。
// Next 16 的错误组件收 { error, retry, reset }，retry 会重新向服务端取一次再渲染。
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="zh-CN" data-theme="dark">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#14111f", color: "#ece8f4", fontFamily: "system-ui, -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif" }}>
        <title>出了点问题</title>
        <main className="global-error" role="alert" style={{ display: "grid", justifyItems: "center", gap: 12, padding: 24, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>这片夜空暂时没能亮起来</h1>
          <p style={{ margin: 0, maxWidth: 448, color: "rgb(236 232 244 / 65%)", lineHeight: 1.8 }}>整个页面加载时出了问题。可以重试一次，还不行的话稍后再来。</p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, marginTop: 16 }}>
            <button type="button" onClick={retry} style={{ padding: "8px 20px", border: 0, borderRadius: 999, background: "#c8b6ff", color: "#14111f", font: "inherit", cursor: "pointer" }}>重试</button>
            {/* 整页重新加载首页（根布局坏了，不走客户端跳转） */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" style={{ padding: "8px 20px", borderRadius: 999, border: "1px solid rgb(236 232 244 / 20%)", color: "inherit", textDecoration: "none" }}>回到首页</a>
          </div>
        </main>
      </body>
    </html>
  );
}
