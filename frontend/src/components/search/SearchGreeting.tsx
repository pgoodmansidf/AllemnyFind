import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Sun, Moon, Cloud } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export const SearchGreeting: React.FC = () => {
  const { user } = useAuthStore();
  const [greeting, setGreeting] = useState('');
  const [timeIcon, setTimeIcon] = useState<React.ReactNode>(null);

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      
      let greetingText = '';
      let icon = null;
      
      if (hour >= 5 && hour < 12) {
        greetingText = 'Good morning';
        icon = <Sun className="h-5 w-5 text-yellow-400" />;
      } else if (hour >= 12 && hour < 17) {
        greetingText = 'Good afternoon';
        icon = <Cloud className="h-5 w-5 text-blue-400" />;
      } else if (hour >= 17 && hour < 22) {
        greetingText = 'Good evening';
        icon = <Moon className="h-5 w-5 text-purple-400" />;
      } else {
        greetingText = 'Good night';
        icon = <Moon className="h-5 w-5 text-indigo-400" />;
      }
      
      const userName = user?.full_name || user?.username || 'there';
      setGreeting(`${greetingText} ${userName}. Happy ${dayOfWeek}!`);
      setTimeIcon(icon);
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [user]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="text-center mb-8"
    >
      <div className="flex items-center justify-center space-x-3 mb-3">
        {timeIcon}
        <h1 className="text-3xl font-bold text-white">{greeting}</h1>
        <Sparkles className="h-6 w-6 text-primary-400" />
      </div>
      <p className="text-white/70 text-lg">
        Studies Business Line
      </p>
    </motion.div>
  );
};