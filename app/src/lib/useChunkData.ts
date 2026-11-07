import { useEffect, useState } from 'react';
import { isChunkDataLoaded, loadChunkData, type ChunkLevel } from '@/lib/chunkMarks';

/** 켜져 있을 때 사전계산 데이터를 지연 로드하고, 로드되면 다시 렌더링한다. */
export function useChunkData(level: ChunkLevel): void {
  const [, bump] = useState(0);
  const need = level === 'on' && !isChunkDataLoaded();
  useEffect(() => {
    if (!need) return;
    let alive = true;
    void loadChunkData().then(() => {
      if (alive) bump((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [need]);
}
