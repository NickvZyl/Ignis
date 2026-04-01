'use client';

import { useRoomStore } from '@web/stores/room-store';
import { FURNITURE_DEFS } from '@web/lib/room-grid';

const THUMB_SIZE = 48;

function FurnitureThumb({ id }: { id: string }) {
  const def = FURNITURE_DEFS[id];
  const src = def?.hiResSprites?.[0];
  if (!src) {
    return (
      <div
        style={{ width: THUMB_SIZE, height: THUMB_SIZE, background: 'rgba(100,100,200,0.2)', borderRadius: 4 }}
        className="flex items-center justify-center text-[6px] text-gray-500 shrink-0"
      >
        {id}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={def?.label ?? id}
      style={{ width: THUMB_SIZE, height: THUMB_SIZE, objectFit: 'contain', imageRendering: 'auto' }}
      className="shrink-0"
    />
  );
}

export default function FurnitureInventory() {
  const { layout, inventory, mode, placing, startPlacing, cancelPlacing, removeFromRoom } = useRoomStore();

  if (mode !== 'edit') return null;

  return (
    <div
      className="flex flex-col gap-2 px-2 py-2 rounded"
      style={{
        fontFamily: "'Press Start 2P', monospace",
        background: 'rgba(0,0,0,0.85)',
        maxHeight: 480,
        overflowY: 'auto',
        width: 160,
      }}
    >
      {/* Placed */}
      <div className="text-[7px] tracking-wider text-gray-400 uppercase">Placed</div>
      {layout.furniture.map(f => {
        const def = FURNITURE_DEFS[f.id];
        return (
          <div key={f.id} className="flex items-center gap-1">
            <FurnitureThumb id={f.id} />
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span className="text-[6px] text-white truncate">{def?.label ?? f.id}</span>
              {!def?.required && <button
                onClick={() => removeFromRoom(f.id)}
                className="text-[6px] text-red-400 hover:text-red-300 text-left"
              >
                REMOVE
              </button>}
            </div>
          </div>
        );
      })}

      {/* Inventory */}
      {inventory.length > 0 && (
        <>
          <div className="text-[7px] tracking-wider text-gray-400 uppercase mt-1 border-t border-gray-700 pt-1">
            Inventory
          </div>
          {inventory.map(id => {
            const def = FURNITURE_DEFS[id];
            if (!def) return null;
            const isPlacing = placing === id;
            return (
              <div key={id} className="flex items-center gap-1">
                <FurnitureThumb id={id} />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-[6px] text-gray-300 truncate">{def.label}</span>
                  {isPlacing ? (
                    <button
                      onClick={cancelPlacing}
                      className="text-[6px] text-amber-400 hover:text-amber-300 text-left"
                    >
                      CANCEL
                    </button>
                  ) : (
                    <button
                      onClick={() => startPlacing(id)}
                      className="text-[6px] text-green-400 hover:text-green-300 text-left"
                    >
                      PLACE
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {placing && (
        <div className="text-[6px] text-amber-400 text-center mt-1">
          CLICK ROOM TO PLACE
        </div>
      )}
    </div>
  );
}
