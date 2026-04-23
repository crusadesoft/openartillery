import { useEffect, useRef, useState } from "react";
import { WEAPONS, type WeaponId } from "@artillery/shared";
import type { ServerEvent } from "@artillery/shared";

interface Entry {
  id: number;
  killer: string | null;
  victim: string;
  weapon: WeaponId | null;
  expiresAt: number;
}

let idSeq = 1;

export function KillFeed({
  event,
}: {
  event: Extract<ServerEvent, { type: "kill" }> | null;
}): JSX.Element {
  const [entries, setEntries] = useState<Entry[]>([]);
  const lastSeen = useRef<Extract<ServerEvent, { type: "kill" }> | null>(null);

  useEffect(() => {
    if (event && event !== lastSeen.current) {
      lastSeen.current = event;
      setEntries((prev) =>
        [
          ...prev,
          {
            id: idSeq++,
            killer: event.killerName,
            victim: event.victimName,
            weapon: event.weapon,
            expiresAt: Date.now() + 6000,
          },
        ].slice(-5),
      );
    }
  }, [event]);

  useEffect(() => {
    const t = window.setInterval(() => {
      const now = Date.now();
      setEntries((prev) => prev.filter((e) => e.expiresAt > now));
    }, 500);
    return () => window.clearInterval(t);
  }, []);

  if (entries.length === 0) return <></>;
  return (
    <div className="kill-feed">
      {entries.map((e) => (
        <div key={e.id} className="row">
          {e.killer ? (
            <>
              <span className="killer">{e.killer}</span>
              <span className="ico">›</span>
              <span className="weapon">{e.weapon ? WEAPONS[e.weapon].name : "—"}</span>
              <span className="ico">›</span>
              <span className="victim">{e.victim}</span>
            </>
          ) : (
            <>
              <span className="ico">☠</span>
              <span className="victim">{e.victim}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
