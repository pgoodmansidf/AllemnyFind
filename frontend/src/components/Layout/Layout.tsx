// src/components/Layout/Layout.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { LogOut, User, Settings, Database, Home, Search, Brain, Zap, BarChart3, Trophy, Lightbulb, MessageCircle } from "lucide-react";
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { useIngestionStore } from '@/store/ingestionStore';
import { useJobProgress } from '@/hooks/useJobProgress';
import { GlassCard } from '@/components/ui/GlassCard';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, logout } = useAuthStore();
  const { jobs } = useIngestionStore();
  const { getActiveJobs } = useJobProgress();
  const location = useLocation();
  const navigate = useNavigate();

  const activeJobs = getActiveJobs();

  // Check if user is admin
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const handleLogout = async () => {
    await logout();
  };

  const navigationItems = [
    {
      path: '/dashboard',
      name: 'Dashboard',
      icon: <Home className="h-5 w-5" />,
    },
    {
      path: '/search',
      name: 'Search',
      icon: <Search className="h-5 w-5" />,
    },
    {
      path: '/summarization',
      name: 'Summarization',
      icon: <Brain className="h-5 w-5" />,
    },
    {
      path: '/smartmatch',
      name: 'SmartMatch',
      icon: <Zap className="h-5 w-5 text-yellow-400" />,
    },
    {
      path: '/knowledgescope',
      name: 'KnowledgeScope',
      icon: <BarChart3 className="h-5 w-5 text-purple-400" />,
    },
    {
      path: "/leaderboard",
      name: "Leaderboard",
      icon: <Trophy className="h-5 w-5 text-yellow-400" />,
    },
    {
      path: "/innovate",
      name: "Innovate Allemny",
      icon: <Lightbulb className="h-5 w-5 text-purple-400" />,
    },
    {
      path: "/chat",
      name: "AI Chat",
      icon: <MessageCircle className="h-5 w-5 text-blue-400" />,
      adminOnly: true,
    },
    {
      path: '/ingestion',
      name: 'Document Ingestion',
      icon: <Database className="h-5 w-5" />,
      badge: activeJobs.length > 0 ? `${activeJobs.length} active` : undefined,
    },
  ];

  return (
    <div className="min-h-screen flex" style={{
      background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 25%, #2563eb 50%, #059669 75%, #10b981 100%)',
    }}>
      {/* Sidebar */}
      <motion.aside
        className="w-64 bg-black/20 backdrop-blur-xl border-r border-white/10 p-4"
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        {/* Logo */}
        <div className="flex items-center justify-center mb-8 py-4">
          <img 
            src="/images/allemny_find_white.png" 
            alt="Allemny Find" 
            className="h-12 w-auto object-contain"
          />
        </div>

        {/* Navigation */}
        <nav className="space-y-2">
          {navigationItems.filter(item => !item.adminOnly || isAdmin).map((item) => (
            <motion.button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`
                w-full flex items-center justify-between px-4 py-3 rounded-lg
                transition-all duration-200 group
                ${location.pathname === item.path 
                  ? 'bg-white/20 text-white' 
                  : 'hover:bg-white/10 text-white/70 hover:text-white'}
              `}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center space-x-3">
                <span className={location.pathname === item.path ? 'text-white' : 'text-white/70'}>
                  {item.icon}
                </span>
                <span className="font-medium">{item.name}</span>
              </div>
              {item.badge && (
                <span className="text-xs bg-primary-500/20 text-primary-300 px-2 py-1 rounded-full">
                  {item.badge}
                </span>
              )}
            </motion.button>
          ))}
        </nav>

        {/* User Section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
          <GlassCard className="p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-success-400 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    {user?.full_name || user?.username}
                  </p>
                  <p className="text-xs text-white/60">{user?.role}</p>
                </div>
              </div>
            </div>
            <Button
              variant="glass"
              size="sm"
              className="w-full"
              icon={<LogOut className="h-4 w-4" />}
              onClick={handleLogout}
            >
              Logout
            </Button>
          </GlassCard>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
};