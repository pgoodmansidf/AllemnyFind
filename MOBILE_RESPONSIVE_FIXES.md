# Mobile Responsive Design Fixes - Allemny Find V2

**Priority Level: HIGH**
**Target Devices: Mobile (320px+), Tablet (768px+), Desktop (1024px+)**

## Overview
This document provides specific code changes to improve mobile responsiveness across all Allemny Find V2 components.

---

## 1. Layout & Navigation Mobile Fixes

### 1.1 Mobile Navigation Menu
**File:** `frontend/src/components/Layout/Layout.tsx`

```tsx
import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuOpen && isMobile) {
        const sidebar = document.getElementById('mobile-sidebar');
        const menuButton = document.getElementById('mobile-menu-button');

        if (sidebar && !sidebar.contains(event.target as Node) &&
            menuButton && !menuButton.contains(event.target as Node)) {
          setMobileMenuOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen, isMobile]);

  return (
    <div className="min-h-screen flex" style={{
      background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 25%, #2563eb 50%, #059669 75%, #10b981 100%)',
    }}>
      {/* Mobile Menu Button */}
      {isMobile && (
        <button
          id="mobile-menu-button"
          className="fixed top-4 left-4 z-50 p-2 bg-black/40 backdrop-blur-md rounded-lg md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          {mobileMenuOpen ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <Menu className="h-6 w-6 text-white" />
          )}
        </button>
      )}

      {/* Mobile Backdrop */}
      {mobileMenuOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <motion.aside
        id="mobile-sidebar"
        className={`
          w-64 bg-black/20 backdrop-blur-xl border-r border-white/10 p-4 z-40
          md:static md:translate-x-0 md:shadow-none
          ${isMobile ? 'fixed inset-y-0 left-0 shadow-xl' : ''}
          ${mobileMenuOpen ? 'translate-x-0' : isMobile ? '-translate-x-full' : 'translate-x-0'}
        `}
        initial={false}
        animate={{
          x: isMobile ? (mobileMenuOpen ? 0 : -256) : 0
        }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {/* Logo - Smaller on mobile */}
        <div className="flex items-center justify-center mb-8 py-4">
          <img
            src="/images/allemny_find_white.png"
            alt="Allemny Find"
            className="h-8 md:h-12 w-auto object-contain"
          />
        </div>

        {/* Navigation - Close menu on mobile after navigation */}
        <nav className="space-y-2">
          {navigationItems.filter(item => !item.adminOnly || isAdmin).map((item) => (
            <motion.button
              key={item.path}
              onClick={() => {
                navigate(item.path);
                if (isMobile) setMobileMenuOpen(false);
              }}
              className={`
                w-full flex items-center justify-between px-3 md:px-4 py-2 md:py-3 rounded-lg
                text-sm md:text-base transition-all duration-200 group
                ${location.pathname === item.path
                  ? 'bg-white/20 text-white'
                  : 'hover:bg-white/10 text-white/70 hover:text-white'}
              `}
              whileHover={{ x: 4 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center space-x-2 md:space-x-3">
                <span className={location.pathname === item.path ? 'text-white' : 'text-white/70'}>
                  {item.icon}
                </span>
                <span className="font-medium truncate">{item.name}</span>
              </div>
              {item.badge && (
                <span className="text-xs bg-primary-500/20 text-primary-300 px-1.5 md:px-2 py-1 rounded-full whitespace-nowrap">
                  {item.badge}
                </span>
              )}
            </motion.button>
          ))}
        </nav>

        {/* User Section - Adjusted for mobile */}
        <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 border-t border-white/10">
          <GlassCard className="p-2 md:p-3">
            <div className="flex items-center justify-between mb-2 md:mb-3">
              <div className="flex items-center space-x-2 md:space-x-3 min-w-0">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-primary-400 to-success-400 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 md:h-5 md:w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs md:text-sm font-medium text-white truncate">
                    {user?.full_name || user?.username}
                  </p>
                  <p className="text-xs text-white/60 truncate">{user?.role}</p>
                </div>
              </div>
            </div>
            <Button
              variant="glass"
              size="sm"
              className="w-full text-xs md:text-sm"
              icon={<LogOut className="h-3 w-3 md:h-4 md:w-4" />}
              onClick={handleLogout}
            >
              Logout
            </Button>
          </GlassCard>
        </div>
      </motion.aside>

      {/* Main Content - Adjusted padding for mobile menu button */}
      <main className={`flex-1 p-4 md:p-6 overflow-y-auto ${isMobile ? 'pt-16' : ''}`}>
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
```

