<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Title: Repository write boundaries -->

# Repository write boundaries

Repository bulk writes are atomic by default. Keep that default: opting into
chunking is a correctness decision, not a performance toggle.

## Choose the boundary explicitly

- Use an atomic write only when all records must commit or roll back together
  and the caller proves the collection fits the deployed store's transaction
  limit.
- Use a chunked write only when partial progress is safe. The operation must be
  idempotent and restartable because an earlier chunk may commit before a later
  chunk fails.
- If a collection exceeds the store limit but still requires one transaction,
  redesign the aggregate or migration. Do not silently chunk it.

This decision covers the complete call graph. A migration is not safe merely
because its own file uses chunked writes; imported cutover, reset, and helper
code must make the same choice.

## Offline migrations

Cosmos transactional batches accept at most 100 operations. Migration writes
that can exceed that bound must use the explicit chunked repository operation.
The standard chunk size is 100 unless a smaller backend or workload limit is
known.

Offline rehearsal uses a production snapshot copied into SQLite. SQLite does
not naturally reproduce Cosmos's 100-operation ceiling, so rehearsal mode must
apply the Cosmos atomic-write limit to SQLite. This preserves read-only Cosmos
access while detecting oversized atomic writes anywhere in the migration call
graph.

CLI migrations express the choice through dedicated `saveAtomically` and
`saveInChunks` operations from the migration-repository helper. Do not call
repository `save` or `saveAndPublish` directly from a migration or a
migration-only helper. A custom chunk size must state a workload-specific
reason; otherwise use the 100-item default.

Do not rely only on source checks for `saveAndPublish`: imported helpers and an
unqualified bulk `save` can cross the same boundary at runtime.

## Store differences

- **Cosmos:** one transactional batch, hard limit of 100 operations.
- **SQLite:** one SQL transaction with no equivalent 100-operation limit.
- **PostgreSQL:** the current adapter executes per-record statements inside one
  SQL transaction. It has no Cosmos-style 100-operation cap and is not a
  continuous stream. Large transactions still increase lock duration, WAL,
  rollback cost, and timeout risk.

A future PostgreSQL move may change the appropriate chunk size, but not the API
contract: atomic and chunked writes remain different correctness choices.
