# Accessibility Improvements - Allemny Find V2

**Priority Level: HIGH**
**WCAG 2.1 Compliance Target: AA Level**

## Overview
This document provides specific code changes needed to improve accessibility compliance across the Allemny Find V2 application.

---

## 1. Navigation & Layout Improvements

### 1.1 Skip Navigation Links
**File:** `frontend/src/components/Layout/Layout.tsx`

```tsx
// Add at the beginning of the Layout component
<div className="sr-only">
  <a
    href="#main-content"
    className="absolute top-0 left-0 bg-primary-600 text-white px-4 py-2 z-50
               focus:not-sr-only focus:static focus:w-auto focus:h-auto"
  >
    Skip to main content
  </a>
</div>

// Add id to main content
<main className="flex-1 p-6 overflow-y-auto" id="main-content">
```

### 1.2 Hamburger Menu for Mobile
**File:** `frontend/src/components/Layout/Layout.tsx`

```tsx
// Add state for mobile menu
const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

// Add hamburger button (mobile only)
<button
  className="md:hidden fixed top-4 left-4 z-50 p-2 bg-black/20 backdrop-blur-md rounded-lg"
  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
  aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
  aria-expanded={mobileMenuOpen}
>
  {mobileMenuOpen ? <X className="h-6 w-6 text-white" /> : <Menu className="h-6 w-6 text-white" />}
</button>

// Update sidebar with mobile responsiveness
<motion.aside
  className={`
    w-64 bg-black/20 backdrop-blur-xl border-r border-white/10 p-4
    md:static fixed inset-y-0 left-0 z-40
    ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
  `}
  // ... rest of sidebar
>
```

---

## 2. Button & Interactive Elements

### 2.1 Icon-Only Buttons
**File:** `frontend/src/pages/LeaderboardPage.tsx`

```tsx
// Update filter toggle button
<Button
  variant="outline"
  onClick={() => setShowFilters(!showFilters)}
  className="flex items-center space-x-2"
  aria-label={showFilters ? "Hide filters" : "Show filters"}
  aria-expanded={showFilters}
>
  <Filter className="h-4 w-4" aria-hidden="true" />
  <span>Filters</span>
  {showFilters ?
    <ChevronUp className="h-4 w-4" aria-hidden="true" /> :
    <ChevronDown className="h-4 w-4" aria-hidden="true" />
  }
</Button>
```

### 2.2 Search History Actions
**File:** `frontend/src/pages/SearchPage.tsx`

```tsx
// Update star toggle button
<button
  onClick={(e) => handleStarToggle(e, search.id)}
  className="p-1 rounded hover:bg-white/10"
  aria-label={
    starredSearches.has(search.id)
      ? `Remove "${search.query}" from favorites`
      : `Add "${search.query}" to favorites`
  }
  title={starredSearches.has(search.id) ? "Remove from favorites" : "Add to favorites"}
>
  {loadingStars.has(search.id) ? (
    <Loader2 className="h-3 w-3 text-yellow-400 animate-spin" aria-hidden="true" />
  ) : (
    <Star
      className={`h-3 w-3 ${
        starredSearches.has(search.id)
          ? 'text-yellow-400 fill-yellow-400'
          : 'text-white/60 hover:text-yellow-400'
      }`}
      aria-hidden="true"
    />
  )}
</button>

// Update delete button
<button
  onClick={(e) => handleDeleteSearch(e, search.id)}
  className="p-1 rounded hover:bg-white/10"
  aria-label={`Delete search: "${search.query}"`}
  title="Delete search"
>
  <Trash2 className="h-3 w-3 text-red-400" aria-hidden="true" />
</button>
```

---

## 3. Form Accessibility

### 3.1 Innovate Allemny Form
**File:** `frontend/src/pages/InnovateAllemny.tsx`

