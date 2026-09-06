# Menu completeness: categories, modifiers, stock, CSV

**Estimated effort: 19 engineer-days · 7 work items**

The menu is currently write-mostly: categories can be created but never renamed, hidden, reordered or deleted; the half/full-plate and add-on tables have sat unused since migration 0001; re-uploading a corrected CSV silently doubles the menu; and stock counts never move because `decrementForOrder` is called from nowhere. For a cafe this is the difference between a menu the owner can actually run a service from and one they have to work around — typo'd categories stuck on every table's QR code forever, "Paneer (Half)" duplicated as its own item, and samosas that keep selling three hours after they ran out. This plan adds category lifecycle + explicit ordering, real modifiers priced into the bill and snapshotted onto the order, an idempotent transactional CSV import with bulk recovery, atomic stock reservation inside the order transaction with per-line sold-out feedback on both the diner and counter surfaces, and the audit + cache-invalidation hygiene the menu write path is missing.

---

<a id="category-lifecycle"></a>

## 🔴 `category-lifecycle` — Category rename / hide / delete / reassign, and moving an item between categories

### Approach

Pointers verified and correct. `MenuRepository` (apps/api/src/repositories/menu.ts:43-51) exposes only `createCategory` — no find, update or delete. The POST sits at apps/api/src/routes/menu.ts:104 with no PATCH/DELETE sibling. `EditItemForm`'s patch body (menu-editor.tsx:516-527) omits `categoryId` even though the route already validates and applies it (routes/menu.ts:262-269).

ONE CORRECTION to the audit: hiding needs no new column and no new write path. `menuCategories.isActive` already exists (packages/db/src/schema/menu.ts:24), is already on the `MenuCategory` type, and is already returned by `getFullMenu` — it is simply never read. Hiding is a READ-path gap: nothing filters on it. So `PATCH { isActive: false }` plus a filter in the two diner/counter read paths is the whole fix.

Repo additions (apps/api/src/repositories/menu.ts):
  findCategory(categoryId, cafeId): Promise<MenuCategory | null>
  findCategoryByName(cafeId, name): Promise<MenuCategory | null>   // lower(trim()) match; reused by the importer
  countItemsInCategory(categoryId, cafeId): Promise<number>
  updateCategory(categoryId, cafeId, patch: UpdateMenuCategory): Promise<MenuCategory | null>
  deleteCategory(categoryId, cafeId, opts?: { reassignTo?: string }): Promise<'deleted' | 'not_found' | 'not_empty'>
  findItemById(itemId, cafeId): Promise<MenuItem | null>          // also needed by the audit work item
where `UpdateMenuCategory = { name?: string; sortOrder?: number; isActive?: boolean }`. Every statement is scoped `and(eq(id), eq(cafeId))`.

`deleteCategory` runs in one `db.transaction`: if `reassignTo` is given, verify it belongs to this cafe and !== categoryId, then `update menu_items set category_id = <reassignTo> where category_id = <id> and cafe_id = <cafe>`, then delete the category row. With no `reassignTo` and a non-zero item count, return 'not_empty' having written nothing. Deleting items wholesale is deliberately NOT offered here — that is the bulk-delete affordance in csv-import-idempotency.

Duplicate names are rejected at the application layer (case- and whitespace-insensitive), NOT by a DB unique index: adding `unique(cafe_id, lower(name))` would fail the migration on any cafe that already has 'Starters' and 'starters ' from this very bug. See risks.

Read path: apps/api/src/routes/public.ts:78-81 filters `c.isActive` before the existing `i.isAvailable` filter; order-builder.tsx's `liveCategories` (:313-318) does the same. The owner's `/menu` keeps returning inactive categories so the editor can show and un-hide them.

### Schema

None. `menu_categories.is_active boolean not null default true` and `menu_categories.sort_order integer not null default 0` already exist (packages/db/src/schema/menu.ts:23-24; migration 0001). No migration, no backfill.

### API

PATCH /cafes/:cafeId/menu/categories/:categoryId  (bearer auth)
  body (all optional, at least one required): { name?: string trim 1..80, sortOrder?: int >= 0, isActive?: boolean }
  200 { category: MenuCategory }
  400 { error: { code: 'VALIDATION_ERROR', message: 'Provide name, sortOrder and/or isActive' } }  — empty body
  404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } }      — cafe not owned by caller (never 403)
  404 { error: { code: 'NOT_FOUND', message: 'Category not found' } }
  409 { error: { code: 'DUPLICATE_CATEGORY', message: 'A category named "Starters" already exists', details: { categoryId: '<existing>' } } }

DELETE /cafes/:cafeId/menu/categories/:categoryId?reassignTo=<uuid>   (bearer auth)
  204 no body
  400 { error: { code: 'INVALID_CATEGORY', message: 'Category does not belong to this cafe' } }  — reassignTo foreign, or equal to :categoryId
  404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' | 'Category not found' } }
  409 { error: { code: 'CATEGORY_NOT_EMPTY', message: '"Winter Specials" still has 12 items', details: { itemCount: 12 } } }

Both handlers `await cache.del(cacheKey('menu', cafeId, 'full'))` on success, matching routes/menu.ts:279.
No change to PATCH /cafes/:cafeId/menu/items/:itemId — `categoryId` is already accepted (routes/menu.ts:64, 262-269); only the web client stops omitting it.
packages/types/src/api.ts gains `UpdateMenuCategoryRequest` and reuses the existing `MenuCategoryResponse`.

### Web

apps/web/src/app/cafes/[id]/menu/menu-editor.tsx
  - CardHeader (:158-174): add a kebab/overflow button next to "Add item" opening Rename / Hide (or Show) / Delete. Rename swaps the CardTitle for an inline Input + tick (Escape cancels, Enter submits PATCH { name }).
  - Hide fires PATCH { isActive: !isActive }; a hidden card renders at 60% opacity with a "Hidden" pill and the copy "Not shown on the QR menu".
  - Delete opens the existing ConfirmDialog (the component used at :451-459). When `cat.items.length > 0` the dialog body swaps to a required <select> "Move 12 items to…" listing this cafe's other categories, and sends `?reassignTo=<id>`; with zero items it is a plain confirm.
  - Local state: `patchCategory(id, patch)` and `removeCategory(id)` beside the existing `patchItem`/`removeItem` (:107-120). On reassign, move the item array into the target category client-side.
  - EditItemForm (:464-542): add a `categoryId` state seeded from `item.categoryId`, a "Category" <select> beside the name field, and `categoryId` in the PATCH body at :516-527. The parent must move the item between category arrays when it changes — extend `onSaved` to `(patch, fromCategoryId)`.
apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx — `liveCategories` (:313-318) also filters `c.isActive`.

### Tests

apps/api/src/routes/menu.test.ts (extend the existing buildTestApp + createMockMenuRepo pattern; add updateCategory/deleteCategory/findCategory/countItemsInCategory/findItemById to the mock so it still `satisfies MenuRepository`):
  'PATCH category > 404s when the cafe is owned by someone else'
  'PATCH category > 404s when the category is not in this cafe'
  'PATCH category > renames a category and returns the updated row'
  'PATCH category > 400s on an empty patch body'
  'PATCH category > 409 DUPLICATE_CATEGORY on a case-insensitive collision with another category'
  'PATCH category > allows a case-only rename of the same category'
  'PATCH category > sets isActive false to hide a category'
  'DELETE category > 204s for an empty category'
  'DELETE category > 409 CATEGORY_NOT_EMPTY with itemCount when items remain'
  'DELETE category > 204s and reassigns items when reassignTo is a category in this cafe'
  'DELETE category > 400 INVALID_CATEGORY when reassignTo is not in this cafe'
  'DELETE category > 400 INVALID_CATEGORY when reassignTo equals the category being deleted'
  'DELETE category > 404s for another owner's cafe'
