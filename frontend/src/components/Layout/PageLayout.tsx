// src/components/layout/PageLayout.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Menu, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Sidebar, NavigationItem } from './Sidebar';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { useAuthStore } from '@/store/authStore';
import { useSearchStore } from '@/store/searchStore';

interface PageLayoutProps {
  children: React.ReactNode;
  customSidebarContent?: React.ReactNode;
  navigationItems?: NavigationItem[];
  showConnectionStatus?: boolean;
  showBottomStatus?: boolean;
}

export const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  customSidebarContent,
  navigationItems,
  showConnectionStatus = true,
  showBottomStatus = true
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const { isConnected } = useSearchStore();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div 
      className="min-h-screen flex relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 25%, #2563eb 50%, #059669 75%, #10b981 100%)',
      }}
    >
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(10)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            transition={{
              duration: Math.random() * 30 + 15,
              repeat: Infinity,
              repeatType: 'reverse',
            }}
          />
        ))}
      </div>

      {/* Top Navigation */}
      <div className="fixed top-4 left-0 right-0 z-40 px-4">
        <div className="flex items-center justify-between">
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={toggleSidebar}
            className="p-3 rounded-lg bg-white/10 backdrop-blur-sm hover:bg-white/20 transition-colors text-white"
          >
            <Menu className="h-5 w-5" />
          </motion.button>

          <Button
            variant="glass"
            size="sm"
            icon={<LogOut className="h-4 w-4" />}
            onClick={handleLogout}
          >
            
          </Button>
        </div>
      </div>

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        customContent={customSidebarContent}
        navigationItems={navigationItems}
        showConnectionStatus={showConnectionStatus}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-10">
        {children}
      </div>

      {/* Bottom Status Indicators */}
      {showBottomStatus && (
        <div className="fixed bottom-4 left-0 right-0 z-40">
          <div className="px-4 flex items-center justify-between">
            <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-50"
            >
            <img 
                src="/images/allemny_find_white_small3.png" 
                alt="Allemny"
                className="h-auto w-auto"
                style={{ 
                filter: 'brightness(1.2) contrast(1.1) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))',
                maxHeight: '40px'
                }}
            />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <GlassCard className={`px-4 py-2 flex items-center space-x-2 ${
                isConnected ? 'border-green-500/30' : 'border-red-500/30'
              }`}>
                {isConnected ? (
                  <>
                    <Wifi className="h-4 w-4 text-green-400" />
                    <span className="text-green-400 text-sm font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-4 w-4 text-red-400" />
                    <span className="text-red-400 text-sm font-medium">Disconnected</span>
                  </>
                )}
              </GlassCard>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
};