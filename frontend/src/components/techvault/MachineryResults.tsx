// src/components/techvault/MachineryResults.tsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Package,
  Building2,
  MapPin,
  Hash,
  Loader2,
  GitCompare,
  AlertCircle,
  Check,
  Calendar,
  Ruler,
  Box,
  Settings
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { formatDateWithRelative } from '@/utils/dateUtils';
import toast from 'react-hot-toast';

interface MachineryItem {
  id: string;
  sector: string | null;
  project_name: string | null;
  sau_number: string | null;
  description: string;
  manufacturer: string | null;
  origin: string | null;
  cost: number | null;
  cost_index: number | null;
  unit_of_measure: string | null;
  unit: string | null;
  production_year: number | null;
  last_update: string | null;
  sau_numbers: string[];
  similarity_score?: number;
  highlighted_sau?: string[];
}

interface MachineryResultsProps {
  results: MachineryItem[];
  isLoading: boolean;
  compareMode: boolean;
  comparedItems: string[];
  onCompare: (id: string) => void;
  onToggleCompareMode: () => void;
  onShowComparison: () => void;
  searchMessage?: string;
  searchProgress?: string | null;
}

export const MachineryResults: React.FC<MachineryResultsProps> = ({
  results,
  isLoading,
  compareMode,
  comparedItems,
  onCompare,
  onToggleCompareMode,
  onShowComparison,
  searchMessage,
  searchProgress
}) => {
  const [comparableGroups, setComparableGroups] = useState<Map<string, string[]>>(new Map());
  const [loadingMessage, setLoadingMessage] = useState('Initializing search...');

  useEffect(() => {
    // Update loading messages
    if (isLoading) {
      const messages = [
        'Searching machinery database...',
        'Analyzing equipment specifications...',
        'Matching your requirements...',
        'Retrieving results...'
      ];
      let index = 0;
      const interval = setInterval(() => {
        setLoadingMessage(messages[index % messages.length]);
        index++;
      }, 800);
      return () => clearInterval(interval);
    }
  }, [isLoading]);

  useEffect(() => {
    // Group machinery by similar descriptions for comparison
    const groups = new Map<string, string[]>();
    
    results.forEach(item => {
      // Extract base type from description (e.g., "Shock Freezer", "Blister Packing Machine")
      const baseType = extractBaseType(item.description);
      
      if (!groups.has(baseType)) {
        groups.set(baseType, []);
      }
      groups.get(baseType)?.push(item.id);
    });

    setComparableGroups(groups);
  }, [results]);

  const extractBaseType = (description: string): string => {
    // Extract the main equipment type from description
    const desc = description.toLowerCase();
    
    // Common equipment patterns
    const patterns = [
      'shock freezer', 'blast freezer', 'freezer',
      'blister packing', 'packing machine',
      'mixer', 'blender',
      'oven', 'furnace',
      'conveyor', 'belt',
      'pump', 'compressor',
      'tank', 'vessel',
      'dryer', 'dehydrator'
    ];

    for (const pattern of patterns) {
      if (desc.includes(pattern)) {
        return pattern;
      }
    }

    // If no pattern matches, use first few words
    return desc.split(' ').slice(0, 3).join(' ');
  };

  const isComparable = (itemId: string): boolean => {
    // Check if this item belongs to a group with more than one item
    for (const [, groupItems] of comparableGroups) {
      if (groupItems.includes(itemId) && groupItems.length > 1) {
        return true;
      }
    }
    return false;
  };

  const canCompareWith = (itemId: string, selectedItems: string[]): boolean => {
    if (selectedItems.length === 0) return true;
    
    // Find which group the first selected item belongs to
    for (const [, groupItems] of comparableGroups) {
      if (groupItems.includes(selectedItems[0])) {
        // Check if current item is in the same group
        return groupItems.includes(itemId);
      }
    }
    return false;
  };

  const formatCost = (cost: number | null) => {
    if (!cost) return 'N/A';
    return cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <Settings className="h-16 w-16 text-yellow-400 mb-4 animate-pulse" />
          <Loader2 className="h-8 w-8 text-white animate-spin mb-4" />
          <p className="text-white text-lg font-medium">{searchProgress || loadingMessage}</p>
          <p className="text-white/60 text-sm mt-2">
            {searchProgress ? 'Advanced TechVault search in progress...' : 'Please wait while we search the TechVault...'}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">
            Found {results.length} Machinery Items
          </h2>
          <p className="text-white/70">
            {compareMode ? 'Select similar machines to compare' : 'Click Compare Mode to compare similar machines'}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          {compareMode && comparedItems.length > 0 && (
            <Button
              variant="primary"
              icon={<GitCompare className="h-4 w-4" />}
              onClick={onShowComparison}
              disabled={comparedItems.length < 2}
            >
              Compare ({comparedItems.length})
            </Button>
          )}
          <Button
            variant={compareMode ? 'primary' : 'glass'}
            icon={<GitCompare className="h-4 w-4" />}
            onClick={onToggleCompareMode}
          >
            {compareMode ? 'Cancel Compare' : 'Compare Mode'}
          </Button>
        </div>
      </div>

      {/* Product Search Message */}
      {searchMessage && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard className="p-4 border border-blue-500/30">
            <div className="flex items-start space-x-3">
              <Package className="h-5 w-5 text-blue-400 mt-0.5" />
              <div>
                <p className="text-blue-300 font-medium mb-1">Product-Based Search</p>
                <p className="text-white/70 text-sm">{searchMessage}</p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Comparison Mode Info */}
      {compareMode && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard className="p-4 border border-yellow-500/30">
            <div className="flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
              <div>
                <p className="text-yellow-300 font-medium mb-1">Comparison Mode Active</p>
                <p className="text-white/70 text-sm">
                  Select similar machines to compare. Only machines of the same type can be compared together.
                  {comparedItems.length > 0 && ` ${comparedItems.length} item(s) selected.`}
                </p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Results Grid */}
      <div className="grid gap-3">
        {results.map((item, index) => {
          const comparable = isComparable(item.id);
          const canSelect = !compareMode || canCompareWith(item.id, comparedItems);
          const isSelected = comparedItems.includes(item.id);

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <GlassCard className={`p-4 hover:bg-white/15 transition-all ${
                isSelected ? 'ring-2 ring-green-400' : ''
              } ${compareMode && !canSelect ? 'opacity-50' : ''}`}>
                <div className="space-y-2">
                  {/* Header Row */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-white mb-1">
                        {item.description}
                      </h3>

                      {/* Project Name */}
                      {item.project_name && (
                        <p className="text-white/60 text-xs mb-1">
                          Project: {item.project_name}
                        </p>
                      )}

                      {/* SAU Numbers with Highlighting */}
                      {(item.sau_numbers?.length > 0 || item.sau_number) && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {item.sau_number && (
                            <span className={`px-1.5 py-0.5 rounded text-xs ${
                              item.highlighted_sau?.includes(item.sau_number)
                                ? 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/50'
                                : 'bg-white/10 text-white/70 border border-white/20'
                            }`}>
                              <Hash className="inline h-2.5 w-2.5 mr-0.5" />
                              {item.sau_number}
                            </span>
                          )}
                          {item.sau_numbers?.filter(sau => sau !== item.sau_number).map((sau, idx) => (
                            <span
                              key={idx}
                              className={`px-1.5 py-0.5 rounded text-xs ${
                                item.highlighted_sau?.includes(sau)
                                  ? 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/50'
                                  : 'bg-white/10 text-white/70 border border-white/20'
                              }`}
                            >
                              <Hash className="inline h-2.5 w-2.5 mr-0.5" />
                              {sau}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Info Grid - Including Unit of Measure and Unit */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        {item.sector && (
                          <div>
                            <p className="text-white/40 text-xs">SECTOR</p>
                            <p className="text-white text-sm font-medium">{item.sector}</p>
                          </div>
                        )}
                        {item.manufacturer && (
                          <div>
                            <p className="text-white/40 text-xs">MANUFACTURER</p>
                            <p className="text-white text-sm font-medium flex items-center">
                              <Building2 className="h-3 w-3 mr-1" />
                              {item.manufacturer}
                            </p>
                          </div>
                        )}
                        {item.origin && (
                          <div>
                            <p className="text-white/40 text-xs">ORIGIN</p>
                            <p className="text-white text-sm font-medium flex items-center">
                              <MapPin className="h-3 w-3 mr-1" />
                              {item.origin}
                            </p>
                          </div>
                        )}
                        {item.cost && (
                          <div>
                            <p className="text-white/40 text-xs">COST</p>
                            <p className="text-green-400 text-sm font-medium flex items-center">
                              <img
                                src="/sar.png"
                                alt="SAR"
                                className="h-3.5 w-3.5 mr-1 object-contain"
                                style={{ filter: 'brightness(0) saturate(100%) invert(68%) sepia(97%) saturate(381%) hue-rotate(81deg) brightness(104%) contrast(91%)' }}
                              />
                              {formatCost(item.cost)}
                            </p>
                          </div>
                        )}
                        {item.unit_of_measure && (
                          <div>
                            <p className="text-white/40 text-xs">MEASURE</p>
                            <p className="text-white text-sm font-medium flex items-center">
                              <Ruler className="h-3 w-3 mr-1" />
                              {item.unit_of_measure}
                            </p>
                          </div>
                        )}
                        {item.unit && (
                          <div>
                            <p className="text-white/40 text-xs">UNIT</p>
                            <p className="text-white text-sm font-medium flex items-center">
                              <Box className="h-3 w-3 mr-1" />
                              {item.unit}
                            </p>
                          </div>
                        )}
                        {item.last_update && (
                          <div>
                            <p className="text-white/40 text-xs">LAST UPDATE</p>
                            <p className="text-white text-sm flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              {formatDateWithRelative(item.last_update)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center space-x-2 ml-4">
                      {item.similarity_score && (
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-lg">
                          {(item.similarity_score * 100).toFixed(0)}% Match
                        </span>
                      )}
                      {compareMode && (
                        comparable ? (
                          <motion.button
                            onClick={() => canSelect && onCompare(item.id)}
                            disabled={!canSelect}
                            className={`p-2 rounded-lg transition-all ${
                              isSelected
                                ? 'bg-green-500/20 text-green-400'
                                : canSelect
                                  ? 'bg-white/10 text-white/60 hover:bg-white/20'
                                  : 'bg-white/5 text-white/30 cursor-not-allowed'
                            }`}
                            whileTap={{ scale: canSelect ? 0.9 : 1 }}
                          >
                            <AnimatePresence mode="wait">
                              {isSelected ? (
                                <motion.div
                                  key="check"
                                  initial={{ scale: 0, rotate: -180 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  exit={{ scale: 0, rotate: 180 }}
                                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                >
                                  <Check className="h-4 w-4" />
                                </motion.div>
                              ) : (
                                <motion.div
                                  key="compare"
                                  initial={{ scale: 0, rotate: 180 }}
                                  animate={{ scale: 1, rotate: 0 }}
                                  exit={{ scale: 0, rotate: -180 }}
                                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                                >
                                  <GitCompare className="h-4 w-4" />
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.button>
                        ) : (
                          <span className="px-2 py-1 bg-red-500/10 text-red-400/60 text-xs rounded-lg">
                            Incomparable
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};