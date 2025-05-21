export interface Entry {
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

export interface Filters {
  type: string;
  category: string;
  dateStart: string;
  dateEnd: string;
  property: string;
}

export interface SettingsData {
  properties: string[];
  incomeCategories: string[];
  expenseCategories: string[];
  pdfTemplate: string;
  pdfFilename: string;
}
