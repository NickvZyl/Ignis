import { registry } from '../registry';
import type { FurnitureDef } from '../types';

// The window is drawn separately in IgnisScene (drawWindow), not by this draw function.
// This registration exists so Igni can walk to it and the chat system can reference it.

export const def: FurnitureDef = {
  id: 'window', label: 'Window', gridW: 6, gridH: 4,
  spotDx: 3, spotDy: 7, canOverlapWall: true, zone: 'wall', drawKey: 'window',
  category: 'structural', tags: ['weather', 'outside'],
  required: true,
  hiResSprites: { 0: '/furniture/window-front-clean.png' },
};

// No-op draw — the window is rendered by drawWindow() in IgnisScene
export function draw() {}

registry.register(def, draw);
