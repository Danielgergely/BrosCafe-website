import { useEffect, useState } from "react";

import { api } from "@/lib/api";

/** Fetch one admin endpoint once. `null` while loading. */
export function useAdminData(path) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get(path)
      .then(({ data: payload }) => active && setData(payload))
      .catch(() => active && setData(false));
    return () => {
      active = false;
    };
  }, [path]);

  return data;
}
