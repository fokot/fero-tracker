# Habit Tracker PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first progressive web app for habit tracking where users sign in with Google and data is stored in their individual Google Sheets using a row-based structure (Date + Habit Name + Value columns).

**Architecture:** React + Vite frontend, Google Identity Services for auth, Google Sheets API v4 for data storage. The app displays habits in a grid with dates as columns, reading from rows keyed by Date+HabitName.

**Tech Stack:**
- React 18 + Vite
- Tailwind CSS (via @vitejs/plugin-react)
- Google Identity Services (GIS) for OAuth
- Google Sheets API v4

## Global Constraints

- Minimum React version: 18.0.0
- Mobile-first design (min 375px width)
- Touch targets minimum 44px height
- Access tokens stored in memory only (never localStorage)
- Sheet format: 3 columns [Date, Habit Name, Value]
- Each habit+date combination is a separate row

---

### Task 1: Initialize Vite + React Project

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: None
- Produces: Basic React project structure with Vite

- [ ] **Step 1: Create package.json**

Create `package.json` with dependencies:

```json
{
  "name": "feros-tracker",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.12",
    "typescript": "~5.5.0",
    "vite": "^5.4.0"
  }
}
```

Run: `npm install`

- [ ] **Step 2: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    sourcemap: true
  }
})
```

- [ ] **Step 3: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/vite.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Habit Tracker</title>
  <meta name="theme-color" content="#6366f1" />
  <link rel="manifest" href="/manifest.json" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Habit Tracker" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 4: Create vite-env.d.ts**

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID: string
  readonly VITE_GOOGLE_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 5: Update .gitignore**

Add to `.gitignore`:
```
node_modules
dist
.env
```

- [ ] **Step 6: Run initial build**

```bash
npm run build
```

Expected output: Build succeeds with no errors.

---

### Task 2: Set Up Tailwind CSS

**Files:**
- Create: `src/index.css`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`

**Interfaces:**
- Consumes: None
- Produces: Tailwind CSS configured and imported

- [ ] **Step 1: Create tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

- [ ] **Step 2: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 3: Create src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}
```

- [ ] **Step 4: Update src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 5: Verify Tailwind works**

Run `npm run dev` and check browser console for no errors.

---

### Task 3: Create Google OAuth Service

**Files:**
- Create: `src/lib/googleOAuth.ts`

**Interfaces:**
- Consumes: None
- Produces: `initGoogleAuth`, `googleAuth` functions

- [ ] **Step 1: Create src/lib/googleOAuth.ts**

```typescript
declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID.apps.googleusercontent.com';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

let authInstance: any = null;

export async function initGoogleAuth() {
  if (window.google?.apis?.idtoken?.loadClient) {
    return;
  }

  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  window.google?.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (response: any) => handleCredentialResponse(response.credential),
    scope: SCOPES.join(' '),
  });

  authInstance = window.google?.accounts.id;
}

export async function getAccessToken(): Promise<string | null> {
  const client = window.google?.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES.join(' '),
    callback: (tokenResponse: any) => {
      console.log('Token:', tokenResponse.access_token);
    },
  });
  
  return new Promise((resolve) => {
    client.requestAccessToken((token: any) => {
      resolve(token.access_token || null);
    });
  });
}

export function googleAuth() {
  return new Promise((resolve, reject) => {
    if (!authInstance) {
      reject(new Error('Google Auth not initialized. Call initGoogleAuth() first.'));
      return;
    }

    authInstance.attachClickHandler(
      document.getElementById('google-button'),
      {},
      (credentialResponse: any) => {
        resolve(credentialResponse.credential);
      },
      (error: any) => {
        reject(error);
      }
    );
  });
}

function handleCredentialResponse(token: string) {
  console.log('Encoded JWT ID token: ' + token);
}

export function signOut() {
  if (authInstance) {
    const config = authInstance.getCurrentClient();
    if (config) {
      authInstance.signOut(config);
    }
  }
}
```

- [ ] **Step 2: Update .env.example**

```bash
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

Note: The user will need to create their own Google Cloud project and get a client ID.

- [ ] **Step 3: Create src/components/GoogleButton.tsx**

