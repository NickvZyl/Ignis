import { create } from 'zustand';

export type SceneId = 'room' | 'garden' | 'bedroom';

interface SceneState {
  activeScene: SceneId;       // what the USER is viewing
  ignisScene: SceneId;        // where Ignis actually is (independent)
  transitioning: boolean;
  transitionTarget: SceneId | null;
  switchScene: (target: SceneId) => void;        // user navigates (with fade)
  setIgnisScene: (scene: SceneId) => void;        // Ignis moves (no fade)
}

function loadScene(): SceneId {
  try {
    const raw = localStorage.getItem('ignis_active_scene');
    if (raw === 'garden' || raw === 'bedroom') return raw;
  } catch {}
  return 'room';
}

function loadIgnisScene(): SceneId {
  try {
    const raw = localStorage.getItem('ignis_scene');
    if (raw === 'garden' || raw === 'bedroom') return raw;
  } catch {}
  return 'room';
}

export const useSceneStore = create<SceneState>((set, get) => ({
  activeScene: loadScene(),
  ignisScene: loadIgnisScene(),
  transitioning: false,
  transitionTarget: null,

  switchScene: (target) => {
    const { activeScene, transitioning } = get();
    if (transitioning || target === activeScene) return;

    set({ transitioning: true, transitionTarget: target });

    // Fade out (300ms), then swap scene
    setTimeout(() => {
      localStorage.setItem('ignis_active_scene', target);
      set({ activeScene: target });

      // Fade in (300ms), then clear
      setTimeout(() => {
        set({ transitioning: false, transitionTarget: null });
      }, 300);
    }, 300);
  },

  setIgnisScene: (scene) => {
    localStorage.setItem('ignis_scene', scene);
    set({ ignisScene: scene });
  },
}));
