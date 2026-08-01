import { useEffect, useRef, useState } from "react";
import type { AccessMethod, SelectionSlot } from "../types";
import type { HeadPose } from "./headTracker";

// Tunable at the event via the debug panel.
export const TUNING = {
  yawThreshold: 0.06, // beyond this = left/right
  nodThreshold: 0.05, // downward pitch delta that counts as a nod
  nodResetMs: 700, // pitch must return under threshold within this window
  highlightStableMs: 250, // slot must be stable before highlight moves
  scanIntervalMs: 1400, // switch-scanning cycle speed
};

export type Stage = "idle" | "choosing" | "confirming";

interface SelectionState {
  highlighted: SelectionSlot;
  stage: Stage;
  /** Fires when the user deliberately confirms the highlighted/confirming item. */
}

export function slotFromYaw(yaw: number): SelectionSlot {
  // Camera is mirrored for the user: turning their head toward the left card
  // moves the nose toward higher x in the un-mirrored frame. Sign is settled
  // empirically via the calibrate step + debug readout.
  if (yaw < -TUNING.yawThreshold) return 0;
  if (yaw > TUNING.yawThreshold) return 2;
  return 1;
}

/**
 * Access-method-independent selection core. Head pose, number keys, and
 * switch scanning all reduce to: highlight(slot) + confirm(). This is the
 * architectural point of NeurTalk — the brain is not coupled to one input.
 */
export function useSelection(
  method: AccessMethod,
  active: boolean,
  onConfirm: (slot: SelectionSlot, stage: Stage) => void
) {
  const [highlighted, setHighlighted] = useState<SelectionSlot>(1);
  const [stage, setStage] = useState<Stage>("choosing");
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const highlightedRef = useRef(highlighted);
  highlightedRef.current = highlighted;

  const pendingSlot = useRef<SelectionSlot>(1);
  const pendingSince = useRef(0);
  const nodArmed = useRef(true);
  const nodStarted = useRef(0);

  // Head pose feed (wired by the Talk screen).
  const onPoseRef = useRef<(p: HeadPose) => void>(() => {});
  onPoseRef.current = (pose: HeadPose) => {
    if (!active || method !== "head" || !pose.faceDetected) return;
    // Highlight from yaw, with stability window (only while choosing).
    if (stageRef.current === "choosing") {
      const slot = slotFromYaw(pose.yaw);
      if (slot !== pendingSlot.current) {
        pendingSlot.current = slot;
        pendingSince.current = performance.now();
      } else if (
        slot !== highlightedRef.current &&
        performance.now() - pendingSince.current > TUNING.highlightStableMs
      ) {
        setHighlighted(slot);
      }
    }
    // Nod detection: downward crossing then release.
    if (nodArmed.current && pose.pitch > TUNING.nodThreshold) {
      nodArmed.current = false;
      nodStarted.current = performance.now();
    } else if (!nodArmed.current && pose.pitch < TUNING.nodThreshold * 0.5) {
      const quick = performance.now() - nodStarted.current < TUNING.nodResetMs;
      nodArmed.current = true;
      if (quick) confirm();
    }
  };

  function confirm() {
    const s = stageRef.current;
    if (s === "choosing") {
      setStage("confirming");
      onConfirm(highlightedRef.current, "choosing");
    } else if (s === "confirming") {
      onConfirm(highlightedRef.current, "confirming");
      setStage("choosing");
    }
  }

  function cancel() {
    setStage("choosing");
  }

  // Keyboard method: 1/2/3 highlight, Enter confirm, Esc cancel.
  useEffect(() => {
    if (!active || method !== "keys") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "3") setHighlighted((Number(e.key) - 1) as SelectionSlot);
      if (e.key === "Enter") confirm();
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, method]);

  // Switch method: auto-scan highlight, Space = the single switch.
  useEffect(() => {
    if (!active || method !== "switch") return;
    const iv = setInterval(() => {
      if (stageRef.current === "choosing")
        setHighlighted((h) => (((h + 1) % 3) as SelectionSlot));
    }, TUNING.scanIntervalMs);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        confirm();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearInterval(iv);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, method]);

  return {
    highlighted,
    stage,
    setStage,
    cancel,
    feedPose: (p: HeadPose) => onPoseRef.current(p),
    // External drivers (e.g. the phone/glasses tilt input) reuse the same core.
    highlightExternal: (s: SelectionSlot) => setHighlighted(s),
    confirmExternal: () => confirm(),
  };
}
