import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { getSettings, saveSettings, resetEntries } from '@/services/api';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parse } from 'papaparse';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

interface SettingsData {
  properties: string[];
  incomeCategories: string[];
  expenseCategories: string[];
  pdfTemplate: string;
  pdfFilename: string;
}

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

const settingsSchema = z.object({
  properties: z.string().min(1, 'At least one property is required'),
  incomeCategories: z
    .string()
    .min(1, 'At least one income category is required'),
  expenseCategories: z
    .string()
    .min(1, 'At least one expense category is required'),
  pdfTemplate: z.string().min(1, 'PDF template is required'),
  pdfFilename: z.string().min(1, 'PDF filename is required'),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    localStorage.getItem('notificationsEnabled') !== 'false'
  );
  const [currency, setCurrency] = useState(
    localStorage.getItem('currency') || 'none'
  );

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
  });

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const fetchedSettings = await getSettings();
        setSettings(fetchedSettings);
        setValue('properties', fetchedSettings.properties.join(', '));
        setValue(
          'incomeCategories',
          fetchedSettings.incomeCategories.join(', ')
        );
        setValue(
          'expenseCategories',
          fetchedSettings.expenseCategories.join(', ')
        );
        setValue('pdfTemplate', fetchedSettings.pdfTemplate);
        setValue('pdfFilename', fetchedSettings.pdfFilename);
      } catch (error) {
        console.error('Error fetching settings:', error);
        if (notificationsEnabled) {
          toast.error('Failed to load settings');
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchSettings();
  }, [setValue, notificationsEnabled]);

  const onSubmit = async (data: SettingsFormData) => {
    setIsLoading(true);
    try {
      const updatedSettings: SettingsData = {
        properties: data.properties
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .sort(),
        incomeCategories: data.incomeCategories
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .sort(),
        expenseCategories: data.expenseCategories
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
          .sort(),
        pdfTemplate: data.pdfTemplate,
        pdfFilename: data.pdfFilename,
      };
      let retries = 2;
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await saveSettings(updatedSettings);
          break;
        } catch (error: any) {
          console.error(`Save settings attempt ${attempt} failed:`, error);
          if (attempt === retries) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      setSettings(updatedSettings);
      localStorage.setItem('settings', JSON.stringify(updatedSettings));
      if (notificationsEnabled) {
        toast.success('Settings saved successfully');
      }
    } catch (error: any) {
      console.error('Error saving settings:', error);
      if (notificationsEnabled) {
        toast.error('Failed to save settings: ' + error.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetEntries = async () => {
    if (
      !window.confirm(
        'Are you sure you want to delete all entries? This cannot be undone.'
      )
    ) {
      return;
    }
    setIsResetting(true);
    try {
      // Add delay to avoid race conditions
      await new Promise((resolve) => setTimeout(resolve, 500));
      await resetEntries();
      localStorage.setItem('resetEntries', 'true'); // Notify Entries.tsx
      if (notificationsEnabled) {
        toast.success('Entries reset successfully');
      }
    } catch (error: any) {
      console.error('Error resetting entries:', error);
      if (notificationsEnabled) {
        toast.error('Failed to reset entries: ' + error.message);
      }
    } finally {
      setIsResetting(false);
    }
  };

  const handleCurrencyChange = (value: string) => {
    setCurrency(value);
    localStorage.setItem('currency', value);
  };

  const handleNotificationsToggle = () => {
    setNotificationsEnabled(!notificationsEnabled);
    localStorage.setItem(
      'notificationsEnabled',
      (!notificationsEnabled).toString()
    );
  };

  const handleCSVImport = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const result = await new Promise((resolve, reject) => {
        parse(file, {
          complete: (result) => resolve(result),
          error: (error) => reject(error),
          header: true,
          skipEmptyLines: true,
        });
      });

      const data = (result as any).data;
      if (!data || !Array.isArray(data)) {
        throw new Error('Invalid CSV data');
      }

      let newProperties = 0;
      let newIncomeCategories = 0;
      let newExpenseCategories = 0;
      let newEntries = 0;

      const currentSettings = settings || (await getSettings());
      const updatedProperties = new Set(currentSettings.properties);
      const updatedIncomeCategories = new Set(currentSettings.incomeCategories);
      const updatedExpenseCategories = new Set(
        currentSettings.expenseCategories
      );
      const entriesCol = collection(db, 'entries');

      for (const row of data) {
        const entry: Entry = {
          id: row.id || uuidv4(),
          name: row.name || '',
          contact: row.contact || '',
          type:
            row.type === 'Income' || row.type === 'Expense'
              ? row.type
              : 'Income',
          category: row.category || '',
          amount: parseFloat(row.amount) || 0,
          date: row.date || new Date().toISOString().split('T')[0],
          renewDate: row.renewDate || new Date().toISOString().split('T')[0],
          renewDateReminder: [0, 5, 10, 15].includes(
            Number(row.renewDateReminder)
          )
            ? Number(row.renewDateReminder)
            : 0,
          property: row.property || '',
        };

        if (!updatedProperties.has(entry.property) && entry.property) {
          updatedProperties.add(entry.property);
          newProperties++;
        }
        if (
          entry.type === 'Income' &&
          !updatedIncomeCategories.has(entry.category) &&
          entry.category
        ) {
          updatedIncomeCategories.add(entry.category);
          newIncomeCategories++;
        }
        if (
          entry.type === 'Expense' &&
          !updatedExpenseCategories.has(entry.category) &&
          entry.category
        ) {
          updatedExpenseCategories.add(entry.category);
          newExpenseCategories++;
        }

        let retries = 2;
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            await addDoc(entriesCol, entry);
            newEntries++;
            break;
          } catch (error: any) {
            console.error(`Add entry attempt ${attempt} failed:`, error);
            if (attempt === retries) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      const updatedSettings: SettingsData = {
        ...currentSettings,
        properties: Array.from(updatedProperties).sort(),
        incomeCategories: Array.from(updatedIncomeCategories).sort(),
        expenseCategories: Array.from(updatedExpenseCategories).sort(),
      };

      let retries = 2;
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await saveSettings(updatedSettings);
          break;
        } catch (error: any) {
          console.error(`Save settings attempt ${attempt} failed:`, error);
          if (attempt === retries) throw error;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      setSettings(updatedSettings);
      localStorage.setItem('settings', JSON.stringify(updatedSettings));

      if (notificationsEnabled) {
        toast.success(
          `Imported ${newEntries} new ${
            newEntries === 1 ? 'entry' : 'entries'
          }, ` +
            `${newProperties} new ${
              newProperties === 1 ? 'property' : 'properties'
            }, ` +
            `${newIncomeCategories} new income ${
              newIncomeCategories === 1 ? 'category' : 'categories'
            }, ` +
            `${newExpenseCategories} new expense ${
              newExpenseCategories === 1 ? 'category' : 'categories'
            }`
        );
      }
    } catch (error: any) {
      console.error('Error importing CSV:', error);
      if (notificationsEnabled) {
        toast.error('Failed to import CSV: ' + error.message);
      }
    } finally {
      setIsImporting(false);
      event.target.value = '';
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Settings</h2>
      {isLoading ? (
        <div className="flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading...</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="currency">Currency</Label>
                <Select value={currency} onValueChange={handleCurrencyChange}>
                  <SelectTrigger id="currency">
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="notifications"
                  checked={notificationsEnabled}
                  onCheckedChange={handleNotificationsToggle}
                />
                <Label htmlFor="notifications">Enable Notifications</Label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>CSV Import</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <Label htmlFor="csv-upload">Upload CSV File</Label>
                <Input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleCSVImport}
                  disabled={isImporting}
                />
                {isImporting && (
                  <p className="text-sm text-muted-foreground mt-2">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Importing...
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Properties</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="properties">Properties (comma-separated)</Label>
              <Input
                id="properties"
                {...register('properties')}
                placeholder="Home, Office, Apartment"
                aria-invalid={errors.properties ? 'true' : 'false'}
                aria-describedby={
                  errors.properties ? 'properties-error' : undefined
                }
              />
              {errors.properties && (
                <p id="properties-error" className="text-red-600 text-sm">
                  {errors.properties.message}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="incomeCategories">
                  Income Categories (comma-separated)
                </Label>
                <Input
                  id="incomeCategories"
                  {...register('incomeCategories')}
                  placeholder="Salary, Rent, Gift"
                  aria-invalid={errors.incomeCategories ? 'true' : 'false'}
                  aria-describedby={
                    errors.incomeCategories
                      ? 'incomeCategories-error'
                      : undefined
                  }
                />
                {errors.incomeCategories && (
                  <p
                    id="incomeCategories-error"
                    className="text-red-600 text-sm"
                  >
                    {errors.incomeCategories.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="expenseCategories">
                  Expense Categories (comma-separated)
                </Label>
                <Input
                  id="expenseCategories"
                  {...register('expenseCategories')}
                  placeholder="Utilities, Travel, Maintenance"
                  aria-invalid={errors.expenseCategories ? 'true' : 'false'}
                  aria-describedby={
                    errors.expenseCategories
                      ? 'expenseCategories-error'
                      : undefined
                  }
                />
                {errors.expenseCategories && (
                  <p
                    id="expenseCategories-error"
                    className="text-red-600 text-sm"
                  >
                    {errors.expenseCategories.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>PDF Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="pdfTemplate">PDF Template</Label>
                <Textarea
                  id="pdfTemplate"
                  {...register('pdfTemplate')}
                  placeholder="Enter PDF template with placeholders like {{name}}, {{amount}}"
                  className="min-h-[100px]"
                  aria-invalid={errors.pdfTemplate ? 'true' : 'false'}
                  aria-describedby={
                    errors.pdfTemplate ? 'pdfTemplate-error' : undefined
                  }
                />
                {errors.pdfTemplate && (
                  <p id="pdfTemplate-error" className="text-red-600 text-sm">
                    {errors.pdfTemplate.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="pdfFilename">PDF Filename Template</Label>
                <Input
                  id="pdfFilename"
                  {...register('pdfFilename')}
                  placeholder="e.g., {{name}}_{{date}}"
                  aria-invalid={errors.pdfFilename ? 'true' : 'false'}
                  aria-describedby={
                    errors.pdfFilename ? 'pdfFilename-error' : undefined
                  }
                />
                {errors.pdfFilename && (
                  <p id="pdfFilename-error" className="text-red-600 text-sm">
                    {errors.pdfFilename.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onClick={handleResetEntries}
                disabled={isResetting || isLoading}
              >
                {isResetting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Resetting...
                  </>
                ) : (
                  'Reset Entries'
                )}
              </Button>
            </CardContent>
          </Card>

          <Button type="submit" disabled={isSubmitting || isLoading}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </form>
      )}
    </div>
  );
};

export default Settings;
