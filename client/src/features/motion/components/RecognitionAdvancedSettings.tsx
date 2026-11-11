import {useState} from 'react';
import {
  loadPoseModelPreference,
  loadRecognitionPreference,
  savePoseModelPreference,
  saveRecognitionPreference,
  type RecognitionPreference,
} from '../lib/adaptiveRecognition';
import type {PoseModelPreference} from '../lib/poseCompatibility';

/** The recognition escape hatches, moved off the prep pages into settings →
 * 高级 (audit F1/F2). The closed large-model route is gone from the choices:
 * it was retired on 2026-11-11, and its stored value already reads back as 自动. */
export function RecognitionAdvancedSettings() {
  const [preference, setPreference] = useState<RecognitionPreference>(() => loadRecognitionPreference());
  const [model, setModel] = useState<PoseModelPreference>(() => loadPoseModelPreference());
  return (
    <div className="recognition-advanced">
      <label>
        识别方式
        <select
          value={preference}
          onChange={event => {
            const value = event.target.value as RecognitionPreference;
            setPreference(value);
            saveRecognitionPreference(value);
          }}
        >
          <option value="auto">自动（推荐）</option>
          <option value="legacy">旧版</option>
        </select>
      </label>
      <p className="gym-settings-hint">默认自动。只有在这台手机上识别总是不稳时，才需要改成旧版。</p>
      <label>
        识别模型
        <select
          value={model}
          onChange={event => {
            const value = event.target.value as PoseModelPreference;
            setModel(value);
            savePoseModelPreference(value);
          }}
        >
          <option value="auto">自动（推荐）</option>
          <option value="lite">Lite 轻量</option>
          <option value="full">Full 完整</option>
        </select>
      </label>
      <p className="gym-settings-hint">默认自动，按这台手机的速度选。Lite 下载更小、打开更快；Full 看得更细一些。</p>
    </div>
  );
}