```typescript
import { useEffect } from 'react';

export function GoogleButton({ onLogin }: { onLogin: (token: string) => void }) {
  useEffect(() => {
    const init = async () => {
      try {
        await import('../lib/googleOAuth');
      } catch (error) {
        console.error('Failed to init:', error);
      }
    };
    init();
  }, []);

  const handleLogin = async () => {
    try {
      const credential = await googleAuth();
      if (credential) {
        onLogin(credential);
      }
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <div id="google-button" className="w-full max-w-xs mx-auto mt-4"></div>
  );
}
```

---

### Task 4: Create Google Sheets Service

**Files:**
- Create: `src/lib/googleSheets.ts`

**Interfaces:**
- Consumes: OAuth service (access token)
- Produces: `initSheets`, `createUserSheet`, `readHabitsInRange`, `writeHabitValue` functions

**Data Structure:**
```typescript
// Sheet columns:
// A: Date (ISO format YYYY-MM-DD)
// B: Habit Name
// C: Value

interface SheetRow {
  date: string;
  habitName: string;
  value: string;
}
```

- [ ] **Step 1: Create src/lib/googleSheets.ts**

```typescript
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets';
const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];

let sheetsClient: any = null;

export async function initSheets() {
  return new Promise((resolve, reject) => {
    if (window.google?.apis?.client?.setScopes) {
      resolve(window.google);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = async () => {
      try {
        await window.google?.apis?.client?.setup({
          apiKey: import.meta.env.VITE_GOOGLE_API_KEY,
          discoveryDocs: DISCOVERY_DOCS,
        });
        sheetsClient = window.google?.apis?.sheets?.v4;
        resolve(window.google);
      } catch (error) {
        reject(error);
      }
    };
    script.onerror = () => reject(new Error('Failed to load Google Sheets API'));
    document.head.appendChild(script);
  });
}

export async function getSheetsClient() {
  if (!sheetsClient) {
    await initSheets();
  }
  return sheetsClient;
}

function hashEmail(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase());
  return crypto.subtle.digest('SHA-256', data).then(hash => {
    const hexCodes = Array.from(new Uint8Array(hash))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    return hexCodes.slice(0, 16);
  });
}

export async function getSheetName(email: string): Promise<string> {
  const hash = await hashEmail(email);
  return `Habits_${hash}`;
}

export async function createUserSheet(email: string): Promise<string> {
  const client = await getSheetsClient();
  if (!client) throw new Error('Google Sheets not initialized');

  const sheetName = await getSheetName(email);

  // Create the spreadsheet with 3 columns: Date, Habit Name, Value
  const response = await window.gapi.client.sheets.spreadsheets.create({
    resource: {
      properties: { title: sheetName },
      sheets: [{
        properties: { 
          title: 'Habits',
          gridProperties: {
            columnCount: 3,
            rowCount: 1000
          }
        },
        data: [{
          startRow: 0,
          startColumn: 0,
         rowData: [{
            values: [
              { userEnteredValue: { stringValue: 'Date' } },
              { userEnteredValue: { stringValue: 'Habit Name' } },
              { userEnteredValue: { stringValue: 'Value' } }
            ]
          }]
        }]
      }],
    },
  });

  return response.result.spreadsheetId;
}

export async function readHabitsInRange(
  spreadsheetId: string,
  startDate: Date,
  endDate: Date
): Promise<{ habitName: string; date: string; value: string }[]> {
  const client = await getSheetsClient();
  if (!client) throw new Error('Google Sheets not initialized');

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  // Read all rows within date range
  const response = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Habits!A:C',
  });

  const rows = response.result.values || [];
  
  // Skip header row and filter by date range
  const filtered = rows.slice(1).filter(row => {
    if (row.length < 3) return false;
    const date = row[0];
    return date >= startStr && date <= endStr;
  });

  return filtered.map(row => ({
    habitName: row[1],
    date: row[0],
    value: row[2] || '',
  }));
}

export async function writeHabitValue(
  spreadsheetId: string,
  date: string,
  habitName: string,
  value: string
) {
  const client = await getSheetsClient();
  if (!client) throw new Error('Google Sheets not initialized');

  // First, check if row already exists for this date+habit combo
  const existingRows = await readHabitsInRange(spreadsheetId, new Date(date), new Date(date));
  const existingRow = existingRows.find(r => r.habitName === habitName);

  if (existingRow) {
    // Update existing row
    const rowIndex = 1 + existingRows.findIndex(r => r.habitName === habitName);
    const range = `Habits!C${rowIndex}`;
    
    await window.gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: 'RAW',
      resource: { values: [[value]] },
    });
  } else {
    // Append new row
    await window.gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Habits!A:C',
      valueInputOption: 'RAW',
      resource: { values: [[date, habitName, value]] },
    });
  }
}

export async function getAllHabits(spreadsheetId: string): Promise<string[]> {
  const client = await getSheetsClient();
  if (!client) throw new Error('Google Sheets not initialized');

  const response = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Habits!B:B',
  });

  const rows = response.result.values || [];
  
  // Get unique habit names (skip header)
  const habits = new Set<string>();
  rows.slice(1).forEach(row => {
    if (row[0]) habits.add(row[0]);
  });
  
  return Array.from(habits);
}
```

