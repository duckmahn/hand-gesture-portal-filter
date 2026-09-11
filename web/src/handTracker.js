import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export function extractHands(result) {
  if (!result || !result.landmarks) return [];
  return result.landmarks.map((hand) => hand.map((lm) => [lm.x, lm.y]));
}

export async function createHandTracker() {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
  );
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
  });

  return {
    detect(videoElement, timestampMs) {
      const result = handLandmarker.detectForVideo(videoElement, timestampMs);
      return extractHands(result);
    },
    close() {
      handLandmarker.close();
    },
  };
}
