# Portable speaker metadata

Approved scope: daily transcription names move to `<job-id>.metadata.json` in each job's recorded output directory. Benchmark annotations, raw results, stable IDs and audio remain unchanged.

1. Add guarded durable sidecar/export module; distinguish missing from invalid metadata. Existing sidecars win.
2. Serialize migration, rename and worker persistence in immediate SQLite transactions. Remove database mappings only after sidecar and derived export are durable; ignore stale incoming mappings.
3. Hydrate details from sidecars, retaining SQLite mappings on migration failure. Refresh/create missing speaker exports, without creating unavailable output directories.
4. Test restart/idempotency, failures, stale saves and text refresh; run tests, typecheck and lint.
5. Coordinate live service, take private SQLite backup, migrate, report counts/paths without private content. Parent session verifies browser.

Metadata is authoritative if a crash separates metadata/text writes. Reads repair derived text before removing legacy mappings. Protected backups intentionally retain historical mappings. Filesystem guards match existing app safety, not a sandbox against malicious concurrent directory replacement.

## Execution

- Implemented synchronous filesystem operations inside the existing immediate SQLite transaction to order cross-process migration, rename and stale worker writes. Names are omitted from future job serialization; failed migrations retain the original database value.
- New sidecars contain version, job ID and validated speaker names. New/replaced files use mode 0600, atomic same-directory replacement, file/directory fsync and symlink guards. No working audio or raw result writes were added.
- Live service was idle (three jobs, one completed result, no running jobs). A private consistent SQLite backup was taken before explicit maintenance. At that inspection there were already zero SQLite speaker-name fields; explicit maintenance checked one completed job, reported zero legacy mappings migrated and zero failures, and a repeat reported the same. No transcript contents or private speaker names were printed.
- The running Nuxt dev service remains running; browser verification is delegated to the parent session. No commits or pushes.
