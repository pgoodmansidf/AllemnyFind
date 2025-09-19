// src/store/machineryStore.ts
import { create } from 'zustand';
import { machineryApi } from '@/services/machineryApi';
import toast from 'react-hot-toast';

interface MachineryItem {
  id: string;
  sector: string | null;
  description: string;
  manufacturer: string | null;
  origin: string | null;
  cost: number | null;
  cost_index: number | null;
  unit_of_measure: string | null;
  unit: string | null;
  last_update: string | null;
  sau_numbers: string[];
  similarity_score?: number;
  highlighted_sau?: string[];
}

interface MachineryStore {
  searchResults: MachineryItem[];
  relatedMachinery: Record<string, any[]>;
  isSearching: boolean;
  selectedMachinery: MachineryItem | null;
  
  searchMachinery: (query: string, filters?: any) => Promise<void>;
  clearResults: () => void;
  setSelectedMachinery: (machinery: MachineryItem | null) => void;
}

export const useMachineryStore = create<MachineryStore>((set) => ({
  searchResults: [],
  relatedMachinery: {},
  isSearching: false,
  selectedMachinery: null,

  searchMachinery: async (query: string, filters?: any) => {
    set({ isSearching: true });
    
    try {
      const response = await machineryApi.search({
        query,
        filters,
        limit: 20,
        offset: 0
      });
      
      set({
        searchResults: response.results,
        relatedMachinery: response.related_machinery,
        isSearching: false
      });
      
      if (response.results.length === 0) {
        toast.error('No machinery found matching your search');
      }
    } catch (error) {
      console.error('Search failed:', error);
      toast.error('Failed to search machinery');
      set({ isSearching: false });
    }
  },

  clearResults: () => {
    set({
      searchResults: [],
      relatedMachinery: {},
      selectedMachinery: null
    });
  },

  setSelectedMachinery: (machinery) => {
    set({ selectedMachinery: machinery });
  },
}));