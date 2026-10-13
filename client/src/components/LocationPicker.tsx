/**
 * 地点选择器 —— 预设高频地点 + 手动输入兜底
 */
import React, { useState } from 'react';

interface Props {
  value: string;
  onChange: (location: string) => void;
}

/** 预设地点列表（可根据学校定制） */
const PRESET_LOCATIONS = [
  '东操场（篮球场）',
  '东操场（足球场）',
  '体育馆一楼（羽毛球）',
  '体育馆二楼（健身房）',
  '北区篮球场',
  '南区田径场',
  '游泳馆门口',
  '图书馆前广场',
];

const LocationPicker: React.FC<Props> = ({ value, onChange }) => {
  const [isCustom, setIsCustom] = useState(
    value !== '' && !PRESET_LOCATIONS.includes(value)
  );

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustom(true);
      onChange('');
    } else {
      setIsCustom(false);
      onChange(val);
    }
  };

  return (
    <div>
      <select
        className="form-select"
        value={isCustom ? '__custom__' : value}
        onChange={handlePresetChange}
        style={{ marginBottom: isCustom ? '0.75rem' : 0 }}
      >
        <option value="" disabled>
          请选择运动地点
        </option>
        {PRESET_LOCATIONS.map((loc) => (
          <option key={loc} value={loc}>
            {loc}
          </option>
        ))}
        <option value="__custom__">手动输入其他地点...</option>
      </select>

      {isCustom && (
        <input
          className="form-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'输入具体地点，如 "西区排球场"'}
          autoFocus
        />
      )}
    </div>
  );
};

export default LocationPicker;
