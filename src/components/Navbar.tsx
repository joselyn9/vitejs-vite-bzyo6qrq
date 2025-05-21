import { useState, useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

const Navbar: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    // Initialize based on localStorage or system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    // Apply theme on mount and update
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode((prev) => !prev);
  };

  return (
    <nav className="bg-primary text-primary-foreground p-4 shadow-md">
      <div className="max-w-4xl mx-auto flex justify-between items-center">
        <Link to="/" className="text-xl font-bold">
          Finance Tracker
        </Link>
        <div className="flex items-center space-x-4">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              cn('hover:underline', isActive ? 'font-semibold underline' : '')
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/"
            className={({ isActive }) =>
              cn('hover:underline', isActive ? 'font-semibold underline' : '')
            }
          >
            Entries
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn('hover:underline', isActive ? 'font-semibold underline' : '')
            }
          >
            Settings
          </NavLink>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleDarkMode}
            aria-label={
              isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'
            }
          >
            {isDarkMode ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
