const DISCOVERY_DOCS = ['https://sheets.googleapis.com/$discovery/rest?version=v4'];

let sheetsClient: any = null;

interface GapiSheets {
  spreadsheets: {
    create: (request: any) => Promise<any>;
    values: {
      get: (config: { spreadsheetId: string; range: string }) => Promise<any>;
      update: (config: { spreadsheetId: string; range: string; valueInputOption: string; resource: any }) => Promise<any>;
      append: (config: { spreadsheetId: string; range: string; valueInputOption: string; resource: any }) => Promise<any>;
    };
  };
}

interface GapiClient {
  sheets: GapiSheets;
}

declare global {
  interface Window {
    google?: any;
    gapi?: { client: GapiClient };
  }
}

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
  if (!window.gapi?.client.sheets.spreadsheets) throw new Error('Google Sheets API not loaded');

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
  if (!window.gapi?.client.sheets.spreadsheets) throw new Error('Google Sheets API not loaded');

  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  // Read all rows within date range
  const response = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Habits!A:C',
  });

  const rows = response.result.values || [];

  // Skip header row and filter by date range
  const filtered = rows.slice(1).filter((row: string[]) => {
    if (row.length < 3) return false;
    const date = row[0];
    return date >= startStr && date <= endStr;
  });

  return filtered.map((row: string[]) => ({
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
  if (!window.gapi?.client.sheets.spreadsheets) throw new Error('Google Sheets API not loaded');

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
  if (!window.gapi?.client.sheets.spreadsheets) throw new Error('Google Sheets API not loaded');

  const response = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Habits!B:B',
  });

  const rows = response.result.values || [];

  // Get unique habit names (skip header)
  const habits = new Set<string>();
  rows.slice(1).forEach((row: string[]) => {
    if (row[0]) habits.add(row[0]);
  });

  return Array.from(habits);
}
