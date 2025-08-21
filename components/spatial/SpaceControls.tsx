"use client";
import { useState } from "react";

export type SpaceControlsProps = {
  mode: "orbit" | "first-person" | "fly";
  onChangeMode: (mode: "orbit" | "first-person" | "fly") => void;
};

export default function SpaceControls(props: SpaceControlsProps) {
  const { mode, onChangeMode } = props;
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-100">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="font-medium">Space Controls</div>
        <button className="text-xs text-neutral-300 hover:text-white" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 text-sm">
          <div className="mb-2 text-neutral-400">Camera Mode</div>
          <div className="flex gap-2">
            {(["orbit", "first-person", "fly"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onChangeMode(m)}
                className={`rounded px-2 py-1 text-xs ${
                  mode === m ? "bg-blue-500 text-white" : "bg-neutral-700 hover:bg-neutral-600"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