```tsx
// Update suggestion creation form
<form onSubmit={handleCreateSuggestion} className="space-y-6">
  <div>
    <label
      htmlFor="suggestion-title"
      className="block text-gray-300 text-sm font-medium mb-2"
    >
      Title *
    </label>
    <input
      id="suggestion-title"
      type="text"
      value={newSuggestion.title}
      onChange={(e) => setNewSuggestion(prev => ({ ...prev, title: e.target.value }))}
      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      placeholder="Brief, descriptive title for your suggestion"
      maxLength={200}
      required
      aria-describedby="title-help"
    />
    <div id="title-help" className="text-gray-400 text-sm mt-1">
      Maximum 200 characters
    </div>
  </div>

  <div>
    <label
      htmlFor="suggestion-category"
      className="block text-gray-300 text-sm font-medium mb-2"
    >
      Category
    </label>
    <select
      id="suggestion-category"
      value={newSuggestion.category}
      onChange={(e) => setNewSuggestion(prev => ({ ...prev, category: e.target.value as SuggestionCategory }))}
      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
    >
      {Object.values(SuggestionCategory).map(category => (
        <option key={category} value={category}>
          {categoryLabels[category]}
        </option>
      ))}
    </select>
  </div>

  <div>
    <label
      htmlFor="suggestion-description"
      className="block text-gray-300 text-sm font-medium mb-2"
    >
      Description *
    </label>
    <textarea
      id="suggestion-description"
      value={newSuggestion.description}
      onChange={(e) => setNewSuggestion(prev => ({ ...prev, description: e.target.value }))}
      className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
      placeholder="Detailed description of your suggestion. What problem does it solve? How would it improve the platform?"
      rows={6}
      minLength={20}
      required
      aria-describedby="description-help"
    />
    <div id="description-help" className="text-gray-400 text-sm mt-1">
      Minimum 20 characters. Be specific about the problem and proposed solution.
    </div>
  </div>

  {/* ... rest of form */}
</form>
```

---

## 4. Live Regions for Dynamic Content

### 4.1 Chat Streaming Updates
**File:** `frontend/src/pages/AllemnyChat.tsx`

```tsx
// Add live region for screen readers
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  className="sr-only"
>
  {statusMessage}
</div>

// Update MessageBubble component
const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  isStreaming = false,
  statusMessage
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isOwn ? 'justify-end' : 'justify-start'}`}
      role={isOwn ? undefined : "log"}
      aria-label={isOwn ? undefined : "AI assistant response"}
    >
      {/* ... existing content ... */}
    </motion.div>
  );
};
```

### 4.2 Search Status Updates
**File:** `frontend/src/pages/SearchPage.tsx`

```tsx
// Add live region for search status
<div
  role="status"
  aria-live="polite"
  aria-atomic="false"
  className="sr-only"
>
  {stageMessage}
</div>

// Update SearchResults with proper roles
<div role="main" aria-label="Search results">
  {/* Search results content */}
</div>
```

---

## 5. Keyboard Navigation

### 5.1 Modal Navigation
**File:** `frontend/src/pages/InnovateAllemny.tsx`

```tsx
// Update create suggestion modal
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
  onClick={() => setShowCreateForm(false)}
  role="dialog"
  aria-modal="true"
  aria-labelledby="create-suggestion-title"
>
  <motion.div
    initial={{ scale: 0.9, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    exit={{ scale: 0.9, opacity: 0 }}
    className="bg-gray-800 rounded-xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
    onClick={(e) => e.stopPropagation()}
  >
    <h2 id="create-suggestion-title" className="text-2xl font-bold text-white mb-6">
      Submit New Suggestion
    </h2>
    {/* ... form content ... */}
  </motion.div>
</motion.div>

// Add keyboard event handler
useEffect(() => {
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && showCreateForm) {
      setShowCreateForm(false);
    }
  };

  document.addEventListener('keydown', handleEscape);
  return () => document.removeEventListener('keydown', handleEscape);
}, [showCreateForm]);
```

### 5.2 List Navigation
**File:** `frontend/src/pages/LeaderboardPage.tsx`

```tsx
// Update leaderboard list with keyboard navigation
<div
  className="divide-y divide-white/10"
  role="list"
  aria-label="Leaderboard rankings"
>
  {leaderboard.map((entry, index) => (
    <motion.div
      key={entry.user_id}
      role="listitem"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setExpandedUser(expandedUser === entry.user_id ? null : entry.user_id);
        }
      }}
      aria-expanded={expandedUser === entry.user_id}
      aria-label={`${entry.full_name || entry.username}, rank ${entry.rank}, ${entry.total_score} points`}
      className={`p-6 hover:bg-white/5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset ${
        entry.user_id === user?.id ? 'bg-primary-500/10 border-l-4 border-primary-500' : ''
      }`}
      onClick={() => setExpandedUser(expandedUser === entry.user_id ? null : entry.user_id)}
    >
      {/* ... existing content ... */}
    </motion.div>
  ))}
