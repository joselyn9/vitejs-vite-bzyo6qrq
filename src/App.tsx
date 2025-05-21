import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Entries from '@/components/Entries';
import Dashboard from '@/components/Dashboard';
import Settings from '@/components/Settings';
import { useDarkMode } from 'usehooks-ts';

const App: React.FC = () => {
  const { isDarkMode } = useDarkMode({
    defaultValue: localStorage.getItem('theme') === 'dark',
    onChange: (isDark) => {
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', isDark);
    },
  });

  // Ensure initial theme is applied
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  return (
    <Router>
      <div className={isDarkMode ? 'dark' : ''}>
        <Navbar />
        <Routes>
          <Route path="/entries" element={<Entries />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/" element={<Entries />} />
        </Routes>
      </div>
    </Router>
  );
};

export default App;
