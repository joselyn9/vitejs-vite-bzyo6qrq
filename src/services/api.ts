import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  setDoc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Entry {
  id: string;
  name: string;
  contact: string;
  type: 'Income' | 'Expense';
  category: string;
  amount: number;
  date: string;
  renewDate: string;
  renewDateReminder: 0 | 5 | 10 | 15;
  property: string;
}

interface SettingsData {
  properties: string[];
  incomeCategories: string[];
  expenseCategories: string[];
  pdfTemplate: string;
  pdfFilename: string;
}

// Get all entries
export const getEntries = async (): Promise<Entry[]> => {
  try {
    const entriesCol = collection(db, 'entries');
    const snapshot = await getDocs(entriesCol);
    const entries = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || '',
        contact: data.contact || '',
        type: data.type || 'Income',
        category: data.category || '',
        amount: Number(data.amount) || 0,
        date:
          data.date instanceof Timestamp
            ? data.date.toDate().toISOString().split('T')[0]
            : String(data.date || ''),
        renewDate:
          data.renewDate instanceof Timestamp
            ? data.renewDate.toDate().toISOString().split('T')[0]
            : String(data.renewDate || ''),
        renewDateReminder: [0, 5, 10, 15].includes(
          Number(data.renewDateReminder)
        )
          ? Number(data.renewDateReminder)
          : 0,
        property: data.property || '',
      } as Entry;
    });
    console.log('api.ts: Fetched entries:', entries);
    return entries;
  } catch (error) {
    console.error('api.ts: Error fetching entries:', error);
    return [];
  }
};

// Add a new entry
export const addEntry = async (entry: Omit<Entry, 'id'>): Promise<string> => {
  try {
    console.log('api.ts: Adding entry:', entry);
    const entriesCol = collection(db, 'entries');
    const docRef = await addDoc(entriesCol, entry);
    console.log('api.ts: Entry added successfully with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('api.ts: Error adding entry:', error);
    throw error;
  }
};

// Delete an entry
export const deleteEntry = async (id: string): Promise<void> => {
  const maxRetries = 3;
  let attempt = 1;

  while (attempt <= maxRetries) {
    try {
      console.log(`api.ts: Deleting entry ID: ${id}, Attempt: ${attempt}`);
      const entryDoc = doc(db, 'entries', id);
      const docSnap = await getDoc(entryDoc);
      if (!docSnap.exists()) {
        console.warn('api.ts: No document to delete:', id);
        throw new Error('No document to delete: ' + id);
      }
      await deleteDoc(entryDoc);
      console.log('api.ts: Entry deleted successfully:', id);
      return;
    } catch (error: any) {
      console.error(`api.ts: Delete attempt ${attempt} failed:`, error);
      if (error.message.includes('No document to delete')) {
        throw error;
      }
      if (attempt === maxRetries) {
        throw new Error(
          `Failed to delete entry after ${maxRetries} attempts: ${error.message}`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      attempt++;
    }
  }
};

// Update an entry
export const updateEntry = async (updatedEntry: Entry): Promise<void> => {
  try {
    console.log('api.ts: Updating entry:', updatedEntry);
    const entryDoc = doc(db, 'entries', updatedEntry.id);
    const docSnap = await getDoc(entryDoc);
    if (!docSnap.exists()) {
      console.error('api.ts: No document to update:', updatedEntry.id);
      throw new Error('No document to update: ' + updatedEntry.id);
    }
    const { id, ...data } = updatedEntry; // Exclude id from document data
    await updateDoc(entryDoc, data);
    console.log('api.ts: Entry updated successfully:', updatedEntry.id);
  } catch (error) {
    console.error('api.ts: Error updating entry:', error);
    throw error;
  }
};

// Get settings
export const getSettings = async (): Promise<SettingsData> => {
  try {
    const settingsDoc = doc(db, 'settings', 'config');
    const docSnap = await getDoc(settingsDoc);
    if (docSnap.exists()) {
      console.log('api.ts: Fetched settings:', docSnap.data());
      return docSnap.data() as SettingsData;
    }
    const defaultSettings: SettingsData = {
      properties: ['Home', 'Office', 'A802-CR'].sort(),
      incomeCategories: ['Salary', 'Gift', 'Cash', 'Rent'].sort(),
      expenseCategories: ['Maintenance', 'Travel'].sort(),
      pdfTemplate: `Finance Tracker Entry\nID: {{id}}\nName: {{name}}\nContact: {{contact}}\nType: {{type}}\nCategory: {{category}}\nAmount: {{currency}}{{amount}}\nAmount in Words: {{amountInWords}}\nDate: {{date}}\nRenew Date: {{renewDate}}\nReminder: {{renewDateReminder}} days\nProperty: {{property}}`,
      pdfFilename: '{{name}}_{{date}}.pdf',
    };
    await setDoc(settingsDoc, defaultSettings);
    console.log('api.ts: Initialized default settings:', defaultSettings);
    return defaultSettings;
  } catch (error) {
    console.error('api.ts: Error fetching settings:', error);
    throw error;
  }
};

// Save settings
export const saveSettings = async (settings: SettingsData): Promise<void> => {
  try {
    console.log('api.ts: Saving settings:', settings);
    const settingsDoc = doc(db, 'settings', 'config');
    await setDoc(settingsDoc, settings);
    console.log('api.ts: Settings saved successfully');
  } catch (error) {
    console.error('api.ts: Error saving settings:', error);
    throw error;
  }
};

// Reset entries
export const resetEntries = async (): Promise<void> => {
  try {
    console.log('api.ts: Resetting entries');
    const entriesCol = collection(db, 'entries');
    const snapshot = await getDocs(entriesCol);
    const deletePromises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    console.log('api.ts: Entries reset successfully');
  } catch (error) {
    console.error('api.ts: Error resetting entries:', error);
    throw error;
  }
};
