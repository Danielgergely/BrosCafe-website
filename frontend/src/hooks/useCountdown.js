import { useEffect, useState } from "react";

import { OPENING } from "@/config/site";
import { api } from "@/lib/api";

/**
 * Countdown to the grand opening, corrected against server time so a wrong
 * device clock can't unlock it early. Falls back to the configured date offline.
 *
 * @param {number} tickMs how often to recompute (1000 for a seconds display)
 */
export function useCountdown(tickMs = 1000) {
  const [target, setTarget] = useState(null);
  const [skew, setSkew] = useState(0); // server now - client now
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    api
      .get("/opening/status")
      .then(({ data }) => {
        if (!active) return;
        setSkew(new Date(data.server_time).getTime() - Date.now());
        setTarget(new Date(data.opening_time).getTime());
      })
      .catch(() => active && setTarget(OPENING.fallbackTime));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);

  const resolvedTarget = target ?? OPENING.fallbackTime;
  const remaining = Math.max(0, resolvedTarget - (now + skew));
  return {
    ready: target !== null,
    isOpen: remaining === 0,
    days: Math.floor(remaining / 86400000),
    hours: Math.floor((remaining % 86400000) / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    seconds: Math.floor((remaining % 60000) / 1000),
  };
}
