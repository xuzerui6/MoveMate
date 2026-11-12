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
    <section className="gym-settings-card">
      <h3 className="gym-settings-title">安装与离线使用</h3>
      <p className="gym-settings-hint">{online ? "当前在线" : "当前离线 · 之前打开过的内容还能看，开始计时要联网"}</p>
      <button
        type="button"
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
        打开过的页面和你的训练记录，没网时也能看。没网时不能开始新的计时；语音陪练和登录也要联网。你的录音和视频不会存在这台设备里。退出账号时，这个账号在这台设备上存的内容和草稿会清掉。
      </p>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
