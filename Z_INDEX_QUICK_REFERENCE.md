# Z-Index Quick Reference Card

## Quick Lookup Table

| Layer | Z-Index | Element Type | Examples |
|-------|---------|--------------|----------|
| **Background** | 1 | Base content, info bars | `.context-info`, `.feed-list`, `.notif-list` |
| **Filters** | 5 | Secondary headers | `.feed-filters` |
| **Content** | 10 | Main containers, cards | `.swipe-area`, `.profile-card`, `.sidebar` |
| **Top Nav** | 110 | Navigation bar | `.top-nav` |
| **Views** | 150 | Full page views | `.view-page` |
| **FAB** | 190 | Floating buttons | `.fab-report` |
| **Bottom Nav** | 200 | Bottom navigation | `.bottom-nav` |
| **Modals** | 300 | Standard modals | `.modal-clean`, `.notif-panel` |
| **Toasts** | 400 | Toast messages | `.toast-clean` |
| **Critical** | 500 | Important modals | `#report-modal`, `.toast-container` |
| **Map Controls** | 1000 | Map buttons | `.fab-add-hybrid`, `.placement-actions` |
| **Hints** | 1200 | Contextual tips | `.contextual-hint` |
| **Topmost** | 9999 | Must be on top | `.close-modal`, `.favorites-page` |

---

## Common Patterns

### Pattern 1: Header Above Content
```css
.header {
    position: sticky;
    top: 0;
    z-index: 10;
}

.content {
    position: relative;
    z-index: 1;
}
```

### Pattern 2: Card Above Info Bar
```css
.card {
    position: relative;
    z-index: 10;
}

.info-bar {
    position: relative;
    z-index: 1;
}
```

### Pattern 3: Sidebar Above Map
```css
.sidebar {
    position: relative;
    z-index: 10;
}

.map {
    position: relative;
    z-index: 1;
}
```

---

## Quick Decision Guide

**Need to add a new element? Ask:**

1. **Is it base content/info?** → z-index: 1
2. **Is it main container/card?** → z-index: 10
3. **Is it navigation?** → z-index: 110-200
4. **Is it a modal?** → z-index: 300-500
5. **Is it a map control?** → z-index: 1000+
6. **Must it always be on top?** → z-index: 9999

---

## Element-Specific Quick Reference

### Explorer View
```
.swipe-area           → 10 (container)
.distributor-card     → 10 (card)
.context-info         → 1  (info bar)
```

### Hybrid View
```
.hybrid-sidebar       → 10 (sidebar)
.hybrid-map-container → 1  (map)
.fab-add-hybrid       → 1000 (button)
```

### Feed View
```
.page-header          → 10 (header)
.feed-filters         → 5  (filters)
.feed-list            → 1  (content)
```

### Profile View
```
.page-header          → 10 (header)
.profile-card         → 10 (card)
.profile-stats        → 10 (stats)
.leaderboard          → 10 (leaderboard)
```

---

## One-Liner Rules

1. **Base content = 1**
2. **Interactive containers = 10**
3. **Navigation = 110-200**
4. **Modals = 300-500**
5. **Map stuff = 1000+**
6. **Top priority = 9999**

---

## CSS Template for New Elements

```css
/* For base content */
.new-element {
    position: relative;  /* FIX: Creates stacking context */
    z-index: 1;          /* FIX: Base content layer */
}

/* For interactive containers */
.new-element {
    position: relative;  /* FIX: Creates stacking context */
    z-index: 10;         /* FIX: Main container layer */
}

/* For modals */
.new-element {
    position: fixed;
    z-index: 300;  /* FIX: Modal layer */
}
```

---

## Common Mistakes to Avoid

❌ **Don't:** Use random z-index values like 99, 999, 10000
✅ **Do:** Follow the established hierarchy (1, 10, 110, 200, 300, 1000, 9999)

❌ **Don't:** Forget to add `position: relative` when using z-index
✅ **Do:** Always set position for z-index to work

❌ **Don't:** Leave z-index without a comment
✅ **Do:** Add `/* FIX: Description */` comment

❌ **Don't:** Use z-index on elements without clear purpose
✅ **Do:** Only use z-index when layering is needed

---

## View Checklist

When adding/modifying a view:
- [ ] Header has z-index 10
- [ ] Content has z-index 1
- [ ] Modals use 300+
- [ ] FABs use appropriate layer
- [ ] All elements have comments
- [ ] No overlapping issues

---

## Quick Search Commands

```bash
# Find all z-index values
grep "z-index:" styles.css

# Find elements with z-index 10
grep "z-index: 10" styles.css

# Count z-index declarations
grep -c "z-index:" styles.css

# Find elements without comments
grep "z-index:" styles.css | grep -v "FIX:"
```

---

## Emergency Fix

If elements are showing through:

1. **Identify the problem element** (the one that should be on top)
2. **Check if it has position property** (add `position: relative` if missing)
3. **Add appropriate z-index** based on element type
4. **Add comment** explaining the fix
5. **Test in all views**

---

## Last Updated
Date: 2025-11-25
Total Elements: 40 z-index declarations
Total Fixes: 22 changes applied
