// Test environment shims.
//
// The persisted stores write through idb-keyval, which needs IndexedDB. Node
// has none, so every store touched in a test fired an unhandled rejection per
// write — hundreds of them, drowning any real failure in noise while the tests
// themselves still passed.
//
// `fake-indexeddb/auto` installs an in-memory implementation on globalThis, so
// the stores exercise their REAL persistence path rather than having it stubbed
// out. That matters: `partialize` (which strips the Supabase device password),
// `merge` (which re-derives a restored 'connected' status) and the seed-fixture
// gates all live in the persist config, and a stubbed storage would test around
// them instead of through them.
import 'fake-indexeddb/auto';
