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

/** On a 409, fetches the newest document and its version as one snapshot before reloading. */
export async function recoverVersionConflict(
  readLatest: () => Promise<{ data: VersionedAppDataRow; error: unknown | null }>,
  applySnapshot: (snapshot: VersionedAppDataSnapshot) => void,
  reload: () => void,
): Promise<void> {
  try {
    const latest = await readLatest();
    if (!latest.error) applySnapshot(readVersionedAppData(latest.data));
  } finally {
    reload();
  }
}