apps/api/src/routes/public.test.ts:
  'GET /public/cafes/:slug > omits categories with isActive false'
  'GET /public/cafes/:slug > still returns an active category whose items are all unavailable as empty'
apps/web/src/app/cafes/[id]/menu/menu-editor.test.tsx (new; RTL + jsdom are already configured in apps/web/vitest.config.mts):
  'MenuEditor > rename submits PATCH with the trimmed new name and updates the header'
  'MenuEditor > delete of a non-empty category requires a move-to selection before confirming'
  'MenuEditor > hide toggles isActive and marks the card Hidden'
  'EditItemForm > includes categoryId in the PATCH body when the category select changes'
  'EditItemForm > moves the row into the target category card after a successful save'

### Files

- `apps/api/src/repositories/menu.ts`
- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/menu.test.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `packages/types/src/api.ts`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.test.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`

---

<a id="menu-ordering"></a>

## 🟠 `menu-ordering` — Explicit category and item ordering: bulk reorder endpoints, up/down controls, importer sort order

### Approach

Pointers verified. The read path already honours ordering — `getFullMenu` sorts `asc(sortOrder), asc(name)` for both categories and items (apps/api/src/repositories/menu.ts:61,66) — and the write path already accepts `sortOrder` (routes/menu.ts:28,63). Nothing in the web app has ever sent a non-zero value, and the importer hard-codes 0 at routes/menu.ts:210 and :230, so every row ties at 0 and the `asc(name)` tiebreaker takes over. That is exactly why the diner sees Beverages, Desserts, Mains, Starters.

Use POST (not PATCH) for the two reorder endpoints so they cannot collide with the `PATCH …/categories/:categoryId` and `PATCH …/items/:itemId` param routes under any router-matching assumption.

Always send a FULLY NORMALISED sequence, never a single swap: the client posts the complete ordered id list for the scope and the server writes `sortOrder = index`. This makes ties structurally impossible and makes the operation idempotent, so a retried request is harmless.

Repo (apps/api/src/repositories/menu.ts), each one transaction, each one statement:
  reorderCategories(cafeId, categoryIds: string[]): Promise<number>
    update menu_categories c set sort_order = v.pos
      from (values ($1::uuid,0),($2::uuid,1),…) v(id, pos)
     where c.id = v.id and c.cafe_id = $cafeId
  reorderItems(cafeId, categoryId, itemIds: string[]): Promise<number>
    same shape, additionally scoped `and i.category_id = $categoryId`
Both return the updated row count; the route 400s `INVALID_ORDER` when it differs from `ids.length`, which catches a foreign id, a duplicate id, and an item from another category in one check — and guarantees no cross-tenant write, because the cafeId predicate is in the statement itself.

Importer: replace the hard-coded zeros. New categories get `sortOrder = <count of categories known so far>` in first-seen CSV order; items get a running per-category index, so the spreadsheet's own order survives the import instead of being alphabetised.

AddItemForm sends `sortOrder: <current item count in that category>` so a new item appends to the bottom rather than landing at 0 and jumping to the top of an alphabetical tie.

### Schema

No column changes. Optional additive index in a new drizzle migration (0013 or later, whichever this lands as):
  index('menu_items_cafe_category_sort_idx').on(menuItems.cafeId, menuItems.categoryId, menuItems.sortOrder)
`menu_categories_cafe_sort_idx` on (cafe_id, sort_order) already exists (packages/db/src/schema/menu.ts:33). Additive, backward-compatible, no backfill.

### API

POST /cafes/:cafeId/menu/categories/reorder  (bearer auth)
  body { categoryIds: string[] (uuid, 1..200, no duplicates) }   // index in the array IS the new sortOrder
  200 { categories: MenuCategory[] }        // the cafe's categories re-read in the new order
  400 { error: { code: 'INVALID_ORDER', message: 'One or more categories are not in this cafe', details: { expected: 7, updated: 6 } } }
  404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } }

POST /cafes/:cafeId/menu/items/reorder  (bearer auth)
  body { categoryId: string uuid, itemIds: string[] (uuid, 1..500, no duplicates) }
  200 { items: MenuItem[] }                 // that category's items in the new order
  400 { error: { code: 'INVALID_CATEGORY', message: 'Category does not belong to this cafe' } }
  400 { error: { code: 'INVALID_ORDER', message: 'One or more items are not in this category', details: { expected: 12, updated: 11 } } }
  404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } }

Both bust the menu cache key on success.
POST /cafes/:cafeId/menu/import — response shape unchanged here; only the sortOrder values written change.
packages/types/src/api.ts gains `ReorderCategoriesRequest`, `ReorderItemsRequest`.

### Web

apps/web/src/app/cafes/[id]/menu/menu-editor.tsx
  - Category CardHeader (:158-174): a ▲/▼ pair left of the title. ▲ disabled on the first card, ▼ on the last. Click reorders `categories` state optimistically, then POSTs the full normalised id list; on failure restore the pre-click array and toast. Deliberately buttons, not drag-and-drop — no new dependency, works on a cafe iPad, and is keyboard/screen-reader operable out of the box.
  - ItemRow (:304-425): the same ▲/▼ pair in the row's action cluster, before the availability switch, posting { categoryId, itemIds }.
  - AddItemForm (:824-832): include `sortOrder` in the POST body; pass the category's current item count in as a prop.
  - Both handlers debounce at 400ms and coalesce rapid clicks into one request carrying the final order.
No change needed to the diner or counter renderers — they already consume server order.

### Tests

apps/api/src/routes/menu.test.ts:
  'POST categories/reorder > writes sortOrder 0..n-1 in the submitted order'
  'POST categories/reorder > 400 INVALID_ORDER when an id is not in this cafe'
  'POST categories/reorder > 400 INVALID_ORDER on a duplicated id'
  'POST categories/reorder > 404s for another owner's cafe'
  'POST items/reorder > writes sortOrder 0..n-1 within the given category only'
  'POST items/reorder > 400 INVALID_CATEGORY when the category is not in this cafe'
  'POST items/reorder > 400 INVALID_ORDER when an item belongs to a different category'
  'POST items/reorder > 404s for another owner's cafe'
  'POST /menu/import > assigns new categories sortOrder in first-seen CSV order'
  'POST /menu/import > assigns items sortOrder by their position within their category'
  'POST /menu/import > continues category sortOrder past the cafe's existing maximum'
apps/web/src/app/cafes/[id]/menu/menu-editor.test.tsx:
  'MenuEditor > moving the second category up posts the swapped full id list'
  'MenuEditor > disables the up control on the first category and down on the last'
  'MenuEditor > restores the previous order and toasts when the reorder request fails'
  'AddItemForm > posts sortOrder equal to the category's current item count'

### Files

- `apps/api/src/repositories/menu.ts`
- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/menu.test.ts`
- `packages/types/src/api.ts`
- `packages/db/src/schema/menu.ts`
- `packages/db/drizzle/migrations`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.test.tsx`

---

<a id="menu-write-audit-and-cache"></a>

## 🟠 `menu-write-audit-and-cache` — Audit trail for menu price/name/86/delete, and the AI console's missing cache bust

### Approach

Both pointers verified and both correct.

Audit: apps/api/src/routes/menu.ts imports no audit module and writes no entries; apps/api/src/routes/orders.ts:109 (`opts.auditRepository ?? createDrizzleAuditLogsRepo(app.db)`) is the injection pattern to copy verbatim, and orders.ts:337 / :428 are the shape to copy for the record calls.

Cache: `grep -n cache apps/api/src/routes/ai-console.ts` returns nothing — the file has no cache import at all, so `set_item_availability` (:212) leaves `menu:<cafeId>:full` warm for the rest of its 60s TTL (set at routes/menu.ts:100). One precision the audit narrative gets slightly wrong: the web layer is NOT the stale part — `serverFetch` already passes `cache: 'no-store'` (apps/web/src/lib/api-server.ts:31), so the entire stale window is the API's own Redis entry. The fix is exactly `await cache.del(cacheKey('menu', cafeId, 'full'))` after the successful `menuRepo.updateItem`, mirroring routes/menu.ts:279.

Menu audit design:
  - Add `auditRepository?: AuditLogsRepository` to `MenuRoutesOptions`, defaulted the same way orders.ts does.
  - The PATCH handler reads the current item with `menuRepo.findItemById` (added in category-lifecycle) BEFORE updating, then diffs four audited fields: basePricePaise, name, gstRateBpOverride, isAvailable. Description, image, HSN, spice, diet flags and sortOrder are not audited — they are not a fraud or dispute surface and would drown the log.
  - ONE entry per PATCH, not one per field. The action is `menu.item.price_changed` when basePricePaise moved (so the classic counter-fraud vector is filterable through the existing `AuditLogListOptions.action` filter at apps/api/src/repositories/audit-logs.ts:84), otherwise `menu.item.updated`. Either way metadata carries the full diff: `{ changes: { basePricePaise: { before, after }, name: { before, after }, … } }`. No entry at all when nothing audited changed.
  - DELETE reads the item first and records `menu.item.deleted` with name, basePricePaise and categoryId, so a deletion used to hide sales can still be reconciled against `order_items.item_name_snapshot`.
  - Category rename and delete (from category-lifecycle) record `menu.category.renamed` and `menu.category.deleted` (metadata: name, itemCount, reassignedTo).
  - Ordering: write the audit AFTER the successful mutation and BEFORE the cache del. Wrap `auditRepo.record` in try/catch + `app.log.error` — the menu write is already committed, and 500-ing a completed price change would leave the DB and the response disagreeing and the counter stuck. Deliberate availability-over-completeness call; state it in a comment.

AI console: import `{ cacheKey, getCache }`, hold `const cache = getCache()` at the top of `aiConsoleRoutes` beside the repos, and in `set_item_availability` bust the key after a successful update. Also record `menu.item.availability_changed` there with `metadata.via: 'ai_console'`. Use `actorType: 'owner'` with `actorId: request.user.id` — `AuditActorType` is `'owner' | 'staff' | 'system'` (packages/types/src/staff.ts:53) and the DB column is an enum (packages/db/src/schema/audit-logs.ts:21); do NOT widen it for an 'ai' value, because the owner authorised the change through their own authenticated session and the `via` metadata already records the channel. Give the menu editor's own toggle the same action with `via: 'menu_editor'` so the two channels are comparable.

### Schema

None. `audit_logs` already carries cafeId, actorType, actorId, actorName, action, entityType, entityId, summary, metadata jsonb (packages/db/src/schema/audit-logs.ts). No enum change — see the actorType note above.

### API

No request or response shapes change. The affected endpoints and their new side effects:
  PATCH  /cafes/:cafeId/menu/items/:itemId   → writes menu.item.price_changed | menu.item.updated (entityType 'menu_item', entityId itemId) when an audited field moved; 200 { item } unchanged
  DELETE /cafes/:cafeId/menu/items/:itemId   → writes menu.item.deleted; 204 unchanged
  PATCH  /cafes/:cafeId/menu/categories/:categoryId → menu.category.renamed (entityType 'menu_category')
  DELETE /cafes/:cafeId/menu/categories/:categoryId → menu.category.deleted
  POST   /cafes/:cafeId/ai-console (tool set_item_availability) → deletes menu:<cafeId>:full AND writes menu.item.availability_changed; response unchanged
These actions become filterable through the existing GET /cafes/:cafeId/audit-logs?action=menu.item.price_changed.

### Web

None required for the API behaviour. Optional one-line addition: add the new `menu.*` actions to whatever action-label map the audit log viewer uses, so entries render with a human label rather than the raw key.

### Tests

Route tests today never exercise the cache — REDIS_URL is unset in tests so `getCache()` returns the no-op (apps/api/src/lib/cache.ts:55-57). Reuse the exact mocking recipe from apps/api/src/lib/cache.test.ts:5-25: `vi.hoisted` mock state + `vi.mock('ioredis', () => ({ Redis: redisMocks.RedisMock }))` + `vi.stubEnv('REDIS_URL', 'redis://localhost:6379')` + `vi.resetModules()` in beforeEach, then assert on `redisMocks.del`.

apps/api/src/routes/menu.test.ts:
  'PATCH item > records menu.item.price_changed with before and after paise when the price changes'
  'PATCH item > records menu.item.updated (not price_changed) when only the name changes'
  'PATCH item > records a single entry when price and name change together, with both in changes'
  'PATCH item > records no audit entry when only the description changes'
  'PATCH item > records no audit entry when the item was not found'
  'PATCH item > still returns 200 and the updated item when the audit write throws'
  'PATCH item > records menu.item.availability_changed with via menu_editor when isAvailable flips'
  'DELETE item > records menu.item.deleted with the item name, price and categoryId'
  'DELETE item > records no audit entry when the item was not found'
  'PATCH item > deletes the menu:<cafeId>:full key after a successful update' (with the ioredis mock)
apps/api/src/routes/ai-console.test.ts:
  'set_item_availability > deletes the menu:<cafeId>:full cache key after flipping isAvailable'
  'set_item_availability > does not touch the cache when no item matches the name'
  'set_item_availability > does not touch the cache when two items match the name ambiguously'
  'set_item_availability > does not touch the cache when updateItem returns null'
  'set_item_availability > records menu.item.availability_changed with via ai_console and the owner as actor'

### Files

- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/menu.test.ts`
- `apps/api/src/routes/ai-console.ts`
- `apps/api/src/routes/ai-console.test.ts`
- `apps/api/src/repositories/menu.ts`

