export type LivePreferences = {
  showLiveTranscript: boolean;
  automaticDetection: boolean;
};

export const defaultLivePreferences: LivePreferences = {
  showLiveTranscript: true,
  automaticDetection: true,
};

const storageKey = "talkshow-live-preferences";

export function readLivePreferences(): LivePreferences {
  if (typeof window === "undefined") return defaultLivePreferences;

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    return {
      showLiveTranscript:
        typeof saved.showLiveTranscript === "boolean"
          ? saved.showLiveTranscript
          : defaultLivePreferences.showLiveTranscript,
      automaticDetection:
        typeof saved.automaticDetection === "boolean"
          ? saved.automaticDetection
          : defaultLivePreferences.automaticDetection,
    };
  } catch {
    return defaultLivePreferences;
  }
}

export function saveLivePreferences(preferences: LivePreferences) {
  localStorage.setItem(storageKey, JSON.stringify(preferences));
}
