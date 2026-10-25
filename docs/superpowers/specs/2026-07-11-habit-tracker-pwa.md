# Habit Tracker PWA - Design Spec

> A mobile-first progressive web app for tracking daily habits, with Google Sheet as the backend database.

---

## 1. Overview

### 1.1 Goal
Build a habit tracking PWA where users:
- Sign in with Google account
- See their habits displayed with dates as columns
- Mark habits complete (boolean toggle) or enter numeric values
- Data is persisted to Google Sheets

### 1.2 Architecture

```
┌─────────────────────────────────────────────────────┐
│              PWA (React + Vite)                     │
│  ┌──────────────┐  ┌─────────────────┐             │
│  │   Habit Grid │  │  Google Auth    │             │
│  │ (Days cols)  │  │ (OAuth2)        │             │
│  └──────────────┘  └─────────────────┘             │
│           │                                          │
│           ▼                                          │
│    ┌──────────────┐                                  │
│    │ Sheets API  │ (reads/writes user's sheet)     │
│    └──────────────┘                                  │
└─────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │ Google Sheet │ (User's data)
                    └──────────────┘
```

### 1.3 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite |
| State | Zustand or Context API |
| Styling | Tailwind CSS (mobile-first) |
| Auth | Google Identity Services (GIS) |
| Data | Google Sheets API v4 |

---

## 2. Data Model

### 2.1 Google Sheet Structure (Per User)

Each user gets their own sheet named: `Habits_<hash_of_email>`

**Sheet format (one row per date, one column per habit):**
```
| Date       | Drink water | Read pages |
|------------|-------------|------------|
| 2026-07-01 | ✓           | 5          |
| 2026-07-02 | ✓           | 8          |
| ...        | ...         | ...        |
```

**Key points:**
- Column A: Date (ISO format `YYYY-MM-DD`)
- Columns B onward: one named habit per column (`✓` for completed boolean habits, numeric values for numeric habits)
- Each tracked date exists only once; editing an existing date changes one cell
- New habits append a header column immediately, even without recorded values
- A separate `HabitDefinitions` tab stores stable habit IDs, names, and types
- Old three-column trackers are pivoted after backing up their original tab; backup and conversion are atomic

### 2.2 App Data Structure (in-memory)

```typescript
interface Habit {
  id: string;
  name: string;
  type: 'boolean' | 'numeric';
  values: Record<string, string>; // date -> value mapping
}

interface AppState {
  user: User | null;
  habits: Habit[];
  visibleDateRange: { start: Date; end: Date };
}
```

---

## 3. Feature Requirements

### 3.1 Authentication

- One Google Identity Services OAuth button handles account selection and file access together
- Google userinfo establishes the authorized account before opening the tracker; there is no separate ID-token sign-in or Connect Google Sheets step
- OAuth2 scopes: `openid email profile https://www.googleapis.com/auth/drive.file`
- Store user's access token in memory (not localStorage for security)
- Auto-signout on token expiry
- Show user email/name after login

### 3.2 Habit Grid View (Main Screen)

**Layout:**
```
┌──────────────────────────────────────────┐
│  ☰  Habit Tracker          + Add Habit  │
├──────────────────────────────────────────┤
│                                          │
│  ← Jul 1  Jul 2  Jul 3  ...  Jul 31 → │  ← Horizontal scroll
│                                          │
├──────────────────────────────────────────┤
│ Drink water              ✓      ✓     ✗ │  ← Rows are habits
│ Read pages               5      8     0 │
│ Exercise                 ✓           ✓  │
└──────────────────────────────────────────┘
```

**Data Fetching:**
- Query sheet for all rows within visible date range
- Build grid by pivoting: date+habit → value

**Features:**
- Horizontal scroll to see more dates
- Tap cell to toggle (boolean) or enter number
- Only changes the single cell for that habit+date combination
- Swipe gesture for quick toggles on boolean habits
- "Today" highlight

### 3.3 Add/Edit Habit

**Form:**
```
Name: [____________________]
Type: (•) Boolean  ( ) Numeric
[Save] [Cancel]
```

- New habits appear as new row at bottom
- Must provide name and type

### 3.4 Data Sync

- Save to Google Sheet on every cell edit
- Show sync status indicator (● unsaved, ● saved)
- Handle offline: queue changes, sync when back online

---

## 4. Non-Functional Requirements

### 4.1 Mobile First
- Responsive design for iPhone (375px min)
- Touch targets: minimum 44px height
- PWA installable to home screen

### 4.2 Performance
- Fast initial load (<3s on 3G)
- Smooth scrolling (60fps)

### 4.3 Security
- Access tokens never stored in localStorage
- Sheet names hash user email for privacy
- Only the authenticated user can access their sheet

---

## 5. User Flow

### 5.1 First Visit
```
1. Load app → show welcome screen
2. Click "Sign in with Google"
3. User authenticates
4. App checks if user's sheet exists
5a. If no: create a new sheet with a Date column; append columns as habits are added
5b. If yes: load data for visible date range
6. Display habit grid (populated with historical + future dates)
```

### 5.2 Daily Usage
```
1. Open app (already logged in)
2. Scroll to see dates (last 30 days + future)
3. Tap cell to mark habit for that date
4. App updates the habit column in the date's row, creating that date row if needed
5. Sync indicator confirms save
6. Empty cells remain empty until tracked
```

---

## 6. Future Enhancements (Out of Scope)

- Charts/visualizations
- Habit categories/tags
- Reminders/push notifications
- Backup/export features
- Multi-device sync

---

## 7. Success Criteria

- [ ] User can sign in with Google
- [ ] Habit grid displays correctly on mobile
- [ ] Tapping cells toggles values and saves to sheet
- [ ] New habits can be added
- [ ] App is installable as PWA on iPhone