---

<a id="stock-enforcement"></a>

## 🔴 `stock-enforcement` — Atomic stock reservation inside the order transaction, sold-out on both menus, per-line rejection

### Approach

Gaps 5 and 10 are one bug. Pointer verified: `decrementForOrder` (apps/api/src/repositories/inventory.ts:98-116) is fully written and called from nowhere, and `getFullMenu` (repositories/menu.ts:55-80) never touches `menu_item_stock`.

TWO CORRECTIONS to the audit's proposed fix:
(a) Calling `decrementForOrder` as written does not fix the bug. Its UPDATE has no `stock_qty >= qty` predicate, so it drives stock negative and twenty concurrent QR orders for the last three portions all succeed. It must be replaced, not wired up.
(b) It cannot run 'inside the same transaction as ordersRepo.create' as-is: `create` opens its own `db.transaction` (apps/api/src/repositories/orders.ts:111) and the inventory repo closes over a different `db` handle, so a call before or after `create` is a separate transaction. The transaction has to be threaded.
Also rejecting the audit's alternative of deriving `isAvailable` from stock inside `getFullMenu`: the owner's editor needs the manual 86 flag and the stock state to stay distinguishable, or the availability toggle fights the stock count and the owner can never turn an out-of-stock item back on.

1. Replace `decrementForOrder` with:
     reserveForOrder(cafeId, lines: OrderStockLine[], tx?: DbOrTx): Promise<{ insufficient: { menuItemId: string; remaining: number }[] }>
   Fast path is ONE guarded multi-row statement:
     update menu_item_stock s set stock_qty = s.stock_qty - v.qty
       from (values ($id1::uuid,$q1::int), …) v(menu_item_id, qty)
      where s.cafe_id = $cafeId and s.menu_item_id = v.menu_item_id
        and s.stock_qty is not null and s.stock_qty >= v.qty
     returning s.menu_item_id
   Only when some requested id does not come back does it run a second read to separate 'untracked, therefore fine' from 'tracked but short':
     select menu_item_id, stock_qty from menu_item_stock
      where cafe_id = $cafeId and menu_item_id = any($ids) and stock_qty is not null
   Under READ COMMITTED the guarded UPDATE takes the row lock and Postgres re-evaluates the `>= qty` predicate against the updated row after the lock is released, so two concurrent reservations for the last 3 portions cannot both win. That property is the whole point of doing it in one statement rather than read-then-write.