---

## 2. Search Page Mobile Improvements

### 2.1 Mobile Search Interface
**File:** `frontend/src/pages/SearchPage.tsx`

```tsx
// Update SearchPage with mobile-specific improvements
export const SearchPage: React.FC = () => {
  // ... existing code ...

  return (
    <PageLayout customSidebarContent={searchHistoryContent}>
      <div className="flex-1 flex flex-col relative">
        <AnimatePresence mode="wait">
          {!hasSearched ? (
            <motion.div
              key="initial"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center px-4 md:px-6"
            >
              <div className="w-full max-w-4xl">
                <div className="mb-8 md:mb-12">
                  {/* Mobile-optimized greeting */}
                  <div className="text-center mb-8 md:mb-12">
                    <motion.h1
                      className="text-2xl md:text-4xl lg:text-5xl font-bold text-white mb-3 md:mb-4"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      What would you like to find?
                    </motion.h1>
                    <motion.p
                      className="text-sm md:text-lg text-white/70 max-w-2xl mx-auto px-4"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      Search through documents, find products, or ask questions about your data
                    </motion.p>
                  </div>
                </div>

                <SearchBar
                  onSearch={handleSearch}
                  isSearching={false}
                  autoFocus={true}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col relative"
            >
              {/* New Search Button - Responsive positioning */}
              <div className="fixed top-16 md:top-20 left-1/2 transform -translate-x-1/2 z-[100] pointer-events-auto">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="pointer-events-auto"
                >
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<RefreshCw className="h-4 w-4" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleNewSearch();
                    }}
                    disabled={isStreaming || isSearching}
                    className="shadow-lg hover:shadow-xl transition-shadow pointer-events-auto text-xs md:text-sm px-3 md:px-4"
                    style={{ zIndex: 100 }}
                  >
                    <span className="hidden sm:inline">New Search</span>
                    <span className="sm:hidden">New</span>
                  </Button>
                </motion.div>
              </div>

              {/* Results area with mobile padding */}
              <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-16 md:pt-20 pb-24 md:pb-32">
                <SearchResults
                  streamingContent={streamingContent}
                  isStreaming={isStreaming}
                  stageMessage={stageMessage}
                  documentGroups={currentDocumentGroups || documentGroups}
                  responseType={responseType}
                  productData={productData}
                  productList={productList}
                  onProductSelection={handleProductSelection}
                />
              </div>

              {/* Floating Search Button - Mobile optimized */}
              {!showSearchBar && hasSearched && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowSearchBar(true)}
                  className="fixed bottom-16 md:bottom-20 right-4 md:right-6 w-12 h-12 md:w-14 md:h-14 bg-primary-500 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-600 transition-all z-30"
                >
                  <Search className="h-5 w-5 md:h-6 md:w-6 text-white" />
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageLayout>
  );
};
```

### 2.2 Search Bar Mobile Optimization
**File:** `frontend/src/components/search/SearchBar.tsx`

