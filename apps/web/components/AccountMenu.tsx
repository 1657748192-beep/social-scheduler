"use client";

import React, { useEffect, useId, useRef, useState } from "react";

export function AccountMenu({ name, signOutLabel, onSignOut }: {
  name: string;
  signOutLabel: string;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popupId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <div className="account-menu" ref={root}>
    <button className="account-menu-trigger" type="button" ref={trigger}
      aria-expanded={open} aria-controls={popupId} onClick={() => setOpen(current => !current)}>
      <span className="account-avatar" aria-hidden="true">{Array.from(name.trim())[0]?.toUpperCase() || "A"}</span>
      <span className="account-menu-name" title={name}>{name}</span>
      <span className="account-menu-chevron" aria-hidden="true">⌄</span>
    </button>
    {open ? <div className="account-menu-popup" id={popupId}>
      <button type="button" disabled={signingOut} onClick={async () => {
        if (signingOut) return;
        setSigningOut(true);
        try { await onSignOut(); } finally { setSigningOut(false); setOpen(false); }
      }}>{signOutLabel}</button>
    </div> : null}
  </div>;
}
