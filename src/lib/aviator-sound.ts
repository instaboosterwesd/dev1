// Audio for the Aviator game — only the user's uploaded MP3 files.
// bg-music loops while Music/Sound is on; start.mp3 plays at takeoff and
// flewaway.mp3 plays when the plane crashes (only when Sound is on).

import bgMusicUrl from "../assets/bg-music.mp3?url";
import startUrl from "../assets/start.mp3?url";
import flewAwayUrl from "../assets/flewaway.mp3?url";

let musicEl: HTMLAudioElement | null = null;
let startEl: HTMLAudioElement | null = null;
let flewAwayEl: HTMLAudioElement | null = null;

export function startMusic(): void {
  if (typeof window === "undefined") return;
  if (!musicEl) {
    musicEl = new Audio(bgMusicUrl);
    musicEl.loop = true;
    musicEl.volume = 0.5;
  }
  void musicEl.play().catch(() => { /* blocked until user interaction */ });
}

export function stopMusic(): void {
  if (!musicEl) return;
  musicEl.pause();
  musicEl.currentTime = 0;
}

export function playStart(): void {
  if (typeof window === "undefined") return;
  if (!startEl) {
    startEl = new Audio(startUrl);
    startEl.volume = 0.8;
  }
  startEl.currentTime = 0;
  void startEl.play().catch(() => { /* blocked until user interaction */ });
}

export function playFlewAway(): void {
  if (typeof window === "undefined") return;
  if (!flewAwayEl) {
    flewAwayEl = new Audio(flewAwayUrl);
    flewAwayEl.volume = 0.8;
    flewAwayEl.playbackRate = 1.6;
  }
  flewAwayEl.currentTime = 0;
  void flewAwayEl.play().catch(() => { /* blocked until user interaction */ });
}
