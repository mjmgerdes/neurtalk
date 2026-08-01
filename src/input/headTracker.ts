import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

export interface HeadPose {
  /** -0.5..0.5 — nose position between cheeks, minus calibrated neutral. Negative = turned toward their left option. */
  yaw: number;
  /** -0.5..0.5 — nose position between forehead and chin, minus calibrated neutral. Positive = head tilted down. */
  pitch: number;
  faceDetected: boolean;
}

// Landmark-geometry pose estimate instead of Euler extraction from the
// transformation matrix: it is trivially calibratable per person/camera at
// the event, which matters more than precision here.
const NOSE = 1;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;
const FOREHEAD = 10;
const CHIN = 152;

export class HeadTracker {
  private landmarker: FaceLandmarker | null = null;
  private raf = 0;
  private neutral = { yaw: 0, pitch: 0 };
  private latestRaw = { yaw: 0, pitch: 0 };
  onPose: ((pose: HeadPose) => void) | null = null;

  async init() {
    const fileset = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numFaces: 1,
    });
  }

  /** Call while the user looks straight at the screen. */
  calibrate() {
    this.neutral = { ...this.latestRaw };
  }

  start(video: HTMLVideoElement) {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.landmarker || video.readyState < 2) return;
      const result = this.landmarker.detectForVideo(video, performance.now());
      const lm = result.faceLandmarks?.[0];
      if (!lm) {
        this.onPose?.({ yaw: 0, pitch: 0, faceDetected: false });
        return;
      }
      const nose = lm[NOSE];
      const l = lm[LEFT_CHEEK];
      const r = lm[RIGHT_CHEEK];
      const top = lm[FOREHEAD];
      const chin = lm[CHIN];
      const rawYaw = (nose.x - l.x) / Math.max(1e-6, r.x - l.x) - 0.5;
      const rawPitch = (nose.y - top.y) / Math.max(1e-6, chin.y - top.y) - 0.5;
      this.latestRaw = { yaw: rawYaw, pitch: rawPitch };
      this.onPose?.({
        yaw: rawYaw - this.neutral.yaw,
        pitch: rawPitch - this.neutral.pitch,
        faceDetected: true,
      });
    };
    loop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }
}