</div>
```

---

## 6. Screen Reader Enhancements

### 6.1 Status Updates
**File:** `frontend/src/components/ui/Button.tsx`

```tsx
// Update Button component with better screen reader support
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    children,
    className = '',
    disabled,
    ...props
  }, ref) => {
    // ... existing code ...

    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: disabled || loading ? 1 : 0.95 }}
        className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
        disabled={disabled || loading}
        aria-disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
            <span className="sr-only">Loading...</span>
            {children || 'Loading...'}
          </>
        ) : (
          <>
            {icon && <span aria-hidden="true" className="mr-2">{icon}</span>}
            {children}
          </>
        )}
      </motion.button>
    );
  }
);
```

### 6.2 Progress Indicators
**File:** `frontend/src/components/ingestion/ProgressDashboard.tsx`

```tsx
// Add proper progress announcements
<div className="space-y-4" role="region" aria-label="Job progress dashboard">
  {jobs.map((job) => (
    <GlassCard key={job.id} className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{job.name}</h3>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(job.status)}`}
          role="status"
          aria-label={`Job status: ${job.status}`}
        >
          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
        </span>
      </div>

      {job.status === 'processing' && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/70">Progress</span>
            <span className="text-white text-sm">{job.progress || 0}%</span>
          </div>
          <div
            className="w-full bg-white/10 rounded-full h-2"
            role="progressbar"
            aria-valuenow={job.progress || 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${job.name} progress: ${job.progress || 0}%`}
          >
            <div
              className="bg-gradient-to-r from-primary-500 to-success-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${job.progress || 0}%` }}
            />
          </div>
        </div>
      )}
    </GlassCard>
  ))}
</div>
```

---

## 7. Focus Management

### 7.1 Custom Focus Styles
**File:** `frontend/src/index.css`

```css
/* Enhanced focus styles */
.focus-visible\:ring-primary:focus-visible {
  --tw-ring-color: rgb(59 130 246 / 0.5);
  --tw-ring-width: 2px;
}

/* Skip link styling */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.focus\:not-sr-only:focus {
  position: static;
  width: auto;
  height: auto;
  padding: 0.5rem 1rem;
  margin: 0;
  overflow: visible;
  clip: auto;
  white-space: normal;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .glass-morphism {
    border-width: 2px;
    border-color: white;
  }

  .text-white\/70 {
    color: white;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .animate-spin,
  .animate-pulse,
  .transition-all {
    animation: none;
    transition: none;
  }
}
```

---

## 8. Implementation Checklist

### Phase 1 (Critical - Week 1):
- [ ] Add skip navigation links
- [ ] Implement hamburger menu for mobile
- [ ] Add ARIA labels to all icon-only buttons
- [ ] Update form labels and descriptions
- [ ] Add keyboard navigation to modals

### Phase 2 (Important - Week 2):
- [ ] Implement live regions for dynamic content
- [ ] Add proper roles and landmarks
- [ ] Enhance focus management
- [ ] Add screen reader announcements

### Phase 3 (Nice to have - Week 3):
- [ ] Add keyboard navigation to lists
- [ ] Implement high contrast mode support
- [ ] Add reduced motion preferences
- [ ] Enhanced error messaging

---

## 9. Testing & Validation

### Automated Testing:
```bash
# Install axe-core for accessibility testing
npm install --save-dev @axe-core/react

# Run accessibility audits
npx lighthouse --only=accessibility http://localhost:3000
```

### Manual Testing:
1. **Keyboard Navigation**: Tab through entire application
2. **Screen Reader**: Test with NVDA/JAWS/VoiceOver
3. **High Contrast**: Test with Windows High Contrast mode
4. **Zoom**: Test at 200% zoom level

### Testing Tools:
- Chrome DevTools Accessibility Panel
- axe DevTools Extension
- WAVE Web Accessibility Evaluator
- Lighthouse Accessibility Audit

---

*This document should be implemented alongside the main UI/UX improvements for full WCAG 2.1 AA compliance.*