import { useState, useEffect, useMemo } from 'react';
import { getEntries } from '@/services/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { numberToWordsIndian } from '@/utils/numberToWordsIndian';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ClipLoader } from 'react-spinners';
import { useDebounce } from 'use-debounce';
import { DateRangePicker } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, Timestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

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

const Dashboard: React.FC = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [filter, setFilter] = useState<string>('Current Month');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [customRange, setCustomRange] = useState({
    startDate: new Date(),
    endDate: new Date(),
    key: 'selection',
  });
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Entry | 'amount';
    direction: 'asc' | 'desc';
  }>({ key: 'date', direction: 'desc' });
  const [debouncedEntries] = useDebounce(entries, 1000);
  const today = new Date().toISOString().split('T')[0];
  const notificationsEnabled =
    localStorage.getItem('notificationsEnabled') !== 'false';

  useEffect(() => {
    setIsLoading(true);
    const entriesCol = collection(db, 'entries');
    const unsubscribe = onSnapshot(
      entriesCol,
      (snapshot) => {
        try {
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
          setEntries(fetchedEntries);
          console.log(
            'Dashboard: Fetched entries:',
            fetchedEntries.map((e) => ({ id: e.id, date: e.date }))
          );
          setIsLoading(false);
        } catch (error) {
          console.error('Failed to sync entries:', error);
          setEntries([]);
          if (notificationsEnabled) {
            toast.error('Failed to sync data');
          }
          setIsLoading(false);
        }
      },
      (error) => {
        console.error('Firestore snapshot error:', error);
        setEntries([]);
        if (notificationsEnabled) {
          toast.error('Failed to sync data');
        }
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const uniqueMonths = useMemo(() => {
    const months = new Set<string>();
    entries.forEach((entry) => {
      const date = new Date(entry.date);
      if (isNaN(date.getTime())) {
        console.error('Invalid entry date:', entry.date);
        return;
      }
      const monthYear = date.toLocaleString('en-US', {
        month: 'short',
        year: 'numeric',
      });
      months.add(monthYear);
    });
    return Array.from(months).sort((a, b) => {
      const [monthA, yearA] = a.split(' ');
      const [monthB, yearB] = b.split(' ');
      const dateA = new Date(`${monthA} 1, ${yearA}`);
      const dateB = new Date(`${monthB} 1, ${yearB}`);
      return dateA.getTime() - dateB.getTime();
    });
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const result = entries.filter((entry) => {
      const entryDate = new Date(entry.date);
      if (isNaN(entryDate.getTime())) {
        console.error('Invalid entry date in filter:', entry.date);
        return false;
      }
      const now = new Date();
      if (filter === 'Last 7 Days') {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        return entryDate >= sevenDaysAgo && entryDate <= now;
      } else if (filter === 'Last 30 Days') {
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);
        return entryDate >= thirtyDaysAgo && entryDate <= now;
      } else if (filter === 'Current Month') {
        return (
          entryDate.getMonth() === now.getMonth() &&
          entryDate.getFullYear() === now.getFullYear()
        );
      } else if (filter === 'Current Year') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        return entryDate >= startOfYear && entryDate <= now;
      } else if (filter === 'Custom Range') {
        const start = new Date(customRange.startDate);
        const end = new Date(customRange.endDate);
        return entryDate >= start && entryDate <= end;
      } else {
        const normalizedFilter = filter.replace(' ', '-');
        const [month, year] = normalizedFilter.split('-');
        const filterMonth = new Date(`${month} 1, 2000`).getMonth();
        const filterYear = parseInt(year);
        if (isNaN(filterMonth) || isNaN(filterYear)) {
          console.error(
            'Invalid filter format:',
            filter,
            'Month:',
            month,
            'Year:',
            year
          );
          return false;
        }
        return (
          entryDate.getMonth() === filterMonth &&
          entryDate.getFullYear() === filterYear
        );
      }
    });
    console.log(
      'Dashboard: Filter:',
      filter,
      'Filtered entries:',
      result.map((e) => ({ id: e.id, date: e.date }))
    );
    return result;
  }, [entries, filter, customRange]);

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

  const summaryMetrics = useMemo(() => {
    const totalIncome = totals.income.amount;
    const totalExpense = totals.expense.amount;
    const netBalance = totalIncome - totalExpense;
    const avgIncome =
      totals.income.count > 0 ? totalIncome / totals.income.count : 0;
    const avgExpense =
      totals.expense.count > 0 ? totalExpense / totals.expense.count : 0;
    return {
      netBalance,
      avgIncome,
      avgExpense,
      totalTransactions: totals.income.count + totals.expense.count,
    };
  }, [totals]);

  const daysUntil = (date: string, fromDate: string = today): number => {
    const renew = new Date(date);
    const from = new Date(fromDate);
    if (isNaN(renew.getTime()) || isNaN(from.getTime())) return Infinity;
    const diffTime = renew.getTime() - from.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const reminderEntries = useMemo(() => {
    return entries
      .filter(
        (entry) =>
          entry.renewDateReminder > 0 && isFinite(daysUntil(entry.renewDate))
      )
      .map((entry) => {
        const daysToRenew = daysUntil(entry.renewDate);
        let status: 'Approaching' | 'Due' | 'Past Due';
        if (daysToRenew === 0) {
          status = 'Due';
        } else if (daysToRenew < 0) {
          status = 'Past Due';
        } else if (daysToRenew <= entry.renewDateReminder) {
          status = 'Approaching';
        } else {
          return null;
        }
        return { ...entry, status };
      })
      .filter(
        (
          entry
        ): entry is Entry & { status: 'Approaching' | 'Due' | 'Past Due' } =>
          entry !== null
      )
      .sort(
        (a, b) =>
          new Date(a.renewDate).getTime() - new Date(b.renewDate).getTime()
      );
  }, [entries, today]);

  const handleCSVExport = () => {
    const headers = [
      'id',
      'date',
      'type',
      'category',
      'amount',
      'amountInWords',
      'name',
      'contact',
      'monthYear',
      'renewDate',
      'renewDateReminder',
      'property',
    ];
    const rows = filteredEntries.map((entry) =>
      [
        `"${entry.id}"`,
        `"${entry.date}"`,
        `"${entry.type}"`,
        `"${entry.category}"`,
        `"${entry.amount}"`,
        `"${numberToWordsIndian(entry.amount).replace(/"/g, '""')}"`,
        `"${entry.name.replace(/"/g, '""')}"`,
        `"${entry.contact.replace(/"/g, '""')}"`,
        `"${new Date(entry.date).toLocaleString('en-US', {
          month: 'short',
          year: 'numeric',
        })}"`,
        `"${entry.renewDate}"`,
        `"${entry.renewDateReminder}"`,
        `"${entry.property}"`,
      ].join(',')
    );

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filterName = filter.replace(' ', '-').toLowerCase();
    link.setAttribute('href', url);
    link.setAttribute('download', `finance-tracker-${filterName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    console.log(
      'Exported CSV for filter:',
      filter,
      'Entries:',
      filteredEntries.length
    );
  };

  const lastFiveEntries = useMemo(() => {
    const sorted = [...filteredEntries].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      if (sortConfig.key === 'date') {
        return sortConfig.direction === 'asc'
          ? new Date(aValue).getTime() - new Date(bValue).getTime()
          : new Date(bValue).getTime() - new Date(aValue).getTime();
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
    return sorted.slice(0, 5);
  }, [filteredEntries, sortConfig]);

  const handleSort = (key: keyof Entry | 'amount') => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const properties = [...new Set(filteredEntries.map((e) => e.property))];
  const incomeData = properties.map((prop) => ({
    property: prop,
    income: filteredEntries
      .filter((e) => e.property === prop && e.type === 'Income')
      .reduce((sum, e) => sum + e.amount, 0),
  }));
  const expenseData = properties.map((prop) => ({
    property: prop,
    expense: filteredEntries
      .filter((e) => e.property === prop && e.type === 'Expense')
      .reduce((sum, e) => sum + e.amount, 0),
  }));

  useEffect(() => {
    console.log(
      'Dashboard: Income data:',
      incomeData,
      'Expense data:',
      expenseData,
      'Totals:',
      totals,
      'Last 5 entries:',
      lastFiveEntries.map((e) => ({ id: e.id, date: e.date }))
    );
  }, [incomeData, expenseData, totals, lastFiveEntries]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <ClipLoader color="#16a34a" size={50} />
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-bold mb-4">
            Finance Tracker - Dashboard
          </h2>
          <Card className="mb-8">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-4 sm:space-y-0">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">Filter:</span>
                  <Select value={filter} onValueChange={setFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Last 7 Days">Last 7 Days</SelectItem>
                      <SelectItem value="Last 30 Days">Last 30 Days</SelectItem>
                      <SelectItem value="Current Month">
                        Current Month
                      </SelectItem>
                      <SelectItem value="Current Year">Current Year</SelectItem>
                      <SelectItem value="Custom Range">Custom Range</SelectItem>
                      {uniqueMonths.map((monthYear) => (
                        <SelectItem key={monthYear} value={monthYear}>
                          {monthYear}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCSVExport} variant="secondary">
                  Export CSV
                </Button>
              </div>
              {filter === 'Custom Range' && (
                <Card className="mt-4">
                  <CardContent className="p-4">
                    <DateRangePicker
                      ranges={[customRange]}
                      onChange={(item) => setCustomRange(item.selection)}
                      minDate={new Date('2025-01-01')}
                      maxDate={new Date('2028-12-31')}
                    />
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Summary Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Net Balance</p>
                  <p
                    className={cn(
                      'text-lg font-semibold',
                      summaryMetrics.netBalance >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    )}
                  >
                    {summaryMetrics.netBalance.toLocaleString('en-IN', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Total Transactions</p>
                  <p className="text-lg font-semibold">
                    {summaryMetrics.totalTransactions}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Avg. Income</p>
                  <p className="text-lg font-semibold text-green-600">
                    {summaryMetrics.avgIncome.toLocaleString('en-IN', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Avg. Expense</p>
                  <p className="text-lg font-semibold text-red-600">
                    {summaryMetrics.avgExpense.toLocaleString('en-IN', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Totals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p
                    className={cn(
                      'text-green-600 text-lg font-semibold',
                      totals.income.amount === 0 && 'text-muted-foreground'
                    )}
                  >
                    Income ={' '}
                    {totals.income.amount.toLocaleString('en-IN', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
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
                    {totals.expense.amount.toLocaleString('en-IN', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
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

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Last 5 Entries</CardTitle>
            </CardHeader>
            <CardContent>
              {lastFiveEntries.length === 0 ? (
                <p>No entries in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead
                          onClick={() => handleSort('name')}
                          className="cursor-pointer"
                        >
                          Name{' '}
                          {sortConfig.key === 'name' &&
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
                          onClick={() => handleSort('amount')}
                          className="cursor-pointer"
                        >
                          Amount{' '}
                          {sortConfig.key === 'amount' &&
                            (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </TableHead>
                        <TableHead
                          onClick={() => handleSort('date')}
                          className="cursor-pointer"
                        >
                          Date{' '}
                          {sortConfig.key === 'date' &&
                            (sortConfig.direction === 'asc' ? '↑' : '↓')}
                        </TableHead>
                        <TableHead>Property</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lastFiveEntries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>{entry.name}</TableCell>
                          <TableCell
                            className={cn(
                              entry.type === 'Income'
                                ? 'text-green-600'
                                : 'text-red-600'
                            )}
                          >
                            {entry.type}
                          </TableCell>
                          <TableCell>
                            {entry.amount.toLocaleString('en-IN', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </TableCell>
                          <TableCell>{entry.date}</TableCell>
                          <TableCell>{entry.property}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Property vs Income</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={incomeData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="property" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) =>
                        value.toLocaleString('en-IN', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })
                      }
                    />
                    <Legend />
                    <Bar dataKey="income" fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Property vs Expense</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] sm:h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="property" />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) =>
                        value.toLocaleString('en-IN', {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 0,
                        })
                      }
                    />
                    <Legend />
                    <Bar dataKey="expense" fill="#dc2626" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming Reminders</CardTitle>
            </CardHeader>
            <CardContent>
              {reminderEntries.length === 0 ? (
                <p>No upcoming reminders.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Renew Date</TableHead>
                        <TableHead>Reminder</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reminderEntries.map((entry) => (
                        <TableRow
                          key={entry.id}
                          className={cn(
                            entry.status === 'Past Due'
                              ? 'bg-red-100'
                              : entry.status === 'Due'
                              ? 'bg-orange-100'
                              : 'bg-yellow-100'
                          )}
                        >
                          <TableCell>{entry.name}</TableCell>
                          <TableCell>
                            {entry.amount.toLocaleString('en-IN', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </TableCell>
                          <TableCell>{entry.renewDate}</TableCell>
                          <TableCell>{entry.renewDateReminder} days</TableCell>
                          <TableCell>{entry.status}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Dashboard;