2. Transaction threading. Add to a new apps/api/src/repositories/tx.ts:
     export type DbOrTx = Database | Parameters<Parameters<Database['transaction']>[0]>[0];
   Widen the inventory repo's handle to `DbOrTx`, and change the orders repo to
     create(data: NewOrder, opts?: { inTx?: (tx: DbOrTx) => Promise<void> }): Promise<OrderWithItems>
   awaiting `opts.inTx(tx)` inside the existing transaction, before the invoice-sequence upsert. A throw rolls back the order, the items, and the consumed serial — which the comment at orders.ts:109-110 already depends on.
3. Both creation routes (routes/orders.ts:174 and routes/public.ts:148) build stock lines by SUMMING quantity per menuItemId first. Two cart lines of the same dish with different modifiers hit one stock row; passing them separately would under-reserve. Pass `inTx`, catch a route-local `StockConflictError`, answer 409.
4. Read path: `getFullMenu` LEFT JOINs `menu_item_stock` on menu_item_id and maps `stockQty` plus derived `isSoldOut = stockQty !== null && stockQty <= 0`. Sellable = `isAvailable && !isSoldOut`, computed nowhere but `buildOrder` and the two menu renderers.
5. `buildOrder` (orders/build.ts:155-171) validates ALL lines and collects offences instead of throwing on the first, and attaches them to the error. `OrderBuildError` gains `details: { items: { menuItemId, name, reason }[] }`; `ApiError.details?: Record<string, unknown>` already exists (packages/types/src/api.ts:30-34), so the envelope needs no change.
6. Staleness: two small availability endpoints, polled every 30s and on `visibilitychange`, rather than re-fetching the whole 150-item menu payload. The diner page is already `cache: 'no-store'` server-side, so this is purely about the long-lived client session.
7. Types (packages/types/src/domain.ts): add
     export interface MenuItemDetail extends MenuItem { stockQty: number | null; isSoldOut: boolean; modifiers: MenuItemModifier[] }
     export interface MenuCategoryWithItems extends MenuCategory { items: MenuItemDetail[] }
   `MenuItem` itself — the row returned by POST/PATCH /menu/items — is untouched, which keeps the compile break to the fixtures that feed `getFullMenu`. Declare `modifiers` here and have the repo ship `[]` until item-modifiers lands, so the type churn happens exactly once.

### Schema

No column or table changes. `menu_item_stock` already has (id, cafe_id, menu_item_id, stock_qty nullable, low_stock_threshold nullable) with `menu_item_stock_menu_item_idx` unique on menu_item_id and `menu_item_stock_cafe_idx` on cafe_id (packages/db/src/schema/inventory.ts:17-37) — the unique index already serves the reservation lookup, so no new index is warranted. NO BACKFILL: `stock_qty is null` means untracked, which is the default for every existing item, so nothing becomes gated by this change unless the owner already set a count.

### API

Changed error responses on the two existing creation endpoints (request bodies unchanged):
  POST /cafes/:cafeId/orders  and  POST /public/cafes/:slug/orders
    400 { error: { code: 'ITEM_UNAVAILABLE', message: '"Paneer Tikka" is currently unavailable',
                   details: { items: [{ menuItemId, name, reason: 'unavailable' | 'sold_out' }] } } }
         — now lists EVERY offending line, not just the first
    400 { error: { code: 'INVALID_ITEM', message: '…', details: { items: [{ menuItemId }] } } }
    409 { error: { code: 'OUT_OF_STOCK', message: 'Some items just sold out',
                   details: { items: [{ menuItemId, name, remaining: number }] } } }   — NEW; raised by the reservation, i.e. it lost a race
    201 { order } unchanged on success

NEW  GET /public/cafes/:slug/availability   (no auth)
  200 { items: [{ id: string, isAvailable: boolean, isSoldOut: boolean, stockQty: number | null }] }
  404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } }
  cached 15s under cacheKey('menu', cafeId, 'availability'); ids + flags only, so nothing new is exposed to an unauthenticated caller

NEW  GET /cafes/:cafeId/menu/availability   (bearer auth) — same body
  200 { items: [...] }
  404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } }

GET /cafes/:cafeId/menu and GET /public/cafes/:slug: each item gains `stockQty` and `isSoldOut`. The public menu keeps filtering `isAvailable` (a manual 86 stays hidden) but now KEEPS sold-out items with `isSoldOut: true`, so the diner sees a greyed 'Sold out' row instead of a dish silently vanishing from under their finger mid-session.

### Web

apps/web/src/app/m/[slug]/diner-order.tsx
  - Poll GET /public/cafes/:slug/availability every 30s and on `visibilitychange` → visible; merge the flags into a `Map<id, {isAvailable,isSoldOut}>` in state and derive rendering from it (never mutate the RSC-passed categories).
  - Item row: sold out → 60% opacity, a 'Sold out' pill, disabled +. Already in the cart when it flips → strike the cart line, drop it, and toast '2 items were removed — they just sold out'.
  - placeOrder's error branch (:314-317): on 409 OUT_OF_STOCK or 400 ITEM_UNAVAILABLE with `details.items`, remove exactly those `menuItemId`s from the cart and re-render with an inline message, instead of the current whole-cart `throw new Error(message)`.
apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx
  - Same poll against /cafes/:cafeId/menu/availability; ItemTile disabled + 'Sold out' overlay; the same per-line 409 handling in handleSubmit. Note the offline queue (`sender`, :~200) can replay an order into an OUT_OF_STOCK — surface it as a failed-sync toast naming the items rather than silently dropping the queued order.
apps/web/src/app/m/[slug]/page.tsx — no change; already `cache: 'no-store'`.
apps/web/src/app/cafes/[id]/menu/menu-editor.tsx — consume `isSoldOut` for the badge (styling lands in menu-editor-ux).

### Tests

apps/api/src/orders/build.test.ts:
  'buildOrder > rejects a line whose item isSoldOut even though isAvailable is true'
  'buildOrder > accepts an item with stockQty null (untracked)'
  'buildOrder > accepts an item with stockQty greater than zero'
  'buildOrder > reports every unavailable line, not only the first'
  'buildOrder > puts menuItemId, name and reason on the error details'
  'buildOrder > distinguishes reason unavailable from reason sold_out'
apps/api/src/routes/orders.test.ts:
  'POST orders > passes an inTx callback to ordersRepo.create'
  'POST orders > sums quantities per menuItemId across duplicate cart lines before reserving'
  'POST orders > 409 OUT_OF_STOCK listing the short items when the reservation reports a shortage'
  'POST orders > does not create the order when the reservation fails'
  'POST orders > 400 ITEM_UNAVAILABLE lists both offending lines when two items are 86'd'
apps/api/src/routes/public.test.ts:
  'POST public orders > 409 OUT_OF_STOCK carries menuItemId and remaining'
  'GET /public/cafes/:slug > includes a sold-out item with isSoldOut true rather than dropping it'
  'GET /public/cafes/:slug > still excludes an item whose isAvailable is false'
  'GET availability > returns isSoldOut true for a zero-stock item'
  'GET availability > returns isSoldOut false and stockQty null for an untracked item'
  'GET availability > 404s for an unknown slug'
  'GET availability > exposes no names or prices'
apps/api/src/routes/inventory.test.ts:
  'GET /cafes/:cafeId/menu/availability > 404s for another owner's cafe'
apps/api/src/repositories/inventory.test.ts (new; integration, gated on DATABASE_URL the way any DB-touching test in this repo is):
  'reserveForOrder > decrements tracked stock by the ordered quantity'
  'reserveForOrder > returns the item as insufficient and writes nothing when stock is short'
  'reserveForOrder > ignores items with a null stockQty'
  'reserveForOrder > ignores an item belonging to another cafe'
  'reserveForOrder > two concurrent reservations for the last 3 portions leave stock_qty at 0, not -3'