```tsx
// Update SearchBar for mobile responsiveness
export const SearchBar: React.FC<SearchBarProps> = ({ onSearch, isSearching, autoFocus }) => {
  // ... existing code ...

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-4xl mx-auto"
    >
      <div className="relative">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-0">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={query}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="What would you like to search for?"
              disabled={isSearching}
              autoFocus={autoFocus}
              className="w-full px-4 md:px-6 py-3 md:py-4 pr-12 md:pr-16
                        bg-white/10 backdrop-blur-md border border-white/20
                        rounded-l-2xl sm:rounded-r-none rounded-r-2xl
                        text-white placeholder-white/50
                        focus:outline-none focus:ring-2 focus:ring-primary-500
                        focus:border-transparent resize-none
                        text-sm md:text-base"
              rows={1}
              style={{
                minHeight: '48px',
                maxHeight: '120px'
              }}
            />
          </div>

          <Button
            onClick={handleSearch}
            disabled={!query.trim() || isSearching}
            className="px-6 md:px-8 py-3 md:py-4 bg-primary-500 hover:bg-primary-600
                      text-white rounded-r-2xl sm:rounded-l-none rounded-l-2xl
                      transition-all duration-200 flex-shrink-0
                      disabled:opacity-50 disabled:cursor-not-allowed
                      text-sm md:text-base"
            variant="primary"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin mr-2" />
                <span className="hidden sm:inline">Searching...</span>
                <span className="sm:hidden">...</span>
              </>
            ) : (
              <>
                <Search className="h-4 w-4 md:h-5 md:w-5 mr-2" />
                <span className="hidden sm:inline">Search</span>
                <span className="sm:hidden">Go</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
```

---

## 3. Leaderboard Mobile Optimization

### 3.1 Mobile Leaderboard Layout
**File:** `frontend/src/pages/LeaderboardPage.tsx`

