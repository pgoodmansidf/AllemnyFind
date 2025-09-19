// src/components/techvault/MachineryAdmin.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  Download,
  Trash2,
  Search,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Database,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { machineryApi } from '@/services/machineryApi';
import toast from 'react-hot-toast';

export const MachineryAdmin: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [machineryList, setMachineryList] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [uploadResult, setUploadResult] = useState<any>(null);

  useEffect(() => {
    loadMachineryList();
  }, [currentPage, searchTerm]);

  const loadMachineryList = async () => {
    setIsLoadingList(true);
    try {
      const response = await machineryApi.listMachinery({
        page: currentPage,
        page_size: 10,
        search: searchTerm || undefined
      });
      
      setMachineryList(response.results);
      setTotalPages(response.pagination.total_pages);
      setTotalRecords(response.pagination.total);
    } catch (error) {
      toast.error('Failed to load machinery list');
    } finally {
      setIsLoadingList(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a CSV file');
      return;
    }

    setIsUploading(true);
    setUploadResult(null);

    try {
      const result = await machineryApi.uploadCSV(file);
      setUploadResult(result);
      
      if (result.success) {
        toast.success(`Successfully imported ${result.imported} records`);
        loadMachineryList();
      } else {
        toast.error('Upload completed with errors');
      }
    } catch (error) {
      toast.error('Failed to upload CSV file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExport = async () => {
    try {
      await machineryApi.exportCSV();
      toast.success('Export started - file will download shortly');
    } catch (error) {
      toast.error('Failed to export data');
    }
  };

  const handleClearTable = async () => {
    if (!window.confirm('Are you sure you want to delete all machinery data? This action cannot be undone.')) {
      return;
    }

    try {
      const result = await machineryApi.clearTable();
      toast.success(result.message);
      loadMachineryList();
    } catch (error) {
      toast.error('Failed to clear table');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">TechVault Administration</h2>
            <p className="text-white/70">Manage machinery database and imports</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <Database className="h-8 w-8 text-blue-400" />
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{totalRecords}</p>
              <p className="text-white/50 text-sm">Total Records</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="primary"
              icon={isUploading ? 
                <Loader2 className="h-4 w-4 animate-spin" /> : 
                <Upload className="h-4 w-4" />
              }
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="w-full"
            >
              {isUploading ? 'Uploading...' : 'Upload CSV'}
            </Button>
          </div>
          
          <Button
            variant="glass"
            icon={<Download className="h-4 w-4" />}
            onClick={handleExport}
            className="w-full"
          >
            Export CSV
          </Button>
          
          <Button
            variant="glass"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={loadMachineryList}
            className="w-full"
          >
            Refresh
          </Button>
          
          <Button
            variant="glass"
            icon={<Trash2 className="h-4 w-4" />}
            onClick={handleClearTable}
            className="w-full text-red-400 hover:text-red-300"
          >
            Clear Table
          </Button>
        </div>
      </GlassCard>

      {/* Upload Result */}
      {uploadResult && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            <GlassCard className={`p-4 border ${
              uploadResult.success ? 'border-green-500/30' : 'border-red-500/30'
            }`}>
              <div className="flex items-start space-x-3">
                {uploadResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-400 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400 mt-0.5" />
                )}
                
                <div className="flex-1">
                  <p className="text-white font-medium mb-2">
                    Upload {uploadResult.success ? 'Successful' : 'Completed with Errors'}
                  </p>
                  <div className="space-y-1 text-sm">
                    <p className="text-white/70">
                      Total Records: {uploadResult.total_records}
                    </p>
                    <p className="text-green-400">
                      Successfully Imported: {uploadResult.imported}
                    </p>
                    {uploadResult.errors?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-red-400 mb-1">
                          Errors ({uploadResult.errors.length}):
                        </p>
                        <div className="bg-black/20 rounded p-2 max-h-32 overflow-y-auto">
                          {uploadResult.errors.map((error: string, idx: number) => (
                            <p key={idx} className="text-red-300 text-xs">
                              {error}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Search Bar */}
      <GlassCard className="p-4">
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search machinery..."
            className="w-full px-4 py-2 pl-10 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/40"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
        </div>
      </GlassCard>

      {/* Machinery List */}
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Machinery Records</h3>
        
        {isLoadingList ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        ) : machineryList.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-white/30 mx-auto mb-3" />
            <p className="text-white/50">No machinery records found</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-white/70 text-sm">Description</th>
                    <th className="text-left py-3 px-4 text-white/70 text-sm">Manufacturer</th>
                    <th className="text-left py-3 px-4 text-white/70 text-sm">Origin</th>
                    <th className="text-left py-3 px-4 text-white/70 text-sm">Cost (SAR)</th>
                    <th className="text-left py-3 px-4 text-white/70 text-sm">SAU Numbers</th>
                  </tr>
                </thead>
                <tbody>
                  {machineryList.map((item, idx) => (
                    <tr key={item.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-3 px-4 text-white text-sm">
                        {item.description?.substring(0, 50)}...
                      </td>
                      <td className="py-3 px-4 text-white/70 text-sm">
                        {item.manufacturer || '-'}
                      </td>
                      <td className="py-3 px-4 text-white/70 text-sm">
                        {item.origin || '-'}
                      </td>
                      <td className="py-3 px-4 text-green-400 text-sm">
                        {item.cost ? `${item.cost.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {item.sau_numbers?.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {item.sau_numbers.slice(0, 2).map((sau: string, idx: number) => (
                              <span key={idx} className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded">
                                {sau}
                              </span>
                            ))}
                            {item.sau_numbers.length > 2 && (
                              <span className="text-white/50 text-xs">
                                +{item.sau_numbers.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-6">
              <p className="text-white/50 text-sm">
                Page {currentPage} of {totalPages} ({totalRecords} total)
              </p>
              
              <div className="flex items-center space-x-2">
                <Button
                  variant="glass"
                  size="sm"
                  icon={<ChevronLeft className="h-4 w-4" />}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                
                <Button
                  variant="glass"
                  size="sm"
                  icon={<ChevronRight className="h-4 w-4" />}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </GlassCard>
    </motion.div>
  );
};