apps/web/src/app/m/[slug]/diner-order.test.tsx (new):
  'DinerOrder > removes only the lines named in an OUT_OF_STOCK details payload'
  'DinerOrder > keeps the rest of the cart and stays on the cart screen after a partial rejection'
  'DinerOrder > disables the add control for an item that becomes sold out on the availability poll'

### Files

- `apps/api/src/repositories/inventory.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/repositories/menu.ts`
- `apps/api/src/repositories/tx.ts`
- `apps/api/src/orders/build.ts`
- `apps/api/src/orders/build.test.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/inventory.test.ts`
- `apps/api/src/repositories/inventory.test.ts`
- `packages/types/src/domain.ts`
- `packages/types/src/api.ts`
- `apps/web/src/app/m/[slug]/diner-order.tsx`
- `apps/web/src/app/m/[slug]/diner-order.test.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`

---

<a id="item-modifiers"></a>

## 🟠 `item-modifiers` — Half/full plate and priced add-ons: modifier CRUD, order-line pricing, snapshot on the bill

### Approach

Pointer verified: `menu_item_modifiers` and `menu_modifier_options` exist since migration 0001 (packages/db/drizzle/migrations/0001_giant_luke_cage.sql:11,38, with ON DELETE CASCADE FKs at :56-57) and are exported from the drizzle schema (packages/db/src/schema/menu.ts:73-96), but grep finds zero references in any repository, route, type or component. Everything above the DB is missing.

ONE ADDITION the audit misses: there is nowhere to record WHICH options a diner chose. `order_items` (packages/db/src/schema/orders.ts:105-127) has only a free-text `notes`. Without a snapshot the KOT cannot tell the kitchen 'half plate, extra cheese', and a later modifier rename or delete would rewrite a bill already handed to a customer — the same reason `hsn_snapshot` exists (:117-119). This needs migration 0013.

MONEY (integer paise throughout, no floats, no division):
  unitPricePaise = max(0, item.basePricePaise + Σ selectedOption.priceDeltaPaise)
  lineTotalPaise = unitPricePaise × quantity
Deltas may be negative ('Half plate −6000'). No apportionment is introduced, because the only division in the money path stays in `computeBillAdjustments` (orders/build.ts:60-105), which works on the BILL subtotal and never per line: `taxPaise = Math.round(taxableBase × gstRateBp / 10000)` is computed once on the whole, so the parts trivially re-sum to the whole. Rule to apply IF per-line GST is ever printed (largest-remainder): compute whole-bill tax first, give each line `floor(lineTaxable × tax / totalTaxable)`, then hand the leftover paise out one at a time to the lines with the largest fractional remainder, ties broken by ascending line index — the allocations then always sum exactly to the bill tax.

Repo (apps/api/src/repositories/menu.ts) — `listModifiers`, `createModifier`, `updateModifier`, `deleteModifier`, `createOption`, `updateOption`, `deleteOption`. TENANCY TRAP: neither table carries a cafeId, so EVERY one of these must join back through `menu_items.cafe_id` (options join modifier → item → cafe). A missed join is a silent cross-tenant write; the two named tenancy tests below exist specifically to catch it.

`getFullMenu` gains two more parallel queries (modifiers joined to menu_items for the cafe scope, then options for those modifier ids) and nests them in memory, ordered by (sortOrder, name). Two extra round trips on a cold read, behind the existing 60s cache.

CACHE KEY BUMP, mandatory: the cached payload shape changes. Change `menuCacheKey()` (routes/menu.ts:81-83) to `cacheKey('menu', cafeId, 'full', 'v2')`. Without this, a rolling deploy serves v1 JSON with no `modifiers` key to v2 code. Belt and braces: read it as `item.modifiers ?? []` everywhere.

`buildOrder` (orders/build.ts:134-189) indexes optionId → { modifierId, modifierName, optionName, priceDeltaPaise, selectionType, isRequired } per item and validates, collecting every offence the same way the stock work item does:
  - option not belonging to THAT item → INVALID_MODIFIER
  - two options from one `single` modifier → INVALID_MODIFIER
  - an `isRequired` modifier with no selection → MODIFIER_REQUIRED
The snapshot is sorted by (modifier.sortOrder, option.sortOrder) so the KOT reads in menu order rather than click order.

CART KEYING CHANGES IN BOTH CLIENTS — the highest-risk part of this item. Today the counter cart is `Map<menuItemId, CartLine>` (order-builder.tsx:172) and the diner cart is `Map<menuItemId, number>` (diner-order.tsx:67). Both become keyed on `${menuItemId}::${[...optionIds].sort().join(',')}` so 'Paneer half' and 'Paneer full' are separate lines. Every `cart.get(item.id)` site moves to the composite key (order-builder.tsx:575,578,468,472; diner-order.tsx:119-138), and the per-tile quantity badge becomes a sum across that item's lines.

### Schema

Migration 0013 (drizzle-kit generated), additive and backward-compatible, no backfill:
  ALTER TABLE "order_items" ADD COLUMN "modifiers_snapshot" jsonb;
Drizzle (packages/db/src/schema/orders.ts, inside orderItems):
  modifiersSnapshot: jsonb().$type<OrderItemModifierSnapshot[]>(),   // nullable; null and [] both mean no modifiers
Element shape: { modifierId: string; modifierName: string; optionId: string; optionName: string; priceDeltaPaise: number }
Deliberately a snapshot with NO foreign key, exactly like hsnSnapshot — deleting a modifier option later must not alter a printed bill.
No change to menu_item_modifiers or menu_modifier_options; their columns (itemId, name, selectionType enum single|multi, isRequired, sortOrder / modifierId, name, priceDeltaPaise, sortOrder) are sufficient as-is.

### API

All seven owner endpoints resolve the cafe via cafesRepo.findByIdAndOwner first and 404 (never 403); all bust menu:<cafeId>:full:v2.

GET    /cafes/:cafeId/menu/items/:itemId/modifiers
  200 { modifiers: MenuItemModifier[] }   // each with nested options[]
  404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' | 'Menu item not found' } }
POST   /cafes/:cafeId/menu/items/:itemId/modifiers
  body { name: string trim 1..60, selectionType: 'single' | 'multi', isRequired?: boolean, sortOrder?: int >= 0 }
  201 { modifier: MenuItemModifier }   |   404 NOT_FOUND
PATCH  /cafes/:cafeId/menu/modifiers/:modifierId
  body partial of the above, at least one key
  200 { modifier } | 400 VALIDATION_ERROR | 404 NOT_FOUND
DELETE /cafes/:cafeId/menu/modifiers/:modifierId
  204 | 404 NOT_FOUND     (its options cascade via the FK from migration 0001)
POST   /cafes/:cafeId/menu/modifiers/:modifierId/options
  body { name: string trim 1..60, priceDeltaPaise: int -100000..100000, sortOrder?: int >= 0 }
  201 { option: MenuModifierOption } | 404 NOT_FOUND
PATCH  /cafes/:cafeId/menu/options/:optionId
  body partial { name, priceDeltaPaise, sortOrder }   200 { option } | 400 | 404
DELETE /cafes/:cafeId/menu/options/:optionId
  204 | 404 NOT_FOUND

Order creation, both paths — request body change (additive, optional):
  POST /cafes/:cafeId/orders          items[].selectedOptionIds?: string[] uuid, max 20
  POST /public/cafes/:slug/orders     items[].selectedOptionIds?: string[] uuid, max 20
  new errors:
    400 { error: { code: 'INVALID_MODIFIER', message: '…', details: { items: [{ menuItemId, optionId }] } } }
    400 { error: { code: 'MODIFIER_REQUIRED', message: 'Choose a portion for "Paneer Butter Masala"', details: { items: [{ menuItemId, modifierId, modifierName }] } } }
  201 { order } — order.items[] now carry `modifiersSnapshot` (null when none)

