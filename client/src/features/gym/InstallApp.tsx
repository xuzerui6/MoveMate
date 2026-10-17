import { useEffect, useState } from "react";
export default function InstallApp() {
  const [prompt, setPrompt] = useState<any>(null),
    [message, setMessage] = useState(""),
    [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const install = (e: Event) => {
        e.preventDefault();
        setPrompt(e);
      },
      on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", install);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("beforeinstallprompt", install);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return (
    <section className="gym-form">
      <h3>安装与离线使用</h3>
      <p>{online ? "当前在线" : "当前离线 · 缓存只供查看，正式计时需联网"}</p>
      <button
        className="secondary"
        onClick={async () => {
          if (prompt) {
            await prompt.prompt();
            const r = await prompt.userChoice;
            setMessage(
              r.outcome === "accepted" ? "已提交安装请求" : "已取消安装",
            );
            setPrompt(null);
          } else
            setMessage(
              "可使用浏览器菜单“安装应用”或“添加到主屏幕”。若无该选项，请继续使用网页。",
            );
        }}
      >
        安装动伴／添加到主屏幕
      </button>
      <p className="gym-muted">
        已访问的静态页面与本人训练只读缓存可离线查看。断网不能新建正式计时；语音、登录接口、原始音视频不会缓存。退出账号会清理该账号的缓存和草稿。
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
