// Import all pieces (triggers self-registration)
import './pieces/desk';
import './pieces/bookshelf';
import './pieces/couch';
import './pieces/fireplace';
import './pieces/clock_table';
import './pieces/kitchen';
import './pieces/fridge';
import './pieces/plant';
import './pieces/front_door';
import './pieces/tall_plant';
import './pieces/succulent';
import './pieces/floor_lamp';
import './pieces/wall_sconce';
import './pieces/ceiling_light';
import './pieces/window';
// Garden pieces
import './pieces/garden_gate';
import './pieces/farm_patch';
import './pieces/chicken_coop';
import './pieces/cow_pen';
import './pieces/sheep_pen';
// Bedroom pieces
import './pieces/hallway_door';
import './pieces/bedroom_door';
import './pieces/bed';
import './pieces/nightstand';
import './pieces/wardrobe';
import './pieces/bedroom_window';

export { registry } from './registry';
export type { FurnitureDef, FurnitureCategory, FurnitureDrawFn, FurnitureGlowFn, FurnitureRotation } from './types';
export { setCheckinRemaining } from './pieces/clock_table';
export { getRotatedDims, getRotatedSpot, drawRotated, glowRotated } from './rotation';