GET /cafes/:cafeId/menu and GET /public/cafes/:slug: each item gains `modifiers: MenuItemModifier[]`.
packages/types/src/domain.ts gains MenuItemModifier, MenuModifierOption, OrderItemModifierSnapshot; OrderItem gains `modifiersSnapshot: OrderItemModifierSnapshot[] | null`.

### Web

apps/web/src/app/cafes/[id]/menu/menu-editor.tsx — a new 'Options' section inside EditItemForm: modifier groups with inline add/rename/delete (name, single/multi, required), each with option rows (name + a ₹ delta input accepting negatives). Kept out of AddItemForm — an item must exist before it can own modifiers.
apps/web/src/app/m/[slug]/diner-order.tsx — tapping an item WITH modifiers opens a bottom sheet (radio group per single modifier, checkboxes per multi, required groups block the Add button, a live total recomputed from base + deltas). An item with zero modifiers keeps today's one-tap add, unchanged. Cart keying and every `cart.get` site move to the composite key.
apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx — same picker as a compact popover so the counter stays fast; same cart-keying change; CartPanel renders the chosen options under each line.
apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx — KOT (:171) prints each option indented under the line the way `notes` already is at :173; BillItemRow (:353-360) prints them under the item name so the priced line reconciles.
apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx — show the snapshot on the order detail.

### Tests

apps/api/src/orders/build.test.ts:
  'buildOrder > adds each selected option priceDeltaPaise to the unit price'
  'buildOrder > applies a negative delta for a half plate'
  'buildOrder > clamps a unit price to zero when deltas exceed the base price'
  'buildOrder > multiplies the modified unit price by quantity for the line total'
  'buildOrder > keeps subtotal equal to the sum of unitPrice times quantity across modified lines'
  'buildOrder > snapshots modifier name, option name and delta onto the order item'
  'buildOrder > orders the snapshot by modifier sortOrder then option sortOrder'
  'buildOrder > sets modifiersSnapshot to null when no options are selected'
  'buildOrder > INVALID_MODIFIER when an option belongs to a different item'
  'buildOrder > INVALID_MODIFIER when two options come from one single-selection modifier'
  'buildOrder > allows two options from a multi-selection modifier'
  'buildOrder > MODIFIER_REQUIRED when a required modifier has no selection'
  'buildOrder > allows an optional modifier with zero selections'
  'buildOrder > GST is computed once on the whole taxable base, not per line'
apps/api/src/routes/menu.test.ts:
  'POST modifiers > 201s and returns the modifier'
  'POST modifiers > 404s when the item is not in this cafe'
  'POST options > 404s when the modifier's item belongs to another cafe'    <- tenancy trap
  'PATCH modifier > 404s for another cafe's modifier'                        <- tenancy trap
  'DELETE option > 404s for another cafe's option'                           <- tenancy trap
  'PATCH option > accepts a negative priceDeltaPaise'
  'PATCH option > 400s on a delta outside the allowed range'
  'GET modifiers > returns options nested and sorted by sortOrder'
  'POST modifiers > busts the v2 menu cache key'
apps/api/src/routes/orders.test.ts / public.test.ts:
  'POST orders > persists modifiersSnapshot on the created order item'
  'POST orders > accepts a request with no selectedOptionIds (back-compat)'
  'POST public orders > 400 MODIFIER_REQUIRED names the missing modifier'
apps/web tests:
  'order-builder > keys two lines of the same item with different options separately'
  'order-builder > shows the combined quantity badge on the tile across both lines'
  'order-builder > decrementing one modifier line leaves the other intact'
  'diner-order > blocks Add until every required modifier has a selection'
  'diner-order > shows the running price including option deltas in the sheet'
  'print-views > renders each snapshot option indented under its KOT line'
  'print-views > renders options under the bill line without changing the line total'

### Files

- `packages/db/src/schema/orders.ts`
- `packages/db/drizzle/migrations`
- `packages/types/src/domain.ts`
- `packages/types/src/api.ts`
- `apps/api/src/repositories/menu.ts`
- `apps/api/src/repositories/orders.ts`
- `apps/api/src/orders/build.ts`
- `apps/api/src/orders/build.test.ts`
- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/menu.test.ts`
- `apps/api/src/routes/orders.ts`
- `apps/api/src/routes/orders.test.ts`
- `apps/api/src/routes/public.ts`
- `apps/api/src/routes/public.test.ts`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx`
- `apps/web/src/app/m/[slug]/diner-order.tsx`
- `apps/web/src/app/cafes/[id]/orders/new/order-builder.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/print-views.tsx`
- `apps/web/src/app/cafes/[id]/orders/[orderId]/page.tsx`

---

<a id="csv-import-idempotency"></a>

## 🟠 `csv-import-idempotency` — Transactional, deduplicating, batched CSV import plus bulk-select delete recovery

### Approach

Pointer verified exactly. apps/api/src/routes/menu.ts:203-233 loops `await menuRepo.createItem(...)` once per row, matching categories by lowercased name (:196-201) but never checking item names. 150 rows is 150+ sequential round trips with no transaction: a failure at row 90 leaves a half-imported menu with no record of where it stopped, and a re-upload doubles everything. `parseMenuCsv` (apps/api/src/menu/import.ts) itself is fine and needs no change.

Move the whole loop into the repository as one method so it can hold a transaction:
  importMenu(cafeId, rows: ParsedRow[], mode: 'skip' | 'update'):
    Promise<{ categoriesCreated: number; itemsCreated: number; itemsUpdated: number; duplicates: number }>
Inside a single `db.transaction`:
  1. read existing categories (id, name where cafe_id) → Map<lower(trim(name)), id>
  2. batch-insert the missing categories in ONE insert().values([...]).returning(), sortOrder continuing from the current max (menu-ordering)
  3. read existing items (id, category_id, name where cafe_id) → Map<`${categoryId} ${lower(trim(name))}`, id>
  4. partition rows into new / duplicate, resolving WITHIN-FILE collisions on the same key too: in 'skip' the first occurrence wins and later ones count as duplicates; in 'update' the last occurrence wins
  5. 'skip': one chunked insert().values([...]) per 500 rows (13 columns × 500 = 6,500 bind params, comfortably under postgres-js's 65,534 limit)
     'update': for the duplicate set, one chunked `update … from (values …)` setting ONLY base_price_paise, description, is_vegetarian and spice_level — never is_available, image_url, hsn_code or gst_rate_bp_override, so a re-import cannot silently un-86 an item or wipe photos and HSN codes the owner set by hand. That restraint is the difference between a safe re-import and a second disaster.
One round trip becomes ~5 regardless of row count.

HONEST LIMIT: there is no unique index on menu_items(category_id, lower(name)), so dedupe is application-level and two SIMULTANEOUS imports (two tabs, a double-click) could still both insert. Adding the index is a separate, riskier migration — it would fail outright on any cafe that already has duplicates created by this very bug — so it belongs in a follow-up that cleans first, then constrains. See risks.

Recovery half: `deleteItems(cafeId, itemIds): Promise<number>` — one `delete … where cafe_id = $1 and id = any($2) returning id`, so a foreign id is a silent no-op rather than a cross-tenant delete, and the returned count tells the UI what actually went. One `menu.items.bulk_deleted` audit entry with the names (the audit repo is already injected by menu-write-audit-and-cache).

Preview: MenuEditor already holds the full menu in state (menu-editor.tsx:73), so pass it down — the dialog can mark duplicates with zero extra fetches.

### Schema

None. No new columns, no new indexes in this work item (the unique index is deliberately deferred — see approach and risks). No backfill.

### API

POST /cafes/:cafeId/menu/import   (bearer auth) — request gains one optional field, response gains two:
  body { csv: string 1..500000, mode?: 'skip' | 'update' }        // default 'skip'
  200 { categoriesCreated: number, itemsCreated: number, itemsUpdated: number, duplicates: number, skipped: number, errors: MenuImportError[] }
      itemsUpdated  — rows that matched an existing item and were patched (0 in 'skip' mode)
      duplicates    — rows that matched an existing item (counted in both modes)
      skipped       — rows that failed CSV validation, unchanged meaning
  400 { error: { code: 'VALIDATION_ERROR' } }   — csv missing/too large
  404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } }
  Additive and backward-compatible: `MenuImportResponse` (packages/types/src/api.ts:151-157) gains two fields that an older web build simply ignores.
  Busts the menu cache when anything was written; writes one `menu.import` audit entry with all four counts.

