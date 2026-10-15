export type VersionedAppDataSnapshot = {
  data: string | null;
  version: number | null;
};

type VersionedAppDataRow = { data?: unknown; version?: unknown } | null;

export function readVersionedAppData(row: VersionedAppDataRow): VersionedAppDataSnapshot {
  return {
    data: typeof row?.data === "string" ? row.data : null,
    version: typeof row?.version === "number" && Number.isSafeInteger(row.version) && row.version >= 1
      ? row.version
      : null,
  };
}

/** Enqueues a save but prevents both new and already-queued saves after a 409. */
export function queueSaveUnlessConflicted<T>(
  queue: { current: Promise<void> },
  conflict: { current: boolean },
  send: () => Promise<T>,
  blockedResult: T,
): Promise<T> {
  if (conflict.current) return Promise.resolve(blockedResult);

  const task = queue.current.then(async () => {
    if (conflict.current) return blockedResult;
    return send();
  });
  queue.current = task.then(() => undefined, () => undefined);
  return task;
}

/** On a 409, reload immediately; the page load reads data and version together. */
export async function recoverVersionConflict(reload: () => void): Promise<void> {
  reload();
}
