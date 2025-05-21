import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  addEntry,
  updateEntry,
  deleteEntry,
  getSettings,
} from '@/services/api';
import { numberToWordsIndian } from '@/utils/numberToWordsIndian';
import { format, addDays, differenceInDays } from 'date-fns';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { jsPDF } from 'jspdf';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@radix-ui/react-tooltip';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  Copy,
  Download,
  Edit,
  Trash,
  Search,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Filter,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

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

interface FilterConfig {
  name: string;
  contact: string;
  type: 'Income' | 'Expense' | 'All';
  category: string;
  amountMin: string;
  amountMax: string;
  dateStart: string;
  dateEnd: string;
  property: string;
}

const entrySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contact: z.string().min(1, 'Contact is required'),
  type: z.enum(['Income', 'Expense']),
  category: z.string().min(1, 'Category is required'),
  amount: z.number().min(0, 'Amount must be non-negative'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  renewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid renew date format'),
  renewDateReminder: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(10),
    z.literal(15),
  ]),
  property: z.string().min(1, 'Property is required'),
});

type EntryFormData = z.infer<typeof entrySchema>;

const Entries: React.FC = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({
    name: '',
    contact: '',
    type: 'All',
    category: 'All',
    amountMin: '',
    amountMax: '',
    dateStart: '',
    dateEnd: '',
    property: 'All',
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Entry | 'amount' | 'monthYear';
    direction: 'asc' | 'desc';
  }>({ key: 'date', direction: 'desc' });
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage, setEntriesPerPage] = useState(10);
  const notificationsEnabled =
    localStorage.getItem('notificationsEnabled') !== 'false';
  const currency = localStorage.getItem('currency') || 'none';

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EntryFormData>({
    resolver: zodResolver(entrySchema),
    defaultValues: {
      name: '',
      contact: '',
      type: 'Income',
      category: '',
      amount: 0,
      date: format(new Date(), 'yyyy-MM-dd'),
      renewDate: format(new Date(), 'yyyy-MM-dd'),
      renewDateReminder: 0,
      property: '',
    },
  });

  const entryType = watch('type');

  // Set default category and property when type changes
  useEffect(() => {
    if (!settings || editingEntry) return;

    const categories =
      entryType === 'Income'
        ? settings.incomeCategories
        : settings.expenseCategories;
    if (categories.length > 0 && watch('category') !== categories[0]) {
      setValue('category', categories[0]);
    }

    if (
      settings.properties.length > 0 &&
      watch('property') !== settings.properties[0]
    ) {
      setValue('property', settings.properties[0]);
    }
  }, [settings, entryType, setValue, editingEntry]);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const fetchedSettings = await getSettings();
        console.log('Entries.tsx: Fetched settings:', fetchedSettings);
        setSettings(fetchedSettings);
      } catch (error) {
        console.error('Entries.tsx: Error fetching settings:', error);
        if (notificationsEnabled) {
          toast.error('Failed to load settings');
        }
      }
    };

    const entriesCol = collection(db, 'entries');
    const q = query(entriesCol, orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedEntries = snapshot.docs.map((doc) => {
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
        console.log('Entries.tsx: Fetched entries:', fetchedEntries);
        setEntries(fetchedEntries);
        snapshot.docChanges().forEach((change) => {
          console.log(
            `Entries.tsx: Snapshot change - Type: ${change.type}, ID: ${change.doc.id}, Data:`,
            change.doc.data()
          );
        });
        if (
          editingEntry &&
          !fetchedEntries.find((e) => e.id === editingEntry.id)
        ) {
          setIsDialogOpen(false);
          setEditingEntry(null);
          reset();
          if (notificationsEnabled) {
            toast.error('Editing entry was deleted.');
          }
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('Entries.tsx: Error fetching entries:', error);
        if (notificationsEnabled) {
          toast.error('Failed to fetch entries: ' + error.message);
        }
        setIsLoading(false);
      }
    );

    fetchSettings();

    return () => unsubscribe();
  }, [editingEntry, reset, notificationsEnabled]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterConfig, sortConfig, entriesPerPage]);

  const filteredEntries = useMemo(() => {
    return entries
      .filter((entry) => {
        // Global search
        const matchesSearch = searchTerm
          ? Object.values(entry).some((value) =>
              value.toString().toLowerCase().includes(searchTerm.toLowerCase())
            )
          : true;

        // Field-specific filters
        const matchesName = filterConfig.name
          ? entry.name.toLowerCase().includes(filterConfig.name.toLowerCase())
          : true;
        const matchesContact = filterConfig.contact
          ? entry.contact
              .toLowerCase()
              .includes(filterConfig.contact.toLowerCase())
          : true;
        const matchesType =
          filterConfig.type !== 'All' ? entry.type === filterConfig.type : true;
        const matchesCategory =
          filterConfig.category !== 'All'
            ? entry.category === filterConfig.category
            : true;
        const matchesAmount = (() => {
          const min = filterConfig.amountMin
            ? Number(filterConfig.amountMin)
            : -Infinity;
          const max = filterConfig.amountMax
            ? Number(filterConfig.amountMax)
            : Infinity;
          return entry.amount >= min && entry.amount <= max;
        })();
        const matchesDate = (() => {
          const start = filterConfig.dateStart
            ? new Date(filterConfig.dateStart)
            : new Date(-8640000000000000); // Min date
          const end = filterConfig.dateEnd
            ? new Date(filterConfig.dateEnd)
            : new Date(8640000000000000); // Max date
          const entryDate = new Date(entry.date);
          return entryDate >= start && entryDate <= end;
        })();
        const matchesProperty =
          filterConfig.property !== 'All'
            ? entry.property === filterConfig.property
            : true;

        return (
          matchesSearch &&
          matchesName &&
          matchesContact &&
          matchesType &&
          matchesCategory &&
          matchesAmount &&
          matchesDate &&
          matchesProperty
        );
      })
      .sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        if (sortConfig.key === 'date' || sortConfig.key === 'monthYear') {
          return sortConfig.direction === 'asc'
            ? new Date(a.date).getTime() - new Date(b.date).getTime()
            : new Date(b.date).getTime() - new Date(a.date).getTime();
        }
        if (sortConfig.key === 'amount') {
          return sortConfig.direction === 'asc'
            ? a.amount - b.amount
            : b.amount - a.amount;
        }
        return sortConfig.direction === 'asc'
          ? String(aValue).localeCompare(String(bValue))
          : String(bValue).localeCompare(String(aValue));
      });
  }, [entries, searchTerm, filterConfig, sortConfig]);

  const totals = useMemo(() => {
    const income = filteredEntries
      .filter((entry) => entry.type === 'Income')
      .reduce(
        (acc, entry) => ({
          amount: acc.amount + entry.amount,
          count: acc.count + 1,
        }),
        { amount: 0, count: 0 }
      );
    const expense = filteredEntries
      .filter((entry) => entry.type === 'Expense')
      .reduce(
        (acc, entry) => ({
          amount: acc.amount + entry.amount,
          count: acc.count + 1,
        }),
        { amount: 0, count: 0 }
      );
    return { income, expense };
  }, [filteredEntries]);

  const paginatedEntries = useMemo(() => {
    const startIndex = (currentPage - 1) * entriesPerPage;
    const endIndex = startIndex + entriesPerPage;
    return filteredEntries.slice(startIndex, endIndex);
  }, [filteredEntries, currentPage, entriesPerPage]);

  const totalPages = Math.ceil(filteredEntries.length / entriesPerPage);

  const handleSort = (key: keyof Entry | 'amount' | 'monthYear') => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const getPaginationRange = () => {
    const delta = 1;
    const range: (number | string)[] = [];
    const rangeWithDots: (number | string)[] = [];

    range.push(1);
    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) {
      range.push(i);
    }
    if (totalPages > 1) {
      range.push(totalPages);
    }

    let prevPage = 0;
    for (const page of range) {
      if (prevPage && page - prevPage > 1) {
        rangeWithDots.push('...');
      }
      rangeWithDots.push(page);
      prevPage = page;
    }

    return rangeWithDots;
  };

  const handleFilterChange = (
    field: keyof FilterConfig,
    value: string | number
  ) => {
    setFilterConfig((prev) => ({ ...prev, [field]: value }));
  };

  const clearFilters = () => {
    setFilterConfig({
      name: '',
      contact: '',
      type: 'All',
      category: 'All',
      amountMin: '',
      amountMax: '',
      dateStart: '',
      dateEnd: '',
      property: 'All',
    });
    setSearchTerm('');
  };

  const onSubmit = async (data: EntryFormData) => {
    try {
      if (editingEntry) {
        await updateEntry({ ...data, id: editingEntry.id });
        if (notificationsEnabled) {
          toast.success('Entry updated successfully');
        }
      } else {
        await addEntry(data);
        if (notificationsEnabled) {
          toast.success('Entry added successfully');
        }
      }
      setIsDialogOpen(false);
      reset();
      setEditingEntry(null);
    } catch (error: any) {
      console.error('Entries.tsx: Error saving entry:', error);
      if (error.message.includes('No document to update')) {
        setIsDialogOpen(false);
        setEditingEntry(null);
        reset();
        if (notificationsEnabled) {
          toast.error('Entry was deleted. Please refresh.');
        }
      } else {
        if (notificationsEnabled) {
          toast.error('Failed to save entry: ' + error.message);
        }
      }
    }
  };

  const handleEdit = (entry: Entry) => {
    setEditingEntry(entry);
    setValue('name', entry.name);
    setValue('contact', entry.contact);
    setValue('type', entry.type);
    setValue('category', entry.category);
    setValue('amount', entry.amount);
    setValue('date', entry.date);
    setValue('renewDate', entry.renewDate);
    setValue('renewDateReminder', entry.renewDateReminder);
    setValue('property', entry.property);
    setIsDialogOpen(true);
  };

  const handleDuplicate = (entry: Entry) => {
    setEditingEntry(null);
    setValue('name', entry.name);
    setValue('contact', entry.contact);
    setValue('type', entry.type);
    setValue('category', entry.category);
    setValue('amount', entry.amount);
    setValue('date', format(new Date(), 'yyyy-MM-dd'));
    setValue('renewDate', format(addDays(new Date(), 30), 'yyyy-MM-dd'));
    setValue('renewDateReminder', entry.renewDateReminder);
    setValue('property', entry.property);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    console.log('Entries.tsx: Attempting to delete entry ID:', id);
    setIsDeleting(id);
    try {
      const entryDoc = doc(db, 'entries', id);
      const docSnap = await getDoc(entryDoc);
      if (!docSnap.exists()) {
        console.warn('Entries.tsx: Entry does not exist:', id);
        if (notificationsEnabled) {
          toast.error('Entry was already deleted. Please refresh.');
        }
        return;
      }
      await deleteEntry(id);
      console.log('Entries.tsx: Delete successful for ID:', id);
      if (notificationsEnabled) {
        toast.success('Entry deleted successfully');
      }
    } catch (error: any) {
      console.error('Entries.tsx: Error deleting entry:', error);
      if (error.message.includes('No document to delete')) {
        if (notificationsEnabled) {
          toast.error('Entry was already deleted. Please refresh.');
        }
      } else {
        if (notificationsEnabled) {
          toast.error('Failed to delete entry: ' + error.message);
        }
      }
    } finally {
      setIsDeleting(null);
    }
  };

  const generatePDF = (entry: Entry) => {
    if (!settings) {
      if (notificationsEnabled) {
        toast.error('Settings not loaded. Cannot generate PDF.');
      }
      return;
    }
    const doc = new jsPDF();
    let template = settings.pdfTemplate;
    const amountInWords = numberToWordsIndian(entry.amount);
    const monthYear = format(new Date(entry.date), 'MMM-yyyy');
    template = template
      .replace('{{id}}', entry.id)
      .replace('{{name}}', entry.name)
      .replace('{{contact}}', entry.contact)
      .replace('{{type}}', entry.type)
      .replace('{{category}}', entry.category)
      .replace('{{amount}}', entry.amount.toString())
      .replace('{{amountInWords}}', amountInWords)
      .replace('{{date}}', entry.date)
      .replace('{{monthyear}}', monthYear)
      .replace('{{renewDate}}', entry.renewDate)
      .replace('{{renewDateReminder}}', entry.renewDateReminder.toString())
      .replace('{{property}}', entry.property)
      .replace(
        '{{currency}}',
        currency === 'INR' ? '₹' : currency === 'USD' ? '$' : ''
      );
    doc.text(template, 10, 10);
    const filename = settings.pdfFilename
      .replace('{{name}}', entry.name)
      .replace('{{date}}', entry.date)
      .replace('{{type}}', entry.type);
    doc.save(`${filename}.pdf`);
    if (notificationsEnabled) {
      toast.success('PDF generated successfully');
    }
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    reset();
    setEditingEntry(null);
  };

  const handleAddEntry = () => {
    setEditingEntry(null);
    reset({
      name: '',
      contact: '',
      type: 'Income',
      category: settings?.incomeCategories[0] || '',
      amount: 0,
      date: format(new Date(), 'yyyy-MM-dd'),
      renewDate: format(new Date(), 'yyyy-MM-dd'),
      renewDateReminder: 0,
      property: settings?.properties[0] || '',
    });
    setIsDialogOpen(true);
  };

  // Function to determine row color based on renewDateReminder
  const getRowColor = (entry: Entry) => {
    if (entry.renewDateReminder === 0) return '';
    const today = new Date('2025-05-21');
    const renewDate = new Date(entry.renewDate);
    const daysUntilRenew = differenceInDays(renewDate, today);
    if (daysUntilRenew <= entry.renewDateReminder) {
      if (daysUntilRenew <= 5) {
        return 'bg-red-100 dark:bg-red-900/20';
      } else if (daysUntilRenew <= 10) {
        return 'bg-yellow-100 dark:bg-yellow-900/20';
      } else if (daysUntilRenew <= 15) {
        return 'bg-green-100 dark:bg-green-900/20';
      }
    }
    return '';
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Entries</h2>
      <div className="flex flex-col sm:flex-row justify-between mb-4 space-y-4 sm:space-y-0 sm:space-x-4">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search all fields..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Select
            onValueChange={(value) => {
              setEntriesPerPage(Number(value));
              setCurrentPage(1);
            }}
            defaultValue="10"
          >
            <SelectTrigger className="w-20">
              <SelectValue placeholder="Per page" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="15">15</SelectItem>
              <SelectItem value="20">20</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleAddEntry} disabled={isLoading}>
            Add Entry
          </Button>
        </div>
      </div>

      <Collapsible open={isFilterOpen} onOpenChange={setIsFilterOpen}>
        <CollapsibleContent className="mb-4">
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="filter-name">Name</Label>
                  <Input
                    id="filter-name"
                    value={filterConfig.name}
                    onChange={(e) => handleFilterChange('name', e.target.value)}
                    placeholder="Filter by name"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-contact">Contact</Label>
                  <Input
                    id="filter-contact"
                    value={filterConfig.contact}
                    onChange={(e) =>
                      handleFilterChange('contact', e.target.value)
                    }
                    placeholder="Filter by contact"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-type">Type</Label>
                  <Select
                    value={filterConfig.type}
                    onValueChange={(value) => handleFilterChange('type', value)}
                  >
                    <SelectTrigger id="filter-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All</SelectItem>
                      <SelectItem value="Income">Income</SelectItem>
                      <SelectItem value="Expense">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filter-category">Category</Label>
                  <Select
                    value={filterConfig.category}
                    onValueChange={(value) =>
                      handleFilterChange('category', value)
                    }
                    disabled={!settings}
                  >
                    <SelectTrigger id="filter-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All</SelectItem>
                      {settings?.incomeCategories
                        .concat(settings.expenseCategories)
                        .map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filter-amount-min">Amount (Min)</Label>
                  <Input
                    id="filter-amount-min"
                    type="number"
                    value={filterConfig.amountMin}
                    onChange={(e) =>
                      handleFilterChange('amountMin', e.target.value)
                    }
                    placeholder="Min amount"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-amount-max">Amount (Max)</Label>
                  <Input
                    id="filter-amount-max"
                    type="number"
                    value={filterConfig.amountMax}
                    onChange={(e) =>
                      handleFilterChange('amountMax', e.target.value)
                    }
                    placeholder="Max amount"
                  />
                </div>
                <div>
                  <Label htmlFor="filter-date-start">Date (Start)</Label>
                  <Input
                    id="filter-date-start"
                    type="date"
                    value={filterConfig.dateStart}
                    onChange={(e) =>
                      handleFilterChange('dateStart', e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="filter-date-end">Date (End)</Label>
                  <Input
                    id="filter-date-end"
                    type="date"
                    value={filterConfig.dateEnd}
                    onChange={(e) =>
                      handleFilterChange('dateEnd', e.target.value)
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="filter-property">Property</Label>
                  <Select
                    value={filterConfig.property}
                    onValueChange={(value) =>
                      handleFilterChange('property', value)
                    }
                    disabled={!settings}
                  >
                    <SelectTrigger id="filter-property">
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All</SelectItem>
                      {settings?.properties.map((prop) => (
                        <SelectItem key={prop} value={prop}>
                          {prop}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  disabled={isLoading}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p
                className={cn(
                  'text-green-600 text-lg font-semibold',
                  totals.income.amount === 0 && 'text-muted-foreground'
                )}
              >
                Income ={' '}
                {currency === 'USD'
                  ? totals.income.amount.toLocaleString('en-US', {
                      currency: 'USD',
                      style: 'currency',
                    })
                  : totals.income.amount.toLocaleString('en-IN', {
                      ...(currency === 'INR' && {
                        currency: 'INR',
                        style: 'currency',
                      }),
                    })}
                <span className="text-sm font-normal">
                  {' '}
                  ({totals.income.count})
                </span>
              </p>
            </div>
            <div>
              <p
                className={cn(
                  'text-red-600 text-lg font-semibold',
                  totals.expense.amount === 0 && 'text-muted-foreground'
                )}
              >
                Expense ={' '}
                {currency === 'USD'
                  ? totals.expense.amount.toLocaleString('en-US', {
                      currency: 'USD',
                      style: 'currency',
                    })
                  : totals.income.amount.toLocaleString('en-IN', {
                      ...(currency === 'INR' && {
                        currency: 'INR',
                        style: 'currency',
                      }),
                    })}
                <span className="text-sm font-normal">
                  {' '}
                  ({totals.expense.count})
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Name</TableHead>
                <TableHead className="w-40">Contact</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="w-40">Amount in Words</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Month-Year</TableHead>
                <TableHead>Renew Date</TableHead>
                <TableHead>Reminder</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(5)].map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-16" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-20" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-16" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-12" />
                  </TableCell>
                  <TableCell>
                    <div className="h-4 bg-gray-200 rounded animate-pulse" />
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      {[...Array(4)].map((_, i) => (
                        <div
                          key={i}
                          className="h-8 w-8 bg-gray-200 rounded animate-pulse"
                        />
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : filteredEntries.length === 0 ? (
        <Card className="p-6 text-center">
          <CardHeader>
            <PlusCircle className="h-12 w-12 mx-auto text-muted-foreground" />
            <CardTitle className="mt-4">
              {searchTerm || Object.values(filterConfig).some((v) => v)
                ? 'No entries match your filters'
                : 'No entries found'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {searchTerm || Object.values(filterConfig).some((v) => v)
                ? 'Try adjusting your filters or add a new entry.'
                : 'Get started by adding your first entry!'}
            </p>
            <Button onClick={handleAddEntry} disabled={isLoading}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Entry
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    onClick={() => handleSort('name')}
                    className="cursor-pointer w-40"
                  >
                    Name{' '}
                    {sortConfig.key === 'name' &&
                      (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('contact')}
                    className="cursor-pointer w-40"
                  >
                    Contact{' '}
                    {sortConfig.key === 'contact' &&
                      (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('type')}
                    className="cursor-pointer"
                  >
                    Type{' '}
                    {sortConfig.key === 'type' &&
                      (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('category')}
                    className="cursor-pointer"
                  >
                    Category{' '}
                    {sortConfig.key === 'category' &&
                      (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('amount')}
                    className="cursor-pointer"
                  >
                    Amount{' '}
                    {sortConfig.key === 'amount' &&
                      (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead className="w-40">Amount in Words</TableHead>
                  <TableHead
                    onClick={() => handleSort('date')}
                    className="cursor-pointer"
                  >
                    Date{' '}
                    {sortConfig.key === 'date' &&
                      (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('monthYear')}
                    className="cursor-pointer"
                  >
                    Month-Year{' '}
                    {sortConfig.key === 'monthYear' &&
                      (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('renewDate')}
                    className="cursor-pointer"
                  >
                    Renew Date{' '}
                    {sortConfig.key === 'renewDate' &&
                      (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('renewDateReminder')}
                    className="cursor-pointer"
                  >
                    Reminder{' '}
                    {sortConfig.key === 'renewDateReminder' &&
                      (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead
                    onClick={() => handleSort('property')}
                    className="cursor-pointer"
                  >
                    Property{' '}
                    {sortConfig.key === 'property' &&
                      (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEntries.map((entry) => (
                  <TableRow key={entry.id} className={cn(getRowColor(entry))}>
                    <TableCell className="truncate max-w-40">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            {entry.name.length > 20
                              ? entry.name.substring(0, 20) + '...'
                              : entry.name}
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 rounded shadow-md">
                            <p>{entry.name}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="truncate max-w-40">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            {entry.contact.length > 20
                              ? entry.contact.substring(0, 20) + '...'
                              : entry.contact}
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 rounded shadow-md">
                            <p>{entry.contact}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell
                      className={cn(
                        entry.type === 'Income'
                          ? 'text-green-600'
                          : 'text-red-600'
                      )}
                    >
                      {entry.type}
                    </TableCell>
                    <TableCell>{entry.category}</TableCell>
                    <TableCell>
                      {currency === 'USD'
                        ? entry.amount.toLocaleString('en-US', {
                            currency: 'USD',
                            style: 'currency',
                          })
                        : entry.amount.toLocaleString('en-IN', {
                            ...(currency === 'INR' && {
                              currency: 'INR',
                              style: 'currency',
                            }),
                          })}
                    </TableCell>
                    <TableCell className="truncate max-w-40">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            {numberToWordsIndian(entry.amount).substring(0, 20)}
                            ...
                          </TooltipTrigger>
                          <TooltipContent className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 rounded shadow-md">
                            <p>{numberToWordsIndian(entry.amount)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>{entry.date}</TableCell>
                    <TableCell>
                      {format(new Date(entry.date), 'MMM-yyyy')}
                    </TableCell>
                    <TableCell>{entry.renewDate}</TableCell>
                    <TableCell>{entry.renewDateReminder} days</TableCell>
                    <TableCell>{entry.property}</TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDuplicate(entry)}
                                disabled={isLoading || isDeleting === entry.id}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 rounded shadow-md">
                              <p>Duplicate</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => generatePDF(entry)}
                                disabled={isLoading || isDeleting === entry.id}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 rounded shadow-md">
                              <p>Generate PDF</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider delayDuration={0}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(entry)}
                                disabled={isLoading || isDeleting === entry.id}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 rounded shadow-md">
                              <p>Edit</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(entry.id)}
                                disabled={isLoading || isDeleting === entry.id}
                              >
                                {isDeleting === entry.id ? (
                                  <div className="animate-spin h-4 w-4 border-2 border-t-transparent border-gray-500 rounded-full" />
                                ) : (
                                  <Trash className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 rounded shadow-md">
                              <p>Delete</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-center mt-4 space-y-4 sm:space-y-0">
            <div className="flex items-center space-x-2">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * entriesPerPage + 1} to{' '}
                {Math.min(currentPage * entriesPerPage, filteredEntries.length)}{' '}
                of {filteredEntries.length} entries
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              {getPaginationRange().map((item, index) =>
                typeof item === 'string' ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="text-sm text-muted-foreground px-2"
                  >
                    ...
                  </span>
                ) : (
                  <Button
                    key={item}
                    variant={currentPage === item ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePageChange(item)}
                    disabled={isLoading}
                  >
                    {item}
                  </Button>
                )
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || isLoading}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingEntry ? 'Edit Entry' : 'Add Entry'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" {...register('name')} />
                {errors.name && (
                  <p className="text-red-600 text-sm">{errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="contact">Contact</Label>
                <Input id="contact" {...register('contact')} />
                {errors.contact && (
                  <p className="text-red-600 text-sm">
                    {errors.contact.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="type">Type</Label>
                <Select
                  onValueChange={(value) =>
                    setValue('type', value as 'Income' | 'Expense')
                  }
                  value={watch('type') || 'Income'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Income">Income</SelectItem>
                    <SelectItem value="Expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
                {errors.type && (
                  <p className="text-red-600 text-sm">{errors.type.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  onValueChange={(value) => setValue('category', value)}
                  value={watch('category') || ''}
                  disabled={!settings}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {settings ? (
                      (entryType === 'Income'
                        ? settings.incomeCategories
                        : settings.expenseCategories
                      ).map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>
                        Loading categories...
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {errors.category && (
                  <p className="text-red-600 text-sm">
                    {errors.category.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  {...register('amount', { valueAsNumber: true })}
                />
                {errors.amount && (
                  <p className="text-red-600 text-sm">
                    {errors.amount.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" {...register('date')} />
                {errors.date && (
                  <p className="text-red-600 text-sm">{errors.date.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="renewDate">Renew Date</Label>
                <Input id="renewDate" type="date" {...register('renewDate')} />
                {errors.renewDate && (
                  <p className="text-red-600 text-sm">
                    {errors.renewDate.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="renewDateReminder">Renew Date Reminder</Label>
                <Select
                  onValueChange={(value) =>
                    setValue(
                      'renewDateReminder',
                      Number(value) as 0 | 5 | 10 | 15
                    )
                  }
                  value={watch('renewDateReminder')?.toString() || '0'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select reminder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 days</SelectItem>
                    <SelectItem value="5">5 days</SelectItem>
                    <SelectItem value="10">10 days</SelectItem>
                    <SelectItem value="15">15 days</SelectItem>
                  </SelectContent>
                </Select>
                {errors.renewDateReminder && (
                  <p className="text-red-600 text-sm">
                    {errors.renewDateReminder.message}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="property">Property</Label>
                <Select
                  onValueChange={(value) => setValue('property', value)}
                  value={watch('property') || ''}
                  disabled={!settings}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {settings ? (
                      settings.properties.map((prop) => (
                        <SelectItem key={prop} value={prop}>
                          {prop}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>
                        Loading properties...
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                {errors.property && (
                  <p className="text-red-600 text-sm">
                    {errors.property.message}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={handleCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !settings}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Entries;
