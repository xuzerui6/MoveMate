import { useEffect, useRef, useState } from "react";
import { UploadSimple } from "@phosphor-icons/react";
import { useAuthStore } from "../../stores/authStore";
import { request, getErrorMessage } from "./api";
import { transferDraft } from "./offline";
import { chunkFile, sha } from "./transferFile";
import { ExerciseLibrary } from "./Library";
export default function FullTransfer() {
  const token = useRef(localStorage.getItem("token")).current;
  const call = (method: string, path: string, body?: any) =>
    request(method, path, body, token);
  const uid = useAuthStore((s) => s.user?.id),
    [draft, setDraft] = useState<any>(null),
    [preview, setPreview] = useState<any>(null),
    [choices, setChoices] = useState<Record<string, string>>({}),
    [format, setFormat] = useState("movemate"),
    [unit, setUnit] = useState("kg"),
    [pick, setPick] = useState(""),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false);
  const persist = async (next: any) => {
    if (useAuthStore.getState().user?.id !== uid) return;
    setDraft(next);
    if (uid != null) await transferDraft("put", String(uid), next);
  };
  useEffect(() => {
    let alive = true;
    if (uid != null)
      void transferDraft("get", String(uid))
        .then((v) => {
          if (alive) setDraft(v || null);
        })
        .catch(() =>
          setMessage("草稿没法存到这台设备上，可以重新选文件；已经传到云端的进度不会丢"),
        );
    return () => {
      alive = false;
    };
  }, [uid]);
  const perform = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await fn();
    } catch (e) {
      setFailed(true);
      setMessage(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const cursor = draft?.cursor || 0,
    done = draft && cursor >= draft.parts.length;
  const payload = () => ({
    format: draft.format,
    payload: draft.parts[cursor],
    mapping: draft.mapping || {},
    choices,
  });
  return (
    <section className="gym-form">
      <div className="gym-data-head">
        <span className="gym-data-icon">
          <UploadSimple size={20} />
        </span>
        <h2>从备份或文件恢复</h2>
      </div>
      <p className="gym-muted">
        文件会分成几小批，一批先给你看清楚，你确认一批、存一批。导入的历史只会变成手动记录，不加
        XP。
      </p>
      <details className="gym-more">
        <summary>了解更多</summary>
        <p className="gym-muted">
          可以导入：动伴自己的备份文件（新旧版本都行）、openGym
          的计划和记录，还有从 Strong、Hevy、FitNotes
          导出的表格文件。文件会分成几小批，一批先给你看清楚，你确认一批、存一批。里面认不出的动作，需要你手动选一下对应的是哪个。导入的历史只会变成手动记录：不加
          XP，也不会有摄像头评分和解锁。没练完的计时，不会当成正式记录恢复。
        </p>
      </details>
      <label className="gym-chooser gym-chooser-first">
        <span className="gym-chooser-label">来源格式</span>
        <select
          disabled={busy}
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          {[
            ["movemate", "动伴完整 JSON"],
            ["opengym", "openGym JSON"],
            ["strong", "Strong CSV"],
            ["hevy", "Hevy CSV"],
            ["fitnotes", "FitNotes CSV"],
          ].map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="gym-chooser">
        <span className="gym-chooser-label">原文件用的重量单位</span>
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="kg">kg</option>
          <option value="lb">lb</option>
        </select>
      </label>
      <label className="gym-file-card">
        <input
          type="file"
          accept=".json,.csv"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void perform(async () => {
              if (file.size > 20000000) throw Error("文件超过 20MB，请换一个小一点的文件");
              const { parts, format: kind } = chunkFile(
                  await file.text(),
                  format,
                  unit,
                ),
                manifest = await Promise.all(parts.map(sha));
              const fingerprint = await sha({ format: kind, manifest }),
                batchId = "restore-" + uid + "-" + fingerprint.slice(0, 36);
              const status = await call(
                "GET",
                "/training-imports/batches/" + batchId,
              );
              await persist({
                batchId,
                format: kind,
                parts,
                manifest,
                cursor: status.cursor || 0,
                mapping: {},
                fileName: file.name,
              });
              setPreview(null);
              setChoices({});
              setMessage("文件已分成 " + parts.length + " 批，一批一批来，先预览再确认。");
            });
          }}
        />
        <span className="gym-file-card-icon">
          <UploadSimple size={26} />
        </span>
        <span className="gym-file-card-main">点按选择文件</span>
        <span className="gym-file-card-sub">JSON / CSV 文件 · 最大 20MB</span>
      </label>
      {message && (
        <p role="status" className={failed ? "gym-error" : "gym-success"}>
          {message}
        </p>
      )}
      {draft && (
        <>
          <h3>{draft.fileName}</h3>
          <progress
            max={draft.parts.length}
            value={cursor}
            aria-label="导入进度"
          />
          <p>
            已确认 {cursor} / {draft.parts.length}{" "}
            批；断网、关掉页面都没事，下次能接着来。退出登录会清掉这台设备上没导完的草稿。
          </p>
          <div className="gym-inline-actions gym-transfer-actions">
            <button
              disabled={busy || done}
              className="primary"
              onClick={() =>
                void perform(async () => {
                  const status = await call(
                    "GET",
                    "/training-imports/batches/" + draft.batchId,
                  );
                  const next = { ...draft, cursor: status.cursor || 0 };
                  await persist(next);
                  if (next.cursor >= next.parts.length) {
                    setMessage("这个文件已经全部导完了");
                    return;
                  }
                  setChoices({});
                  setPreview(
                    await call("POST", "/training-imports/transfer-preview", {
                      format: next.format,
                      payload: next.parts[next.cursor],
                      mapping: next.mapping || {},
                    }),
                  );
                })
              }
            >
              接着预览下一批
            </button>
            <button
              disabled={busy}
              onClick={() => {
                void transferDraft("delete", String(uid));
                setDraft(null);
                setPreview(null);
              }}
            >
              清掉这份没导完的草稿
            </button>
          </div>
          {done && (
            <p className="gym-success">全部导完了。这次导入不加 XP。</p>
          )}
        </>
      )}
      {preview && (
        <div className="gym-preview">
          <h3>
            本批 {preview.items.length} 条 · {preview.duplicates} 条重复
          </h3>
          {preview.items.map((item: any) => (
            <p key={item.key}>
              {
                (
                  {
                    exercise: "自定义动作",
                    plan: "计划",
                    workout: "训练历史",
                    body: "身体记录",
                    settings: "个人设置",
                  } as any
                )[item.kind]
              }{" "}
              ·{" "}
              {item.value.name ||
                item.value.nameZh ||
                item.value.date ||
                "个人偏好"}
              {item.duplicate ? " · 已有相同内容，跳过" : ""}
            </p>
          ))}
          {preview.missing.map((name: string) => (
            <div className="gym-list-row" key={name}>
              <span>认不出：{name}</span>
              <button onClick={() => setPick(name)}>选择对应动作</button>
            </div>
          ))}
          {preview.conflicts.map((c: any) => (
            <label key={c.key}>
              这个和现在的不一样：{c.name}
              <select
                value={choices[c.key] || ""}
                onChange={(e) =>
                  setChoices({ ...choices, [c.key]: e.target.value })
                }
              >
                <option value="">请选择（不选就用现在的）</option>
                <option value="keep">用现在的，跳过这条</option>
                <option value={c.kind === "settings" ? "apply" : "copy"}>
                  {c.kind === "settings"
                    ? "改用导入的设置"
                    : c.kind === "body"
                      ? "只补上现在没有的"
                      : "另外存一份，两个都留"}
                </option>
              </select>
            </label>
          ))}
          <button
            className="primary"
            disabled={
              busy ||
              preview.missing.length > 0 ||
              preview.conflicts.some((c: any) => !choices[c.key])
            }
            onClick={() =>
              void perform(async () => {
                const result = await call(
                  "POST",
                  "/training-imports/transfer-commit",
                  {
                    ...payload(),
                    batchId: draft.batchId,
                    part: cursor,
                    total: draft.parts.length,
                    manifest: draft.manifest,
                    previewHash: preview.previewHash,
                  },
                );
                await persist({ ...draft, cursor: result.cursor });
                setPreview(null);
                setChoices({});
                setMessage(
                  "这一批存好了，一共新增 " + result.imported + " 条（导入不加 XP）",
                );
              })
            }
          >
            确认，存这一批
          </button>
        </div>
      )}
      {pick && (
        <div>
          <h3>给「{pick}」选对应的动作</h3>
          <button onClick={() => setPick("")}>取消</button>
          <ExerciseLibrary
            onPick={(e) => {
              void perform(async () => {
                const next = {
                  ...draft,
                  mapping: { ...draft.mapping, [pick]: e.id },
                };
                await persist(next);
                setPick("");
                setChoices({});
                setPreview(
                  await call("POST", "/training-imports/transfer-preview", {
                    format: next.format,
                    payload: next.parts[cursor],
                    mapping: next.mapping,
                  }),
                );
              });
            }}
          />
        </div>
      )}
    </section>
  );
}
