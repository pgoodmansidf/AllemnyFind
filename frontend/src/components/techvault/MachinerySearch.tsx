// src/components/techvault/MachinerySearch.tsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Search,
  Settings,
  Sparkles,
  Package,
  Building2,
  DollarSign,
  Filter
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface MachinerySearchProps {
  onSearch: (query: string, filters?: any) => void;
}

export const MachinerySearch: React.FC<MachinerySearchProps> = ({ onSearch }) => {
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    sector: '',
    manufacturer: '',
    minCost: '',
    maxCost: ''
  });

  const handleSearch = () => {
    if (!query.trim()) return;
    
    const activeFilters = Object.entries(filters).reduce((acc, [key, value]) => {
      if (value) {
        if (key === 'minCost' || key === 'maxCost') {
          acc[key.replace('Cost', '_cost')] = parseFloat(value);
        } else {
          acc[key] = value;
        }
      }
      return acc;
    }, {} as any);
    
    onSearch(query, Object.keys(activeFilters).length > 0 ? activeFilters : undefined);
  };

  const exampleQueries = [
    "Show me all shock freezers",
    "Find equipment with SAU1234",
    "Italian pasta making machines",
    "Food processing equipment under 50000 SAR",
    "Compare all ovens from Germany"
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-4xl mx-auto"
    >
      <GlassCard className="p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex items-center justify-center space-x-3 mb-4"
          >
            <Settings className="h-10 w-10 text-yellow-400" />
            <h1 className="text-4xl font-bold text-white">Machinery</h1>
          </motion.div>
          <p className="text-white/70 text-lg">
            Intelligent Machinery & Equipment Discovery
          </p>
        </div>

        {/* Search Input */}
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for machinery using natural language..."
              className="w-full px-6 py-4 pr-12 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:border-white/40 transition-all"
            />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/50" />
          </div>

          {/* Filter Toggle */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 text-white/70 hover:text-white transition-colors"
            >
              <Filter className="h-4 w-4" />
              <span>Advanced Filters</span>
            </button>
            
            <Button
              variant="primary"
              icon={<Sparkles className="h-4 w-4" />}
              onClick={handleSearch}
              disabled={!query.trim()}
            >
              Search
            </Button>
          </div>

          {/* Filters */}
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10"
            >
              <div>
                <label className="text-white/70 text-sm mb-1 block">Sector</label>
                <input
                  type="text"
                  value={filters.sector}
                  onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
                  placeholder="e.g., Food Processing"
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
              </div>
              
              <div>
                <label className="text-white/70 text-sm mb-1 block">Manufacturer</label>
                <input
                  type="text"
                  value={filters.manufacturer}
                  onChange={(e) => setFilters({ ...filters, manufacturer: e.target.value })}
                  placeholder="e.g., Siemens"
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
              </div>
              
              <div>
                <label className="text-white/70 text-sm mb-1 block">Min Cost (SAR)</label>
                <input
                  type="number"
                  value={filters.minCost}
                  onChange={(e) => setFilters({ ...filters, minCost: e.target.value })}
                  placeholder="0"
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
              </div>
              
              <div>
                <label className="text-white/70 text-sm mb-1 block">Max Cost (SAR)</label>
                <input
                  type="number"
                  value={filters.maxCost}
                  onChange={(e) => setFilters({ ...filters, maxCost: e.target.value })}
                  placeholder="1000000"
                  className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                />
              </div>
            </motion.div>
          )}
        </div>

        {/* Example Queries */}
        <div className="mt-8">
          <p className="text-white/50 text-sm mb-3">Try searching for:</p>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((example, index) => (
              <button
                key={index}
                onClick={() => setQuery(example)}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-white/70 hover:text-white text-sm transition-all"
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4 mt-8 pt-8 border-t border-white/10">
          <div className="text-center">
            <Package className="h-8 w-8 text-blue-400 mx-auto mb-2" />
            <p className="text-white/70 text-sm">SAU Detection</p>
          </div>
          <div className="text-center">
            <Building2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
            <p className="text-white/70 text-sm">Manufacturer Insights</p>
          </div>
          <div className="text-center">
            <img 
            src="/sar.png"  // Replace with your actual filename
            alt="SAR"
            className="h-8 w-8 mx-auto mb-2 object-contain filter brightness-0 invert"
            style={{ filter: 'brightness(0) saturate(100%) invert(85%) sepia(91%) saturate(445%) hue-rotate(356deg) brightness(101%) contrast(101%)' }}  // Makes it yellow-400 color
            />
            <p className="text-white/70 text-sm"> Cost Comparison</p>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
};