```tsx
// Update LeaderboardPage for mobile
export const LeaderboardPage: React.FC = () => {
  // ... existing code ...

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Header - Mobile optimized */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <GlassCard className="p-4 md:p-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 md:mb-6 gap-4">
            <div className="flex items-center space-x-3 md:space-x-4">
              <div className="p-2 md:p-3 rounded-full bg-gradient-to-r from-primary-500 to-primary-600">
                <Trophy className="h-6 w-6 md:h-8 md:w-8 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-3xl font-bold text-white">Leaderboard</h1>
                <p className="text-white/70 text-sm md:text-lg">Community contribution rankings</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 w-full sm:w-auto justify-center"
              size="sm"
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>

          {/* Filters - Mobile stacked */}
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-white/20 pt-4 md:pt-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">Time Period</label>
                  <select
                    value={period}
                    onChange={(e) => setPeriod(e.target.value as LeaderboardPeriod)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {Object.entries(periodLabels).map(([value, label]) => (
                      <option key={value} value={value} className="bg-gray-800">
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">Department</label>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="" className="bg-gray-800">All Departments</option>
                    {departments.map((dept) => (
                      <option key={dept} value={dept} className="bg-gray-800">
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </GlassCard>
      </motion.div>

      {/* Stats Cards - Mobile responsive grid */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6"
        >
          <GlassCard className="p-3 md:p-6 text-center">
            <Users className="h-8 w-8 md:h-12 md:w-12 text-blue-400 mx-auto mb-2 md:mb-3" />
            <h3 className="text-lg md:text-2xl font-bold text-white">{stats.total_users.toLocaleString()}</h3>
            <p className="text-white/70 text-xs md:text-base">Active Users</p>
          </GlassCard>

          <GlassCard className="p-3 md:p-6 text-center">
            <MessageSquare className="h-8 w-8 md:h-12 md:w-12 text-green-400 mx-auto mb-2 md:mb-3" />
            <h3 className="text-lg md:text-2xl font-bold text-white">{stats.total_contributions.toLocaleString()}</h3>
            <p className="text-white/70 text-xs md:text-base">Contributions</p>
          </GlassCard>

          <GlassCard className="p-3 md:p-6 text-center">
            <Heart className="h-8 w-8 md:h-12 md:w-12 text-red-400 mx-auto mb-2 md:mb-3" />
            <h3 className="text-lg md:text-2xl font-bold text-white">{stats.total_likes.toLocaleString()}</h3>
            <p className="text-white/70 text-xs md:text-base">Likes Given</p>
          </GlassCard>

          <GlassCard className="p-3 md:p-6 text-center">
            <Search className="h-8 w-8 md:h-12 md:w-12 text-purple-400 mx-auto mb-2 md:mb-3" />
            <h3 className="text-lg md:text-2xl font-bold text-white">{stats.total_searches.toLocaleString()}</h3>
            <p className="text-white/70 text-xs md:text-base">Searches</p>
          </GlassCard>
        </motion.div>
      )}

      {/* Leaderboard List - Mobile optimized */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <GlassCard className="overflow-hidden">
          <div className="p-4 md:p-6 border-b border-white/20">
            <h2 className="text-lg md:text-2xl font-bold text-white flex items-center">
              <Trophy className="h-5 w-5 md:h-6 md:w-6 mr-2 text-yellow-400" />
              <span>Top Contributors - {periodLabels[period]}</span>
            </h2>
          </div>

          {/* Mobile-optimized leaderboard entries */}
          <div className="divide-y divide-white/10">
            {leaderboard.map((entry, index) => (
              <motion.div
                key={entry.user_id}
                className={`p-3 md:p-6 hover:bg-white/5 transition-colors cursor-pointer ${
                  entry.user_id === user?.id ? 'bg-primary-500/10 border-l-4 border-primary-500' : ''
                }`}
                onClick={() => setExpandedUser(expandedUser === entry.user_id ? null : entry.user_id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 md:space-x-4 flex-1 min-w-0">
                    <div className={`p-2 md:p-3 rounded-full ${getRankBadge(entry.rank)} flex-shrink-0`}>
                      {getRankIcon(entry.rank)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <h3 className="text-sm md:text-lg font-semibold text-white truncate">
                          {entry.full_name || entry.username}
                        </h3>
                        {entry.user_id === user?.id && (
                          <span className="px-2 py-1 bg-primary-500/20 text-primary-300 text-xs rounded-full flex-shrink-0">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 text-xs md:text-sm text-white/70 mt-1">
                        {entry.department && <span className="truncate">{entry.department}</span>}
                        <span className="truncate">Joined {formatDate(entry.join_date)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg md:text-2xl font-bold text-white">{entry.total_score}</div>
                    <div className="text-white/70 text-xs md:text-sm">points</div>
                  </div>
                </div>

                {/* Expanded Details - Mobile stacked layout */}
                {expandedUser === entry.user_id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/20"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 md:gap-4">
                      <div className="text-center">
                        <div className="flex items-center justify-center mb-2">
                          <MessageSquare className="h-4 w-4 md:h-5 md:w-5 text-green-400" />
                        </div>
                        <div className="text-sm md:text-lg font-bold text-white">{entry.contributions_count}</div>
                        <div className="text-white/70 text-xs">Contributions</div>
                      </div>

                      <div className="text-center">
                        <div className="flex items-center justify-center mb-2">
                          <Heart className="h-4 w-4 md:h-5 md:w-5 text-red-400" />
                        </div>
                        <div className="text-sm md:text-lg font-bold text-white">{entry.likes_received}</div>
                        <div className="text-white/70 text-xs">Likes</div>
                      </div>

                      <div className="text-center">
                        <div className="flex items-center justify-center mb-2">
                          <Search className="h-4 w-4 md:h-5 md:w-5 text-blue-400" />
                        </div>
                        <div className="text-sm md:text-lg font-bold text-white">{entry.searches_count}</div>
                        <div className="text-white/70 text-xs">Searches</div>
                      </div>

                      <div className="text-center">
                        <div className="flex items-center justify-center mb-2">
                          <Star className="h-4 w-4 md:h-5 md:w-5 text-yellow-400" />
                        </div>
                        <div className="text-sm md:text-lg font-bold text-white">{entry.documents_starred}</div>
                        <div className="text-white/70 text-xs">Stars</div>
                      </div>

                      <div className="text-center">
                        <div className="flex items-center justify-center mb-2">
                          <Upload className="h-4 w-4 md:h-5 md:w-5 text-purple-400" />
                        </div>
                        <div className="text-sm md:text-lg font-bold text-white">{entry.documents_uploaded}</div>
                        <div className="text-white/70 text-xs">Uploads</div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
};
```

