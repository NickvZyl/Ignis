// ── BFS pathfinding on the tile grid ──

import type { CellType } from './room-grid';
import { GRID_W, GRID_H, TILE } from './room-grid';

export interface Point {
  x: number;
  y: number;
}

interface GridPoint {
  gx: number;
  gy: number;
}

// 8-directional neighbors (includes diagonals)
const DIRS: [number, number][] = [
  [0, -1], [1, -1], [1, 0], [1, 1],
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/**
 * Check if there's a clear straight line between two points (no blocked tiles).
 */
function hasLineOfSight(grid: CellType[][], from: GridPoint, to: GridPoint): boolean {
  // Bresenham-style line check
  let x0 = from.gx, y0 = from.gy;
  const x1 = to.gx, y1 = to.gy;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x0 < 0 || y0 < 0 || x0 >= GRID_W || y0 >= GRID_H) return false;
    const cell = grid[y0][x0];
    if (cell === 1 || cell === 2) {
      // Allow the goal tile itself
      if (x0 === x1 && y0 === y1) return true;
      return false;
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return true;
}

/**
 * Find path from start to goal. Uses direct line if clear, BFS if obstructed.
 * Returns array of pixel waypoints.
 */
export function findPath(
  grid: CellType[][],
  startPx: Point,
  goalPx: Point,
): Point[] {
  const start: GridPoint = {
    gx: Math.min(GRID_W - 1, Math.max(0, Math.floor(startPx.x / TILE))),
    gy: Math.min(GRID_H - 1, Math.max(0, Math.floor(startPx.y / TILE))),
  };
  const goal: GridPoint = {
    gx: Math.min(GRID_W - 1, Math.max(0, Math.floor(goalPx.x / TILE))),
    gy: Math.min(GRID_H - 1, Math.max(0, Math.floor(goalPx.y / TILE))),
  };

  // If clear line of sight, just go straight — natural movement
  if (hasLineOfSight(grid, start, goal)) {
    return [goalPx];
  }

  // If start or goal is blocked, find nearest walkable
  const startCell = grid[start.gy]?.[start.gx];
  const goalCell = grid[goal.gy]?.[goal.gx];

  if (startCell === undefined || goalCell === undefined) return [];

  // Allow walking on the goal even if it's furniture (interaction spot might be on furniture edge)
  const isWalkable = (gx: number, gy: number, isGoal: boolean) => {
    if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) return false;
    const cell = grid[gy][gx];
    if (cell === 0) return true;
    if (isGoal && gx === goal.gx && gy === goal.gy) return true;
    return false;
  };

  if (start.gx === goal.gx && start.gy === goal.gy) {
    return [goalPx];
  }

  // BFS
  const key = (gx: number, gy: number) => gy * GRID_W + gx;
  const visited = new Set<number>();
  const parent = new Map<number, number>();
  const queue: GridPoint[] = [start];
  visited.add(key(start.gx, start.gy));

  let found = false;

  while (queue.length > 0) {
    const curr = queue.shift()!;

    if (curr.gx === goal.gx && curr.gy === goal.gy) {
      found = true;
      break;
    }

    for (const [dx, dy] of DIRS) {
      const nx = curr.gx + dx;
      const ny = curr.gy + dy;
      const nk = key(nx, ny);

      if (!visited.has(nk) && isWalkable(nx, ny, true)) {
        visited.add(nk);
        parent.set(nk, key(curr.gx, curr.gy));
        queue.push({ gx: nx, gy: ny });
      }
    }
  }

  if (!found) {
    // No path — just go directly (fallback)
    return [goalPx];
  }

  // Reconstruct path
  const path: GridPoint[] = [];
  let ck = key(goal.gx, goal.gy);
  while (ck !== key(start.gx, start.gy)) {
    const gy = Math.floor(ck / GRID_W);
    const gx = ck % GRID_W;
    path.unshift({ gx, gy });
    const pk = parent.get(ck);
    if (pk === undefined) break;
    ck = pk;
  }

  // Convert to pixel waypoints (tile centers), with the final point being the exact goal
  const waypoints: Point[] = path.map((p, i) => {
    if (i === path.length - 1) return goalPx;
    return { x: p.gx * TILE + TILE / 2, y: p.gy * TILE + TILE / 2 };
  });

  // Smooth: skip waypoints when there's line-of-sight to a later one
  return smoothPath(grid, waypoints);
}

/**
 * Smooth a path using line-of-sight checks — skip intermediate waypoints
 * when you can walk directly to a later one. Produces natural diagonal movement.
 */
function smoothPath(grid: CellType[][], points: Point[]): Point[] {
  if (points.length <= 2) return points;

  const result: Point[] = [points[0]];
  let current = 0;

  while (current < points.length - 1) {
    // Try to skip ahead as far as possible
    let furthest = current + 1;
    for (let i = points.length - 1; i > current + 1; i--) {
      const fromG: GridPoint = {
        gx: Math.floor(points[current].x / TILE),
        gy: Math.floor(points[current].y / TILE),
      };
      const toG: GridPoint = {
        gx: Math.floor(points[i].x / TILE),
        gy: Math.floor(points[i].y / TILE),
      };
      if (hasLineOfSight(grid, fromG, toG)) {
        furthest = i;
        break;
      }
    }
    result.push(points[furthest]);
    current = furthest;
  }

  return result;
}
