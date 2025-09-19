// src/components/layout/Sidebar.tsx
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Home,
  Search,
  Database,
  Star,
  Zap,
  Settings,
  User,
  Circle,
  Shield,
  Brain,
  BarChart,
  Users,
  Trophy,
  Lightbulb,
  MessageCircle
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useSearchStore } from '@/store/searchStore';

export interface NavigationItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  show?: boolean; // Optional property to control visibility
  className?: string; // Optional custom styling
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  navigationItems?: NavigationItem[];
  customContent?: React.ReactNode; // For page-specific content like search history
  showConnectionStatus?: boolean; // Default true
}

const defaultNavigationItems: NavigationItem[] = [
  {
    path: '/dashboard',
    label: 'Dashboard',
    icon: <Home className="h-5 w-5" />,
    show: true
  },
  {
    path: '/search',
    label: 'Smart Search',
    icon: <Search className="h-5 w-5" />,
    show: true
  },
  {
    path: '/ingestion',
    label: 'Document Ingestion',
    icon: <Database className="h-5 w-5" />,
    show: true
  },
  {
    path: '/smartmatch',
    label: 'SmartMatch',
    icon: <Zap className="h-5 w-5 text-yellow-400" />,
    show: true
  },
  {
    path: '/techvault',
    label: 'Machines',
    icon: <Settings className="h-5 w-5" />,
    show: true
  },
  {
    path: '/knowledgescope',
    label: 'KnowledgeScope',
    icon: <BarChart className="h-5 w-5" />,
    show: true
  },
  {
    path: '/summarization',
    label: 'Summarization',
    icon: <Brain className="h-5 w-5" />,
    show: true
  },
  {
    path: '/starred-documents',
    label: 'Starred Documents',
    icon: <Star className="h-5 w-5" />,
    show: true
  },
  {
    path: '/leaderboard',
    label: 'Leaderboard',
    icon: <Trophy className="h-5 w-5 text-yellow-400" />,
    show: true
  },
  {
    path: '/innovate',
    label: 'Innovate Allemny',
    icon: <Lightbulb className="h-5 w-5 text-purple-400" />,
    show: true
  }
];

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  navigationItems = defaultNavigationItems,
  customContent,
  showConnectionStatus = true
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { isConnected } = useSearchStore();

  // Check if user is admin for admin-only navigation items
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  // Add admin navigation items if user is admin and profile for all users
  const allNavigationItems = React.useMemo(() => {
    const items = [...navigationItems];

    // Add admin-only items
    if (isAdmin) {
      // Check if AI Chat already exists before adding
      if (!items.some(item => item.path === '/chat')) {
        items.push({
          path: '/chat',
          label: 'AI Chat',
          icon: <MessageCircle className="h-5 w-5 text-blue-400" />,
          show: true
        });
      }

      // Check if User Admin already exists before adding
      if (!items.some(item => item.path === '/admin/users')) {
        items.push({
          path: '/admin/users',
          label: 'User Admin',
          icon: <Users className="h-5 w-5" />,
          show: true
        });
      }
    }

    // Add profile for all authenticated users only if it doesn't already exist
    if (!items.some(item => item.path === '/profile')) {
      items.push({
        path: '/profile',
        label: 'My Profile',
        icon: <User className="h-5 w-5" />,
        show: true
      });
    }

    return items.filter(item => item.show !== false);
  }, [navigationItems, isAdmin]);

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: -300 }}
          animate={{ x: 0 }}
          exit={{ x: -300 }}
          transition={{ type: 'spring', damping: 25 }}
          className="fixed left-0 top-0 h-full w-80 z-50 bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col"
        >
          {/* Header */}
          <div className="p-6 pb-4">
            <div className="flex items-center justify-between mb-6">
              <img 
                src="/images/allemny_find_white.png" 
                alt="Navigation"
                className="h-10 object-contain"
              />
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Navigation Section */}
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 px-3">
                Navigation
              </h3>
              {allNavigationItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <button
                    key={item.path}
                    onClick={() => handleNavigate(item.path)}
                    className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-white/10 text-white'
                        : 'hover:bg-white/10 text-white/80 hover:text-white'
                    } ${item.className || ''}`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Content Section (e.g., search history) */}
          {customContent && (
            <div className="flex-1 flex flex-col overflow-hidden px-6">
              {customContent}
            </div>
          )}

          {/* User Info Footer */}
          <div className="p-6 border-t border-white/10 mt-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-primary-500/20 rounded-full flex items-center justify-center">
                  {isAdmin ? (
                    <Shield className="h-5 w-5 text-primary-400" />
                  ) : (
                    <User className="h-5 w-5 text-primary-400" />
                  )}
                </div>
                <div>
                  <p className="text-white font-medium text-sm">
                    {user?.full_name || user?.username || 'User'}
                  </p>
                  <p className="text-white/60 text-xs">
                    {user?.email || 'user@example.com'}
                  </p>
                </div>
              </div>
            </div>
            {showConnectionStatus && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/60">Connection Status</span>
                <div className="flex items-center space-x-1">
                  <Circle className={`h-2 w-2 ${isConnected ? 'text-green-400 fill-green-400' : 'text-red-400 fill-red-400'}`} />
                  <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
                    {isConnected ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};