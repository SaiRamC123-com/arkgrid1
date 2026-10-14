import { useCallback, useEffect, useState } from "react";
import { getQueue, onQueueChange } from "../offline/queue";

export default function useQueue(uid) {
  const [items, setItems] = useState([]);
  const refresh = useCallback(async () => setItems(await getQueue(uid)), [uid]);

  useEffect(() => {
    refresh();
    return onQueueChange(refresh);
  }, [refresh]);

  return { items, pending: items.length };
}