---

## 4. Chat Interface Mobile Optimization

### 4.1 Mobile Chat Layout
**File:** `frontend/src/pages/AllemnyChat.tsx`

```tsx
export const AllemnyChat: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false); // Default closed on mobile
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false); // Close sidebar on mobile
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Mobile backdrop */}
            {isMobile && (
              <div
                className="fixed inset-0 bg-black/50 z-30"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              className={`
                w-72 md:w-80 bg-black/20 backdrop-blur-sm border-r border-white/10 flex flex-col z-40
                ${isMobile ? 'fixed inset-y-0 left-0' : 'relative'}
              `}
            >
              {/* Header */}
              <div className="p-3 md:p-4 border-b border-white/10">
                <div className="flex items-center justify-between mb-3 md:mb-4">
                  <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                    <Bot className="h-5 w-5 md:h-6 md:w-6 text-primary-400" />
                    Allemny Chat
                  </h1>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSidebarOpen(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <Button
                  onClick={createNewConversation}
                  className="w-full bg-primary-600 hover:bg-primary-700 text-white text-sm md:text-base"
                  disabled={isLoading}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Chat
                </Button>
              </div>

              {/* Conversations List */}
              <div className="flex-1 overflow-y-auto p-2">
                {/* ... conversations list with mobile optimization ... */}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-3 md:p-4 border-b border-white/10 bg-black/20 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              {!sidebarOpen && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidebarOpen(true)}
                  className="text-slate-400 hover:text-white"
                >
                  <MessageCircle className="h-4 w-4 md:h-5 md:w-5" />
                </Button>
              )}
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-primary-400" />
                <span className="text-white font-medium text-sm md:text-base">AI Assistant</span>
              </div>
              <div className="hidden sm:block text-xs md:text-sm text-slate-400">
                Powered by Groq & pgvector
              </div>
            </div>
            {user && (
              <div className="text-xs md:text-sm text-slate-400 truncate max-w-32 md:max-w-none">
                {user.full_name || user.username}
              </div>
            )}
          </div>
        </div>

        {/* Messages Area - Mobile optimized */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4">
          {/* Welcome message - Mobile friendly */}
          {messages.length === 0 && !streamingMessage && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center px-4">
                <Bot className="h-12 w-12 md:h-16 md:w-16 text-primary-400 mx-auto mb-3 md:mb-4 opacity-50" />
                <h3 className="text-lg md:text-xl font-semibold text-white mb-2">
                  Welcome to Allemny Chat
                </h3>
                <p className="text-slate-400 max-w-md text-sm md:text-base">
                  Ask me anything about your documents. I can search through your knowledge base
                  and provide detailed answers with citations.
                </p>
              </div>
            </div>
          )}

          {/* Messages */}
          <AnimatePresence>
            {messages.map((message, index) => (
              <MessageBubble
                key={index}
                message={message}
                isOwn={message.role === 'user'}
                isMobile={isMobile}
              />
            ))}
          </AnimatePresence>

          {/* Streaming message */}
          {/* ... existing streaming message code ... */}
        </div>

        {/* Input Area - Mobile optimized */}
        <div className="p-3 md:p-4 border-t border-white/10 bg-black/20 backdrop-blur-sm">
          <div className="flex items-end gap-2 md:gap-3">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask about your documents..."
                className="w-full resize-none bg-white/10 border border-white/20 rounded-lg px-3 md:px-4 py-2 md:py-3 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent backdrop-blur-sm text-sm md:text-base"
                rows={Math.min(Math.max(inputMessage.split('\n').length, 1), 3)}
                disabled={isStreaming}
              />
            </div>
            <Button
              onClick={sendMessage}
              disabled={!inputMessage.trim() || isStreaming}
              className="bg-primary-600 hover:bg-primary-700 text-white p-2 md:p-3 flex-shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 md:h-5 md:w-5 animate-spin" />
              ) : (
                <Send className="h-4 w-4 md:h-5 md:w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Update MessageBubble for mobile
const MessageBubble: React.FC<MessageBubbleProps & { isMobile?: boolean }> = ({
  message,
  isOwn,
  isStreaming = false,
  statusMessage,
  isMobile = false
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 md:gap-3 ${isOwn ? 'justify-end' : 'justify-start'}`}
    >
      {!isOwn && (
        <div className="flex-shrink-0 w-6 h-6 md:w-8 md:h-8 bg-primary-600 rounded-full flex items-center justify-center">
          <Bot className="h-3 w-3 md:h-4 md:w-4 text-white" />
        </div>
      )}

      <div className={`max-w-[85%] md:max-w-3xl ${isOwn ? 'text-right' : 'text-left'}`}>
        <div
          className={`inline-block p-3 md:p-4 rounded-lg text-sm md:text-base ${
            isOwn
              ? 'bg-primary-600 text-white'
              : 'bg-white/10 text-white border border-white/20 backdrop-blur-sm'
          }`}
        >
          {statusMessage && (
            <div className="text-primary-300 text-xs md:text-sm mb-2 flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              {statusMessage}
            </div>
          )}

          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {isStreaming && (
              <span className="inline-block w-2 h-4 md:h-5 bg-primary-400 animate-pulse ml-1" />
            )}
          </div>

          {/* Citations - Mobile optimized */}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t border-white/20">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-3 w-3 text-primary-300" />
                <span className="text-xs text-primary-300 font-medium">Sources:</span>
              </div>
              <div className="space-y-1">
                {message.citations.map((citation, index) => (
                  <div
                    key={index}
                    className="text-xs text-slate-300 bg-black/20 rounded p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3 w-3 flex-shrink-0" />
                      <span className="font-medium truncate">{citation.filename}</span>
                      {citation.page_number && (
                        <span className="text-slate-400 flex-shrink-0">
                          (Page {citation.page_number})
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400 text-xs flex-shrink-0">
                      {Math.round(citation.similarity * 100)}% match
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`text-xs text-slate-400 mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
          <Clock className="h-3 w-3 inline mr-1" />
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>

      {isOwn && (
        <div className="flex-shrink-0 w-6 h-6 md:w-8 md:h-8 bg-slate-600 rounded-full flex items-center justify-center">
          <User className="h-3 w-3 md:h-4 md:w-4 text-white" />
        </div>
      )}
    </motion.div>
  );
};
```

---

## 5. Global Responsive Utilities

### 5.1 Enhanced Tailwind Config
**File:** `frontend/tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '375px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
        // Mobile-first responsive text
        'mobile-xs': ['0.6875rem', { lineHeight: '0.875rem' }], // 11px
        'mobile-sm': ['0.75rem', { lineHeight: '1rem' }], // 12px
        'mobile-base': ['0.875rem', { lineHeight: '1.25rem' }], // 14px
        'mobile-lg': ['1rem', { lineHeight: '1.5rem' }], // 16px
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      // ... existing colors and other config
    },
  },
  plugins: [
    // Add responsive typography plugin
    function({ addUtilities }) {
      addUtilities({
        '.text-responsive': {
          '@apply text-mobile-base sm:text-base': {},
        },
        '.text-responsive-lg': {
          '@apply text-mobile-lg sm:text-lg': {},
        },
        '.text-responsive-xl': {
          '@apply text-lg sm:text-xl': {},
        },
        '.text-responsive-2xl': {
          '@apply text-xl sm:text-2xl': {},
        },
        '.text-responsive-3xl': {
          '@apply text-2xl sm:text-3xl': {},
        },
      });
    },
  ],
}
```

### 5.2 Mobile-Specific CSS
**File:** `frontend/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    scroll-behavior: smooth;
    /* Improve text rendering on mobile */
    -webkit-text-size-adjust: 100%;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    @apply font-sans antialiased;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
    /* Prevent zoom on double tap */
    touch-action: manipulation;
  }

  /* Improve touch targets on mobile */
  @media (max-width: 767px) {
    button, a, input, textarea, select {
      min-height: 44px;
      min-width: 44px;
    }
  }
}

@layer components {
  /* Mobile-first glass morphism */
  .glass-morphism {
    @apply bg-white/10 backdrop-blur-md border border-white/20;
  }

  .glass-morphism-mobile {
    @apply bg-white/15 backdrop-blur-sm border border-white/30;
  }

  /* Responsive containers */
  .container-mobile {
    @apply px-4 sm:px-6 md:px-8;
  }

  /* Touch-friendly buttons */
  .btn-mobile {
    @apply min-h-[44px] min-w-[44px] touch-manipulation;
  }

  /* Mobile-safe fixed positioning */
  .fixed-mobile-safe {
    @apply fixed;
    /* Account for mobile browser UI */
    top: env(safe-area-inset-top);
    bottom: env(safe-area-inset-bottom);
    left: env(safe-area-inset-left);
    right: env(safe-area-inset-right);
  }
}

@layer utilities {
  /* Mobile-specific utilities */
  .text-mobile-responsive {
    font-size: clamp(0.875rem, 2.5vw, 1rem);
  }

  .heading-mobile-responsive {
    font-size: clamp(1.5rem, 5vw, 3rem);
  }

  /* Safe area padding for mobile */
  .px-safe {
    padding-left: max(1rem, env(safe-area-inset-left));
    padding-right: max(1rem, env(safe-area-inset-right));
  }

  .py-safe {
    padding-top: max(1rem, env(safe-area-inset-top));
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
  }

  /* Touch-friendly interactive states */
  .touch-hover:hover {
    @media (hover: hover) {
      /* Only apply hover styles on devices that support hover */
    }
  }

  /* Prevent text selection on mobile for UI elements */
  .select-none-mobile {
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
}

/* Custom scrollbar - Mobile optimized */
::-webkit-scrollbar {
  width: 4px; /* Thinner on mobile */
}

@media (min-width: 768px) {
  ::-webkit-scrollbar {
    width: 8px;
  }
}

::-webkit-scrollbar-track {
  @apply bg-transparent;
}

::-webkit-scrollbar-thumb {
  @apply bg-white/20 rounded-full;
}

::-webkit-scrollbar-thumb:hover {
  @apply bg-white/30;
}

/* Mobile viewport fixes */
@supports (-webkit-touch-callout: none) {
  .h-screen {
    height: -webkit-fill-available;
  }
}

/* Improve mobile form inputs */
input[type="text"],
input[type="email"],
input[type="password"],
textarea,
select {
  @apply text-base; /* Prevent iOS zoom */
}

@media (max-width: 767px) {
  input[type="text"],
  input[type="email"],
  input[type="password"],
  textarea,
  select {
    font-size: 16px; /* Prevent iOS zoom */
  }
}
```

---

## Implementation Checklist

### Phase 1 (Critical - Week 1):
- [ ] Implement mobile navigation with hamburger menu
- [ ] Update SearchPage for mobile responsiveness
- [ ] Optimize SearchBar for mobile devices
- [ ] Add mobile-specific touch targets

### Phase 2 (Important - Week 2):
- [ ] Update Leaderboard page mobile layout
- [ ] Optimize Chat interface for mobile
- [ ] Implement responsive text sizing
- [ ] Add mobile-safe fixed positioning

### Phase 3 (Polish - Week 3):
- [ ] Fine-tune spacing and typography
- [ ] Add mobile-specific animations
- [ ] Optimize performance for mobile devices
- [ ] Test across various mobile devices

---

*This document provides comprehensive mobile responsiveness improvements that should be implemented alongside the main UI/UX testing recommendations.*