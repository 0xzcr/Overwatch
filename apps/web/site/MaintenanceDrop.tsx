"use client";
import { useState } from "react";
import { MAINTENANCE_NOTICE } from "./content";

/** Small notice that drops down from the left of the navbar on every page. Dismiss lasts until the next page load. */
export function MaintenanceDrop() {
  const [open, setOpen] = useState(!!MAINTENANCE_NOTICE);
  if (!open) return null;
  return (
    <div className="nav-drop mono" role="status">
      <span className="badge badge--warn">maintenance</span>
      <span>{MAINTENANCE_NOTICE}</span>
      <button className="nav-drop__close" onClick={() => setOpen(false)} aria-label="Dismiss notice" data-cursor="Close">
        ✕
      </button>
    </div>
  );
}
