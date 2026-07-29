"use client";

import { BeijingDateTimePicker } from "../BeijingDateTimePicker";
import { APP_TIME_ZONE_LABEL, toChinaDatetimeLocalValue } from "../../lib/chinaTime";
import { useLanguage } from "../LanguageProvider";

type SchedulePickerProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SchedulePicker({ value, onChange }: SchedulePickerProps) {
  const { t } = useLanguage();
  const minDateTime = toChinaDatetimeLocalValue(new Date());

  return (
    <section className="composer-panel">
      <p className="section-kicker">{t("发布时间", "Publishing time")}</p>
      <h2>{t("定时发布", "Schedule publishing")}</h2>
      <label className="field">
        <span>{t("北京时间", "Beijing time")}</span>
        <BeijingDateTimePicker min={minDateTime} onChange={onChange} value={value} />
      </label>
      <p className="muted">{t(`按 ${APP_TIME_ZONE_LABEL} 保存，使用 24 小时制；留空则保存为草稿。`, `Saved in ${APP_TIME_ZONE_LABEL}, using a 24-hour clock. Leave blank to save a draft.`)}</p>
    </section>
  );
}
