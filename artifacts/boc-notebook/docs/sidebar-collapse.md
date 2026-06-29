# Left Sidebar Collapse — How It Works

This document explains how the left navigation sidebar in the BOC Study
Notebook web app collapses and is restored.

## TL;DR / Important clarification

The left sidebar does **not** shrink into a narrow icon-only rail. When it
collapses it is **removed from the layout entirely** (its width goes to zero),
and in its place a small set of **floating round icon buttons** appears in the
bottom-left corner of the screen. Those floating icons (a hamburger menu and a
compass) are what bring the sidebar back and open the guided tour.

> Note: the underlying shadcn UI primitive at
> `src/components/ui/sidebar.tsx` *does* support an icon-rail mode
> (`collapsible="icon"`), but the app's actual sidebar
> (`src/components/Sidebar.tsx`) does not use that primitive. It is a custom
> sidebar with show/hide collapse behavior.

## The moving parts

| Concern | File |
| --- | --- |
| Collapse state + persistence | `src/hooks/use-layout.ts` |
| The sidebar itself + collapse button | `src/components/Sidebar.tsx` |
| Mount/unmount logic + floating restore buttons | `src/components/Layout.tsx` |

## 1. State lives in a Zustand store

Collapse is driven by a persisted Zustand store, `useLayoutStore`
(`src/hooks/use-layout.ts`):

- `sidebarCollapsed: boolean` — when `true`, the sidebar is hidden.
- `toggleSidebar()` — flips `sidebarCollapsed`.
- `setSidebarCollapsed(v)` — sets it explicitly.
- `sidebarWidth: number` — the expanded width in pixels, clamped between
  `SIDEBAR_MIN` (160) and `SIDEBAR_MAX` (360); default is `SIDEBAR_MIN`.

The store is wrapped in `persist`, so the collapsed/expanded state and the
chosen width survive page reloads. It is saved in `localStorage` under the key
`boc-layout` (store `version: 3`; bumping the version runs `migrate()`, which
resets layout back to defaults).

## 2. Collapsing it

The expanded sidebar renders a header with a chevron button
(`src/components/Sidebar.tsx`):

```tsx
<Button ... onClick={toggleSidebar} data-testid="button-collapse-sidebar"
        title="Collapse sidebar">
  <ChevronLeft className="h-3.5 w-3.5" />
</Button>
```

Clicking it calls `toggleSidebar()`, which sets `sidebarCollapsed = true`.

## 3. What "collapsed" actually renders

In `src/components/Layout.tsx`, the sidebar is conditionally mounted:

```tsx
{!inMockRunner && !sidebarCollapsed && <Sidebar />}
```

So when `sidebarCollapsed` is `true`, the `<Sidebar />` is **not rendered at
all** — the main content area (`flex-1`) expands to fill the freed space.

## 4. Restoring it — the floating icon buttons

Because the sidebar is fully gone when collapsed, restoring it is handled by
floating buttons that only show while collapsed (desktop only — the wrapper is
`hidden md:flex`, fixed to the bottom-left, `z-40`):

```tsx
{!inMockRunner && sidebarCollapsed && (
  <div className="hidden md:flex fixed bottom-6 left-6 ...">
    {/* Hamburger: brings the sidebar back */}
    <Button ... onClick={() => setSidebarCollapsed(false)}
            data-testid="button-show-sidebar" title="Show sidebar">
      <Menu className="h-5 w-5" />
    </Button>
    {/* Compass: opens the guided-tour menu */}
    <Button ... data-testid="button-take-tour-fab" title="Take a guided tour">
      <Compass className="h-5 w-5" />
    </Button>
  </div>
)}
```

- The **Menu (hamburger)** button calls `setSidebarCollapsed(false)` to bring
  the full sidebar back.
- The **Compass** button opens the same guided-tour popover that lives in the
  expanded sidebar, so tours stay reachable while collapsed.

These two floating icons are the "icons" the sidebar collapses down to.

## 5. Automatic collapse on crowded pages

Some pages need the full width, so `Layout.tsx` auto-collapses the sidebar when
you navigate to them and restores your previous state when you leave:

- Auto-collapse routes: notebook detail (`/notebooks/:id`) and the study group
  page (`/study-group`). These have their own wide internal layouts.
- The logic remembers whether you had the sidebar open *before* the auto
  collapse (`sidebarBeforeAutoCollapse` ref) and only re-opens it on exit if you
  had it open before.

## 6. The mock-exam exception

During the strict timed exam runner (`/mock-exam/:id`), `inMockRunner` is
`true`, so **neither** the sidebar **nor** the floating restore buttons render —
the exam screen owns the full viewport with no navigation chrome.

## 7. Resizing (separate from collapse)

When expanded, the sidebar width is adjustable via a `ResizeHandle` on its
right edge. Dragging it calls `setSidebarWidth`, which clamps the value to the
160–360px range and persists it. This is independent of the collapse toggle.

## 8. Mobile

The desktop sidebar is hidden on small screens (`hidden md:flex` on the
sidebar container). Mobile navigation is handled separately by
`src/components/MobileTopBar.tsx`, and the floating restore buttons are
desktop-only.

## Quick reference — state transitions

| Action | Effect |
| --- | --- |
| Click chevron in sidebar header | `sidebarCollapsed = true` → sidebar unmounts |
| Click floating hamburger (bottom-left) | `sidebarCollapsed = false` → sidebar returns |
| Navigate to `/notebooks/:id` or `/study-group` | Auto-collapses; prior state restored on leave |
| Navigate to `/mock-exam/:id` | Sidebar and floating buttons both hidden |
| Reload page | Collapsed state + width restored from `localStorage` (`boc-layout`) |