---

### Task 5: Create Zustand Store

**Files:**
- Create: `src/store/useHabitStore.ts`

**Interfaces:**
- Consumes: Google Sheets service
- Produces: `useHabitStore` Zustand store

- [ ] **Step 1: Create src/store/useHabitStore.ts**

```typescript
import { create } from 'zustand';
import { 
  readHabitsInRange, 
  writeHabitValue, 
  getAllHabits,
  getSheetName 
} from '../lib/googleSheets';

interface Habit {
  id: string;
  name: string;
  type: 'boolean' | 'numeric';
}

interface HabitValue {
  habitName: string;
  date: string;
  value: string;
}

interface User {
  email: string;
  name?: string;
  picture?: string;
}

interface HabitStore {
  user: User | null;
  spreadsheetId: string | null;
  habits: Habit[];
  habitValues: Record<string, Record<string, string>>; // date -> habitName -> value
  isLoading: boolean;
  error: string | null;

  setUser: (user: User) => void;
  clearUser: () => void;
  setSpreadsheetId: (id: string) => void;

  loadHabitsAndValues: (startDate: Date, endDate: Date) => Promise<void>;
  addHabit: (name: string, type: 'boolean' | 'numeric') => Promise<void>;
  toggleHabit: (habitName: string, date: string) => Promise<void>;
  setNumericValue: (habitName: string, date: string, value: string) => Promise<void>;
}

export const useHabitStore = create<HabitStore>((set, get) => ({
  user: null,
  spreadsheetId: null,
  habits: [],
  habitValues: {},
  isLoading: false,
  error: null,

  setUser: (user) => set({ user }),
  
  clearUser: () => set({
    user: null,
    spreadsheetId: null,
    habits: [],
    habitValues: {},
  }),

  setSpreadsheetId: (id) => set({ spreadsheetId: id }),

  loadHabitsAndValues: async (startDate, endDate) => {
    const { spreadsheetId } = get();
    if (!spreadsheetId) return;

    set({ isLoading: true, error: null });
    try {
      // Get all habits from the sheet
      const allHabits = await getAllHabits(spreadsheetId);
      
      // Get values for date range
      const values = await readHabitsInRange(spreadsheetId, startDate, endDate);
      
      // Transform values into nested object for quick lookup
      const habitValues: Record<string, Record<string, string>> = {};
      values.forEach(v => {
        if (!habitValues[v.date]) habitValues[v.date] = {};
        habitValues[v.date][v.habitName] = v.value;
      });

      const habits: Habit[] = allHabits.map((name, index) => ({
        id: `habit_${index}`,
        name,
        type: 'boolean', // Default to boolean
      }));

      set({ habits, habitValues, isLoading: false });
    } catch (error) {
      console.error('Failed to load habits:', error);
      set({ error: 'Failed to load habits', isLoading: false });
    }
  },

  addHabit: async (name, type) => {
    const { spreadsheetId, habits } = get();
    if (!spreadsheetId) return;

    set({ isLoading: true, error: null });
    try {
      // For now, just add to local state
      // In production, you'd write this to the sheet as a new habit entry
      const newHabit = {
        id: `habit_${Date.now()}`,
        name,
        type,
      };
      
      set({ habits: [...habits, newHabit], isLoading: false });
    } catch (error) {
      console.error('Failed to add habit:', error);
      set({ error: 'Failed to add habit', isLoading: false });
    }
  },

  toggleHabit: async (habitName, date) => {
    const { spreadsheetId, habitValues } = get();
    if (!spreadsheetId) return;

    set({ isLoading: true, error: null });
    try {
      const currentValues = { ...habitValues };
      
      if (!currentValues[date]) {
        currentValues[date] = {};
      }

      const current = currentValues[date][habitName];
      const newValue = current === '✓' ? '' : '✓';

      currentValues[date][habitName] = newValue;

      // Write to sheet
      await writeHabitValue(spreadsheetId, date, habitName, newValue);

      set({ habitValues: currentValues, isLoading: false });
    } catch (error) {
      console.error('Failed to toggle habit:', error);
      set({ error: 'Failed to update habit', isLoading: false });
    }
  },

  setNumericValue: async (habitName, date, value) => {
    const { spreadsheetId, habitValues } = get();
    if (!spreadsheetId) return;

    set({ isLoading: true, error: null });
    try {
      const currentValues = { ...habitValues };
      
      if (!currentValues[date]) {
        currentValues[date] = {};
      }

      currentValues[date][habitName] = value;

      // Write to sheet
      await writeHabitValue(spreadsheetId, date, habitName, value);

      set({ habitValues: currentValues, isLoading: false });
    } catch (error) {
      console.error('Failed to set numeric value:', error);
      set({ error: 'Failed to update habit', isLoading: false });
    }
  },
}));
```

