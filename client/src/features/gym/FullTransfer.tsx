import { useEffect, useRef, useState } from "react";
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
          setMessage("本地草稿存储不可用，可以重新选文件；服务端断点仍保留"),
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
      <h2>完整恢复与分批导入</h2>
      <p className="gym-muted">
        支持动伴版本 1／2、可识别的 openGym 计划／历史／体重，以及
        Strong、Hevy、FitNotes
        CSV。逐批先预览再确认；未知动作须映射。历史只恢复为手动记录，不补
        XP、摄像头评分或解锁。未结束计时不恢复为正式计时。
      </p>
      <div className="gym-two">
        <label>
          来源格式
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
        <label>
          原始 CSV 重量单位
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="kg">kg</option>
            <option value="lb">lb</option>
          </select>
        </label>
      </div>
      <label>
        选择文件（最多 20MB）
        <input
          type="file"
          accept=".json,.csv"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void perform(async () => {
              if (file.size > 20000000) throw Error("文件超过20MB");
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
              setMessage("文件已分成 " + parts.length + " 批，请逐批预览。");
            });
          }}
        />
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
            批；断网或关闭页面后可继续。退出账号清理本机文件草稿。
          </p>
          <div className="gym-inline-actions">
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
                    setMessage("该文件已全部处理");
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
              从服务端断点读取并预览下一批
            </button>
            <button
              disabled={busy}
              onClick={() => {
                void transferDraft("delete", String(uid));
                setDraft(null);
                setPreview(null);
              }}
            >
              清除本机文件草稿
            </button>
          </div>
          {done && (
            <p className="gym-success">全部批次已由服务端确认。导入 XP：0。</p>
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
              <span>未匹配：{name}</span>
              <button onClick={() => setPick(name)}>选择对应动作</button>
            </div>
          ))}
          {preview.conflicts.map((c: any) => (
            <label key={c.key}>
              冲突：{c.name}
              <select
                value={choices[c.key] || ""}
                onChange={(e) =>
                  setChoices({ ...choices, [c.key]: e.target.value })
                }
              >
                <option value="">请选择；当前数据保留</option>
                <option value="keep">保留现有，跳过导入项</option>
                <option value={c.kind === "settings" ? "apply" : "copy"}>
                  {c.kind === "settings"
                    ? "明确采用导入的个人偏好"
                    : c.kind === "body"
                      ? "仅补充现有记录缺少的字段"
                      : "导入为独立副本"}
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
                  "本批已确认，累计新增 " + result.imported + " 条 · 0 XP",
                );
              })
            }
          >
            确认上述内容并写入这一批
          </button>
        </div>
      )}
      {pick && (
        <div>
          <h3>映射 {pick}</h3>
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
