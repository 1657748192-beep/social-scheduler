"use client";

import { useState } from "react";

const emojiOptions = ["😀", "😍", "🔥", "✨", "🎉", "💡", "📌", "✅", "❤️", "👍", "🚀", "👇"];
const symbolOptions = ["#", "@", "•", "✓", "→", "★", "☆", "♥", "©", "™", "…", "｜", "—", "【", "】"];

type Picker = "emoji" | "symbol" | null;

type TextInsertToolbarProps = {
  onInsert: (value: string) => void;
};

export function TextInsertToolbar({ onInsert }: TextInsertToolbarProps) {
  const [picker, setPicker] = useState<Picker>(null);
  const options = picker === "emoji" ? emojiOptions : symbolOptions;

  function toggle(nextPicker: Exclude<Picker, null>) {
    setPicker((current) => (current === nextPicker ? null : nextPicker));
  }

  return (
    <div className="text-insert-toolbar" role="toolbar" aria-label="插入表情或特殊符号">
      <button
        aria-expanded={picker === "emoji"}
        className={picker === "emoji" ? "text-insert-trigger active" : "text-insert-trigger"}
        onClick={() => toggle("emoji")}
        type="button"
      >
        😊 表情
      </button>
      <button
        aria-expanded={picker === "symbol"}
        className={picker === "symbol" ? "text-insert-trigger active" : "text-insert-trigger"}
        onClick={() => toggle("symbol")}
        type="button"
      >
        # 特殊符号
      </button>
      {picker ? (
        <div className="text-insert-options" aria-label={picker === "emoji" ? "表情列表" : "特殊符号列表"}>
          {options.map((option) => (
            <button
              className="text-insert-option"
              key={option}
              onClick={() => {
                onInsert(option);
                setPicker(null);
              }}
              title={`插入 ${option}`}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
