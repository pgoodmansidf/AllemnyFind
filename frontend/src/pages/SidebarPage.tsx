// src/pages/SidebarPage.tsx
import React from 'react';
import Sidebar from '@/components/SideBar/Sidebar';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchStore } from '@/store/searchStore';
import { SearchResponse } from '@/services/searchApi';

export default function SidebarPage() {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const { /* for restore if needed */ } = useSearchStore();

  const handleSelect = (search: SearchResponse) => {
    // Navigate to search page and let that page restore from history via its handler
    navigate('/search', { state: { restoreId: search.id } });
  };

  return (
    <div className="min-h-screen">
      <Sidebar isOpen={open} onClose={() => setOpen(false)} onSelectSearch={handleSelect} />
      {/* Intentionally empty page body; this page exposes the reusable Sidebar for layout usage */}
    </div>
  );
}