"use client";

import { useState } from "react";
import { useLanguage } from "../LanguageProvider";

const emojiOptions = ["😀", "😍", "🔥", "✨", "🎉", "💡", "📌", "✅", "❤️", "👍", "🚀", "👇"];
const symbolOptions = ["#", "@", "•", "✓", "→", "★", "☆", "♥", "©", "™", "…", "｜", "—", "【", "】"];

type Picker = "emoji" | "symbol" | null;

type TextInsertToolbarProps = {
  onInsert: (value: string) => void;
};

export function TextInsertToolbar({ onInsert }: TextInsertToolbarProps) {
  const { t } = useLanguage();
  const [picker, setPicker] = useState<Picker>(null);
  const options = picker === "emoji" ? emojiOptions : symbolOptions;

  function toggle(nextPicker: Exclude<Picker, null>) {
    setPicker((current) => (current === nextPicker ? null : nextPicker));
  }

  return (
    <div className="text-insert-toolbar" role="toolbar" aria-label={t("插入表情或特殊符号", "Insert emoji or special symbols")}>
      <button
        aria-expanded={picker === "emoji"}
        className={picker === "emoji" ? "text-insert-trigger active" : "text-insert-trigger"}
        onClick={() => toggle("emoji")}
        type="button"
      >
        😊 {t("表情", "Emoji")}
      </button>
      <button
        aria-expanded={picker === "symbol"}
        className={picker === "symbol" ? "text-insert-trigger active" : "text-insert-trigger"}
        onClick={() => toggle("symbol")}
        type="button"
      >
        # {t("特殊符号", "Symbols")}
      </button>
      {picker ? (
        <div className="text-insert-options" aria-label={picker === "emoji" ? t("表情列表", "Emoji list") : t("特殊符号列表", "Symbol list")}>
          {options.map((option) => (
            <button
              className="text-insert-option"
              key={option}
              onClick={() => {
                onInsert(option);
                setPicker(null);
              }}
              title={t(`插入 ${option}`, `Insert ${option}`)}
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