POST /cafes/:cafeId/menu/items/bulk-delete   (bearer auth)
  POST rather than DELETE-with-body, which is unevenly supported by proxies and fetch.
  body { itemIds: string[] uuid, 1..500 }
  200 { deleted: number }
  400 { error: { code: 'VALIDATION_ERROR', message: 'itemIds must contain at least one id' } }
  404 { error: { code: 'NOT_FOUND', message: 'Cafe not found' } }
  Busts the menu cache; writes one `menu.items.bulk_deleted` audit entry.

### Web

apps/web/src/app/cafes/[id]/menu/menu-import.tsx
  - New prop `existingCategories: MenuCategoryWithItems[]`, passed from MenuEditor (:91) which already has them.
  - ImportPreview (:307-379) gains a status column per row: 'New' or a 'Duplicate' pill, computed on `${categoryId} ${lower(trim(name))}` against the existing menu, and a summary line 'N new · M already on your menu'.
  - A mode radio above the button: 'Skip the duplicates' (default) / 'Update prices from this file', with the sub-caption 'Photos, HSN codes and 86 status are never overwritten.'
  - The submit label becomes 'Import N new' / 'Import N new, update M'.
  - handleImport (:128-169): surface itemsUpdated and duplicates in the toast, and stop treating `itemsCreated === 0` as failure — an all-duplicates re-upload in skip mode is a success, not an error.
apps/web/src/app/cafes/[id]/menu/menu-editor.tsx
  - A checkbox at the left of each ItemRow plus a 'Select all' on each category header; a sticky bottom bar 'N items selected — Delete' with a ConfirmDialog naming the count; on success remove them from state in one pass.
  - Selection state lives in MenuEditor as a Set<string>, cleared on refreshMenu.

### Tests

apps/api/src/routes/menu.test.ts:
  'POST import > does not re-create an item whose name already exists in that category'
  'POST import > matches an existing item name case-insensitively and ignoring surrounding whitespace'
  'POST import > counts an existing item as a duplicate rather than as created'
  'POST import > mode=update patches basePricePaise on an existing item and counts it in itemsUpdated'
  'POST import > mode=update leaves isAvailable, imageUrl, hsnCode and gstRateBpOverride untouched'
  'POST import > treats two rows in the same file with the same category and name as one item plus one duplicate'
  'POST import > re-importing the identical CSV a second time creates nothing and reports every row as a duplicate'
  'POST import > matches an existing category case-insensitively and does not create a second one'
  'POST import > 404s for another owner's cafe before parsing the CSV'
  'POST import > returns skipped and errors unchanged for rows that fail validation'
  'POST import > writes one menu.import audit entry with all four counts'
  'POST bulk-delete > deletes only ids belonging to this cafe and returns the count'
  'POST bulk-delete > 400s on an empty itemIds array'
  'POST bulk-delete > 404s for another owner's cafe'
  'POST bulk-delete > writes one menu.items.bulk_deleted audit entry'
apps/api/src/repositories/menu.test.ts (new; integration, gated on DATABASE_URL):
  'importMenu > rolls back every category and item insert when one row fails'
  'importMenu > imports 800 rows without exceeding the bind-parameter limit'
  'importMenu > issues a constant number of statements regardless of row count'
apps/web/src/app/cafes/[id]/menu/menu-import.test.tsx (new):
  'ImportPreview > flags a row whose category and name already exist as Duplicate'
  'ImportPreview > shows the N new / M already on your menu summary'
  'ImportDialog > sends mode=update when the update radio is selected'
  'ImportDialog > treats an all-duplicates skip-mode result as success, not an error'
apps/web/src/app/cafes/[id]/menu/menu-editor.test.tsx:
  'MenuEditor > select-all on a category selects exactly that category's items'
  'MenuEditor > bulk delete posts every selected id and removes the rows'

### Files

