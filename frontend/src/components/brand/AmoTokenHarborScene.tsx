'use client';

import { useEffect, useRef, useState } from 'react';
import { HarborBoat } from './harbor-boat';
import { createHarborFleet, createSeededRandom } from './harbor-fleet';
import './amotoken-harbor.css';

const STUDIO_FLEET = createHarborFleet(3, createSeededRandom(20260720));

export function AmoTokenHarborScene() {
  const [reduced, setReduced] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = Math.max(-1, Math.min(1, (event.clientX / window.innerWidth) * 2 - 1)) * 7;
        const y = Math.max(-1, Math.min(1, (event.clientY / window.innerHeight) * 2 - 1)) * 3;
        sceneRef.current?.style.setProperty('--harbor-pointer-x', `${x}px`);
        sceneRef.current?.style.setProperty('--harbor-pointer-y', `${y}px`);
      });
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
    };
  }, [reduced]);

  return (
    <div
      aria-hidden="true"
      className="amotoken-studio-harbor"
      data-motion={reduced ? 'reduced' : 'full'}
      data-testid="amotoken-harbor-scene"
      ref={sceneRef}
    >
      <div className="amotoken-studio-wave is-back" />
      {STUDIO_FLEET.map((boat, index) => (
        <div
          className={`amotoken-studio-boat is-${['far', 'middle', 'near'][index]}`}
          data-harbor-boat
          key={`${boat.rarity}-${index}`}
        >
          <HarborBoat spec={boat} />
        </div>
      ))}
      <div className="amotoken-studio-wave is-front" />
    </div>
  );
}