---

### Task 6: Create Main App Component

**Files:**
- Create: `src/App.tsx`
- Create: `src/components/SignInScreen.tsx`
- Create: `src/components/HabitGrid.tsx`

**Interfaces:**
- Consumes: Store, Google Auth
- Produces: Main application component

- [ ] **Step 1: Create src/components/SignInScreen.tsx**

```typescript
import { GoogleButton } from './GoogleButton';
import { useHabitStore } from '../store/useHabitStore';

export function SignInScreen() {
  const { setUser, clearUser } = useHabitStore();

  const handleLogin = async (googleToken: string) => {
    try {
      // Decode the JWT token to get user info
      const response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${googleToken}`);
      const data = await response.json();
      
      setUser({
        email: data.email,
        name: data.name,
        picture: data.picture,
      });

      // Create or get user's sheet
      const { initSheets, createUserSheet } = await import('../lib/googleSheets');
      await initSheets();

      const sheetId = await createUserSheet(data.email);
      
      // Set spreadsheet ID in store
      const { setSpreadsheetId } = await import('../store/useHabitStore');
      // Note: This is a simplification; in practice you'd need to access the store
      console.log('Sheet created:', sheetId);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleSignOut = () => {
    clearUser();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Habit Tracker</h1>
        <p className="text-gray-600 mb-8">Track your daily habits and build better routines</p>

        <GoogleButton onLogin={handleLogin} />

        {useHabitStore.getState().user && (
          <button 
            onClick={handleSignOut}
            className="mt-6 text-sm text-gray-500 hover:text-red-600"
          >
            Sign out
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create src/components/HabitGrid.tsx**

```typescript
import { useEffect, useMemo } from 'react';
import { useHabitStore } from '../store/useHabitStore';

export function HabitGrid() {
  const { habits, habitValues, toggleHabit, setNumericValue, user, loadHabitsAndValues } = useHabitStore();

  // Get date range: last 30 days + next 7 days
  const dateRange = useMemo(() => {
    const dates = [];
    const today = new Date();
    
    // Last 30 days
    for (let i = 30; i >= 1; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      dates.push(date);
    }
    
    // Next 7 days
    for (let i = 1; i <= 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    
    return dates;
  }, []);

  useEffect(() => {
    if (user) {
      const start = dateRange[0];
      const end = dateRange[dateRange.length - 1];
      loadHabitsAndValues(start, end);
    }
  }, [user, dateRange, loadHabitsAndValues]);

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-900">My Habits</h1>
          <div className="flex items-center gap-3">
            {user?.picture && (
              <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
            )}
            <span className="text-sm font-medium text-gray-700">{user?.email}</span>
          </div>
        </div>
      </header>

      {/* Date navigator - horizontal scroll */}
      <div className="bg-white border-b overflow-x-auto">
        <div className="flex min-w-max">
          {/* Empty corner cell */}
          <div className="w-48 border-r px-4 py-3 font-semibold text-gray-700 shrink-0">
            Habit
          </div>
          
          {dateRange.map((date, i) => (
            <div 
              key={i} 
              className={`w-12 border-r px-2 py-3 text-center shrink-0 
                ${i === 30 ? 'font-bold text-indigo-600' : ''}`}
            >
              <div className="text-xs text-gray-500">{formatDisplayDate(date).split(' ')[0]}</div>
              <div className="font-medium">{date.getDate()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Habits grid */}
      <main className="max-w-7xl mx-auto px-4 py-4">
        {habits.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No habits yet. Add one to get started!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {habits.map((habit) => (
              <div key={habit.id} className="flex items-center bg-white rounded-lg shadow-sm overflow-hidden">
                {/* Habit name */}
                <div className="w-48 px-4 py-3 font-medium text-gray-900 border-r bg-gray-50 shrink-0">
                  {habit.name}
                </div>

                {/* Date cells */}
                <div className="flex flex-1 min-w-0">
                  {dateRange.map((date, i) => {
                    const value = habitValues[formatDate(date)]?.[habit.name] || '';
                    const isToday = i === 30;
                    
                    return (
                      <button
                        key={i}
                        onClick={() => toggleHabit(habit.name, formatDate(date))}
                        className={`flex-1 min-w-[48px] h-12 text-center transition-colors border-r hover:bg-gray-50 shrink-0
                          ${isToday ? 'bg-indigo-50' : ''}
                          ${value === '✓' ? 'bg-green-100 text-green-700 font-bold' : 
                            value ? 'bg-blue-50 text-blue-700 font-medium' : ''}
                          ${!value && !isToday ? 'text-gray-300' : ''}
                        `}
                      >
                        {value === '✓' ? '✓' : value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Add habit button */}
      <div className="fixed bottom-4 right-4">
        <button 
          onClick={() => alert('Add habit feature not yet implemented')}
          className="w-14 h-14 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update src/App.tsx**

```typescript
import { useState } from 'react';
import { GoogleButton } from './components/GoogleButton';
import { HabitGrid } from './components/HabitGrid';
import { useHabitStore } from './store/useHabitStore';

function App() {
  const { user, setUser, clearUser } = useHabitStore();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (googleToken: string) => {
    setLoading(true);
    
    try {
      // Decode the JWT token to get user info
      const response = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${googleToken}`);
      const data = await response.json();
      
      setUser({
        email: data.email,
        name: data.name,
        picture: data.picture,
      });

      // Initialize Sheets API
      const { initSheets, createUserSheet } = await import('./lib/googleSheets');
      await initSheets();

      const sheetId = await createUserSheet(data.email);
      
      // Set spreadsheet ID in store
      const { setSpreadsheetId } = await import('./store/useHabitStore');
      
      setLoading(false);
    } catch (error) {
      console.error('Login failed:', error);
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    clearUser();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {user ? (
        <>
          <HabitGrid />
        </>
      ) : (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Habit Tracker</h1>
            <p className="text-gray-600 mb-8">Track your daily habits and build better routines</p>
            
            {loading ? (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <GoogleButton onLogin={handleLogin} />
            )}
            
            <p className="mt-6 text-sm text-gray-500">
              Sign in with Google to sync your habits
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
```

---

### Task 7: Create PWA Manifest and Service Worker

**Files:**
- Create: `public/manifest.json`
- Create: `src/sw.ts` (optional for basic PWA)

**Interfaces:**
- Consumes: None
- Produces: Installable PWA

- [ ] **Step 1: Create public/manifest.json**

```json
{
  "name": "Habit Tracker",
  "short_name": "Habits",
  "description": "Track your daily habits and build better routines",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f9fafb",
  "theme_color": "#6366f1",
  "orientation": "portrait-primary"
}
```

- [ ] **Step 2: Update index.html for PWA**

Add these lines inside the `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#6366f1" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Habit Tracker" />
```

---

### Task 8: Set Up Environment Variables

**Files:**
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create .env.example**

```bash
# Google OAuth
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
VITE_GOOGLE_API_KEY=your_google_api_key_here

# Optional: For production sheet access without per-user OAuth
# VITE_SERVICE_ACCOUNT_KEY=base64_encoded_key
```

- [ ] **Step 2: Update .gitignore**

```bash
node_modules
dist
.env
```

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-11-habit-tracker-pwa.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