- `apps/api/src/repositories/menu.ts`
- `apps/api/src/repositories/menu.test.ts`
- `apps/api/src/routes/menu.ts`
- `apps/api/src/routes/menu.test.ts`
- `packages/types/src/api.ts`
- `apps/web/src/app/cafes/[id]/menu/menu-import.tsx`
- `apps/web/src/app/cafes/[id]/menu/menu-import.test.tsx`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.test.tsx`

---

<a id="menu-editor-ux"></a>

## 🟡 `menu-editor-ux` — Add-item form parity, menu search/filter/collapse, and visible 86 / sold-out treatment

### Approach

Both pointers verified; this is UI-only, no API work.

Parity: AddItemForm's state block (menu-editor.tsx:789-796) holds only name, priceRupees, description, hsnCode, gstPercent, isVeg, and its POST body (:824-832) sends the same six. EditItemForm already renders ImageUpload, the vegan and contains-egg checkboxes and the spice picker at :612-684, and `createItemBodySchema` (routes/menu.ts:38-43) already accepts imageUrl, isVegan, containsEgg and spiceLevel. So the whole gap is four missing controls in one of two nearly-identical forms.

Rather than copy them across — which is exactly how the two forms drifted apart and will drift again — extract the shared field block into an `ItemFields` component taking a value object and an onChange, rendered by both forms. State stays in each parent so AddItemForm can still reset after a successful submit.

86 treatment: today the row's name (:334) and price (:373-375) render identically whether the item is available or not; the only signal is the colour of the switch at :387-399. Mirror the inactive-staff pattern at apps/web/src/app/cafes/[id]/staff/staff-manager.tsx:225-232 — `cn('font-medium text-sm truncate', !item.isAvailable && 'text-muted')` plus a small uppercase pill. Render TWO distinct pills so the owner can tell the causes apart: '86' when `!isAvailable` (they turned it off) and 'Sold out' with a '0 left' hint when `isSoldOut` (stock ran out, from stock-enforcement). Conflating them would make the stock feature undiagnosable.

Search and collapse: a sticky toolbar above the category list with a search Input and an 'Unavailable only' toggle. Filtering derives a new category array (name + description match, case-insensitive, on a 150ms-debounced value) and hides categories with no surviving items. A chevron per card collapses it, persisted per cafe in localStorage under `sangam:menu-collapsed:<cafeId>` as a JSON array of ids — every read and write wrapped in try/catch, because private-mode browsers throw on access, not just return null. While a query is active every matching category renders expanded regardless of its stored collapse state, so search results are never hidden behind a chevron. The category header count becomes 'N items · M unavailable'.

### Schema

None.

### API

None. The four fields AddItemForm starts sending (imageUrl, isVegan, containsEgg, spiceLevel) are already accepted by POST /cafes/:cafeId/menu/items (apps/api/src/routes/menu.ts:38-43) and already defaulted server-side at :161-165.

### Web

apps/web/src/app/cafes/[id]/menu/menu-editor.tsx — the only file.
  - New `ItemFields` component holding the photo, veg/non-veg pair, vegan + contains-egg checkboxes and the spice picker currently inlined at :612-684; rendered by both EditItemForm and AddItemForm.
  - AddItemForm state (:789-796) gains isVegan, containsEgg, spiceLevel, imageUrl; the POST body (:824-832) sends all four; the post-submit reset (:836-840) clears them.
  - New MenuToolbar: search Input, 'Unavailable only' toggle, and the existing MenuImport button moved into it (currently a bare right-aligned div at :89-93).
  - Category CardHeader (:159-174): collapse chevron, the 'N items · M unavailable' subline.
  - ItemRow (:315-375): dim the name and price when !isAvailable, add the 86 and Sold out pills, and a '0 left' hint when stockQty is 0.
  - localStorage helpers `readCollapsed(cafeId)` / `writeCollapsed(cafeId, ids)`, both try/catch.

### Tests

apps/web/src/app/cafes/[id]/menu/menu-editor.test.tsx:
  'AddItemForm > posts isVegan, containsEgg, spiceLevel and imageUrl'
  'AddItemForm > posts the server defaults untouched when the new controls are left alone'
  'AddItemForm > resets the photo, diet flags and spice level after a successful add'
  'MenuEditor > filters items across every category by name'
  'MenuEditor > matches on description as well as name'
  'MenuEditor > hides a category with no matching items'
  'MenuEditor > expands a collapsed category while a search query is active'
  'MenuEditor > restores the collapsed state when the query is cleared'
  'MenuEditor > persists collapsed category ids to localStorage'
  'MenuEditor > renders without throwing when localStorage.getItem throws'
  'MenuEditor > Unavailable only shows exactly the items whose isAvailable is false'
  'MenuEditor > the category header counts unavailable items'
  'ItemRow > dims the name and price and shows an 86 pill when isAvailable is false'
  'ItemRow > shows a Sold out pill and a 0 left hint when isSoldOut is true'
  'ItemRow > shows both pills when an item is 86'd and out of stock'

### Files

- `apps/web/src/app/cafes/[id]/menu/menu-editor.tsx`
- `apps/web/src/app/cafes/[id]/menu/menu-editor.test.tsx`

---

## Order of work

1. 1. category-lifecycle FIRST. It adds findItemById / findCategory / countItemsInCategory to MenuRepository, which menu-write-audit-and-cache and csv-import-idempotency both depend on, and it establishes the category write path everything else edits.
2. 2. menu-ordering SECOND, immediately after. It touches the same CardHeader and the same repo file; landing it adjacent means menu-editor.tsx is opened once more instead of twice more, and it supplies the sortOrder continuation the importer needs later.
3. 3. menu-write-audit-and-cache THIRD. Small and self-contained; depends on findItemById from step 1 for the before-image, and injects the AuditLogsRepository that csv-import-idempotency reuses for its menu.import entry. Ship the three-line ai-console cache fix in the same PR — it is unrelated in file but identical in intent and takes minutes.
4. 4. stock-enforcement FOURTH. This is where MenuCategoryWithItems.items widens from MenuItem[] to MenuItemDetail[], so every getFullMenu fixture in the API suite is touched in this one step. Declare `modifiers: MenuItemModifier[]` on MenuItemDetail HERE and ship [] from the repo, so the next item is not a second type break.
5. 5. item-modifiers FIFTH, directly after, so the fixture churn from the type widening happens exactly once. Land the API half (schema, migration 0013, repo, routes, buildOrder, cache key bump to v2) and the print/KOT rendering before the two pickers — the cart-keying rewrite in both clients is the riskiest change in the theme and deserves its own review.
6. 6. csv-import-idempotency SIXTH. Needs menu-ordering for the importer sortOrder and menu-write-audit-and-cache for the audit repo. Ship the transactional deduplicating importer and the bulk-delete endpoint together — the fix and its recovery path are worthless apart.
7. 7. menu-editor-ux LAST. It consumes isSoldOut from step 4 and re-renders the rows and headers steps 1, 2 and 6 all changed, so doing it earlier guarantees rework.

## Risks

- Type widening of MenuCategoryWithItems.items (MenuItem[] -> MenuItemDetail[]) is a compile-time break across every fixture that feeds getFullMenu: makeItem in apps/api/src/routes/menu.test.ts, makeMenuItem in orders.test.ts, and the equivalents in public.test.ts, ai-console.test.ts and orders/build.test.ts, plus any web component typed as MenuItem[]. Mechanical but roughly an hour, and very easy to leave out of an estimate. Do it once, in stock-enforcement, and declare the modifiers field at the same time.
- The menu cache key MUST bump to menu:<cafeId>:full:v2 when modifiers land, or a rolling deploy serves v1 JSON with no modifiers key to code that reads item.modifiers, and the diner menu 500s. Bump the key AND read defensively as (item.modifiers ?? []). The same applies to the stock fields, so bump once and cover both.
- Stock is decremented on order creation but never returned on cancel, void or refund. After stock-enforcement a cancelled order permanently eats its stock, which for a cafe is arguably worse than today's inert counter. Either add the compensating increment to PATCH /cafes/:cafeId/orders/:orderId/status when moving to 'cancelled' (about half a day, inside the same transaction, guarded so a double-cancel cannot double-credit) or ship with stock documented as decrement-only. This is the single most likely production complaint from this theme.
- Reservation makes order creation fail where it previously succeeded (409 OUT_OF_STOCK). An owner who set a stock count months ago and forgot will suddenly be unable to sell. Mitigated by design — only items with a non-null stock_qty are gated and untracked is the default for every existing row — but the counter must surface the shortage with a one-tap 'Restock / stop tracking' link, or the cashier is stuck mid-service with no way out of the POS.
- There is no unique index on menu_items(category_id, lower(name)) or menu_categories(cafe_id, lower(name)), so both the import dedupe and the duplicate-category guard are application-level only. Two simultaneous imports, or a double-clicked submit, can still duplicate. Adding the index needs a data-cleanup migration first because it would fail outright on any cafe that already has duplicates from this exact bug — deliberately out of scope, and it should be the immediate follow-up.
- menu_item_modifiers and menu_modifier_options carry no cafeId, so every one of the seven modifier routes must join back through menu_items.cafe_id (options join modifier -> item -> cafe). A single missed join is a silent cross-tenant write with no test coverage to catch it. The three named tenancy tests in item-modifiers exist for this and must not be dropped for time.
- Per-dish reporting (topItemsToday and itemSalesToday, apps/api/src/repositories/orders.ts:462+) groups by item_name_snapshot. Keeping the BASE item name in that column, with options only in modifiers_snapshot, is what makes modifiers fix reporting rather than fragment it further. Do not append option names to itemNameSnapshot 'so the KOT reads better' — render from the snapshot instead.
- modifiers_snapshot is jsonb with no foreign key, deliberately, so deleting an option after an order is safe. The corollary is that a bad snapshot is unrecoverable: snapshot at buildOrder time only and never re-read the live modifier tables when printing a bill.
- ordersRepo.create grows an optional second parameter. Structurally this is source-compatible with every mocked OrdersRepository, and the existing assertions read arguments via ordersRepo.create.mock.calls[0]?.[0] (apps/api/src/routes/orders.test.ts:272, 302, 605) rather than toHaveBeenCalledWith, so they are safe — verified. Re-grep before starting in case new assertions have landed.
- apps/web/src/app/cafes/[id]/menu/csv.ts is a hand-maintained mirror of apps/api/src/menu/import.ts, and its header comment says so. csv-import-idempotency adds duplicate detection to the preview only, which keeps them in sync, but any future parsing-rule change must touch both files or the preview will confidently lie to the owner about what is about to be imported.
- getFullMenu goes from 2 parallel queries to 5 (categories, items, stock join, modifiers, options). Behind the 60s cache this is fine, but it is also the query behind every QR scan and every counter page load. Measure the cold-read latency on a 200-item menu before shipping item-modifiers; if it regresses, fold stock into the items query as a LEFT JOIN rather than a separate round trip.
- The counter's offline order queue (the sender callback in order-builder.tsx) can replay a queued order into a 409 OUT_OF_STOCK long after the cashier took the money. The failure must be a loud, item-naming toast, not a silent queue drop — otherwise the shop has cash with no order behind it.
