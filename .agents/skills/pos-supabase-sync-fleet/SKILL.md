---
name: pos-supabase-sync-fleet
description: Architectural and operational guide for optional Supabase cloud replication, multi-terminal sync, Row Level Security (RLS) policies, catalog push, and offline fallback queue in EA POS.
---

# EA POS — Supabase Cloud Sync & Fleet Operations

EA POS functions 100% offline out of the box using local IndexedDB. To enable multi-register sync, central back-office monitoring, or multi-store fleet management, it integrates with Supabase.

## 📚 Detailed Sub-References

- **Supabase Schema & RLS Security Policy Specification**: [references/rls-and-schema-reference.md](references/rls-and-schema-reference.md)

---

## ☁️ Architecture & Synchronization (`src/lib/supabase.ts` & `src/lib/sync.ts`)

- **Local First**: Reads and writes complete against IndexedDB instantaneously.
- **Background Sync**: Mutations append to sync queue and flush to Supabase Postgres.
- **Realtime Listener**: Listens to changes via WebSocket subscriptions and updates IndexedDB state.

---

## 🚚 Catalog Push Engine (`src/lib/catalogPush.ts`)

Store managers can push updated products, prices, and categories from a master terminal to all satellite terminals in bulk using `catalogPush.ts`.
