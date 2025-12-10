# Z-Index Visual Hierarchy - SnackMatch Application

## Stack Visualization (Bottom to Top)

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 9999: TOPMOST ELEMENTS                                │
│  - .close-modal (Modal close buttons - must always be on top)│
│  - .favorites-page (Full-screen favorites page)              │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1200: CONTEXTUAL OVERLAYS                             │
│  - .contextual-hint (Instructional hints)                    │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1000: MAP CONTROLS & FAB BUTTONS                      │
│  - .map-overlay-info (Map information overlay)               │
│  - .btn-add-distributor (Add button on map)                  │
│  - .fab-add-hybrid (Floating action button)                  │
│  - .placement-actions (Placement controls)                   │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 500: CRITICAL MODALS & TOASTS                         │
│  - #report-modal (Report modal - highest priority modal)     │
│  - .toast-container (Toast notification container)           │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 400: TOAST NOTIFICATIONS                              │
│  - .toast-clean (Individual toast messages)                  │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 300: STANDARD MODALS & PANELS                         │
│  - .modal-clean (Standard modals)                            │
│  - .notif-panel (Notification side panel)                    │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 200: OVERLAYS & BOTTOM NAV                            │
│  - .search-overlay (Search full-screen overlay)              │
│  - .bottom-nav (Bottom navigation bar - HIGHEST NAV)         │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 190: FLOATING ACTION BUTTONS                          │
│  - .fab-report (Report floating action button)               │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 150: FULL PAGE VIEWS                                  │
│  - .view-page (Feed view, Profile view)                      │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 110: TOP NAVIGATION                                   │
│  - .top-nav (Top navigation bar with logo and icons)         │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 10: MAIN CONTENT CONTAINERS                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ EXPLORER VIEW:                                        │  │
│  │ - .swipe-area (Main swipe container)                 │  │
│  │ - .distributor-card-clean (Swipe cards)              │  │
│  │ - .card-content-clean (Card content)                 │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ HYBRID VIEW:                                          │  │
│  │ - .hybrid-sidebar (Sidebar with list)                │  │
│  │ - .sidebar-header (Sticky header)                    │  │
│  │ - .sidebar-list (Distributor list)                   │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ OTHER VIEWS:                                          │  │
│  │ - .page-header (All page headers)                    │  │
│  │ - .profile-card (Profile info)                       │  │
│  │ - .profile-stats (Stats grid)                        │  │
│  │ - .leaderboard (Leaderboard section)                 │  │
│  │ - .geo-container (Geo activation)                    │  │
│  │ - .search-results-clean (Search results)             │  │
│  │ - .notif-header (Notification header)                │  │
│  │ - .favorites-header (Favorites header)               │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 5: FILTERS & SECONDARY HEADERS                        │
│  - .feed-filters (Feed filter buttons)                       │
└─────────────────────────────────────────────────────────────┘
                            ▲
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: BASE CONTENT & INFO BARS                           │
│  - .context-info (Info bar below swipe cards)                │
│  - .mini-map-container (Mini map in cards)                   │
│  - #geo-view (Geo view background)                           │
│  - .hybrid-map-container (Map container)                     │
│  - .feed-list (Feed content)                                 │
│  - .favorites-list (Favorites list)                          │
│  - .notif-list (Notification list)                           │
└─────────────────────────────────────────────────────────────┘
```

## Key Stacking Rules

### Rule 1: Headers Above Content
```
Header (z-index: 10)
    ▲
Content Below (z-index: 1)
```

Example: `.page-header` (10) stays above `.feed-list` (1)

### Rule 2: Cards Above Info Bars
```
Card Content (z-index: 10)
    ▲
Info Bar (z-index: 1)
```

Example: `.swipe-area` (10) stays above `.context-info` (1)

### Rule 3: Sidebar Above Map
```
Sidebar (z-index: 10)
    ▲
Map (z-index: 1)
```

Example: `.hybrid-sidebar` (10) stays above `.hybrid-map-container` (1)

### Rule 4: Navigation Above Views
```
Navigation (z-index: 110-200)
    ▲
Views (z-index: 10-150)
```

Example: `.top-nav` (110) and `.bottom-nav` (200) stay above all views

### Rule 5: Modals Above Everything
```
Modals (z-index: 300-500)
    ▲
Navigation (z-index: 110-200)
    ▲
Content (z-index: 1-10)
```

Example: `.modal-clean` (300) appears above all navigation and content

## View-Specific Z-Index Patterns

### Explorer (Swipe) View
```
.swipe-area (z-index: 10)
  └─ .distributor-card-clean (z-index: 10)
      └─ .card-content-clean (z-index: 10)

.context-info (z-index: 1)  ← Below cards
```

### Hybrid Map View
```
.hybrid-sidebar (z-index: 10)
  ├─ .sidebar-header (z-index: 10)
  └─ .sidebar-list (z-index: 10)

.hybrid-map-container (z-index: 1)  ← Below sidebar
  └─ .fab-add-hybrid (z-index: 1000)  ← Above everything in map
```

### Feed View
```
.page-header (z-index: 10)
    ▲
.feed-filters (z-index: 5)
    ▲
.feed-list (z-index: 1)
```

### Profile View
```
.page-header (z-index: 10)
    ▲
.profile-card (z-index: 10)
.profile-stats (z-index: 10)
.leaderboard (z-index: 10)
```

## Interaction Patterns

### Modal Opening
1. User clicks button (any z-index)
2. Modal appears at z-index: 300+
3. Modal content displays above ALL other elements
4. Close button at z-index: 9999 ensures it's always clickable

### Bottom Navigation
1. Always visible at z-index: 200
2. Above all views (z-index: 150)
3. Below modals (z-index: 300+)
4. Always accessible for navigation

### Floating Action Buttons
1. Report FAB at z-index: 190
2. Map FABs at z-index: 1000
3. Always above their respective views
4. Below modals to prevent blocking

## Z-Index Gaps Explained

- **1 → 5 → 10**: Small steps for content layering within views
- **10 → 110**: Large gap to separate content from navigation
- **110 → 200**: Navigation layer range
- **200 → 300**: Gap to clearly separate navigation from modals
- **300 → 1000**: Modal and overlay range
- **1000 → 9999**: Map controls and topmost elements

This gap strategy prevents z-index conflicts and allows for future additions without reorganization.

## Testing Points

For each view, verify:
1. Headers stay above content ✓
2. Content doesn't show through cards ✓
3. Modals appear above everything ✓
4. Navigation is always accessible ✓
5. FAB buttons are always clickable ✓
6. No text bleeds through overlays ✓

## Maintenance Notes

When adding new elements:
- Base content: z-index 1
- Interactive content: z-index 10
- Navigation elements: z-index 100-200
- Modals/overlays: z-index 300-500
- Critical overlays: z-index 1000+

Always add a comment explaining the z-index purpose.
