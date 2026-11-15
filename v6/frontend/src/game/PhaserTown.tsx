import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import type { LogEntry, WorldState } from '../types';
import { TownScene, WORLD_H, WORLD_W } from './TownScene';

interface Props {
  state: WorldState | null;
  entries: LogEntry[];
  version: number;
  animMs: number;
  selected: string | null;
  onSelect: (id: string) => void;
}

export function PhaserTown({ state, entries, version, animMs, selected, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<TownScene | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const town = new TownScene();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      width: WORLD_W,
      height: WORLD_H,
      backgroundColor: '#8cc06b',
      pixelArt: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      scene: town,
      banner: false,
    });
    town.setSelectHandler((id) => onSelectRef.current(id));
    scene.current = town;
    return () => {
      scene.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    if (state && scene.current) scene.current.sync(state, entries, animMs);
    // 只有在新的模擬結果到達時（version 改變）才同步畫面
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  useEffect(() => {
    scene.current?.setSelected(selected);
  }, [selected]);

  return <div className="map-host" ref={host} data-testid="town-map" />;
}
