import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Folder, 
  FolderOpen, 
  File, 
  ChevronRight, 
  ChevronDown, 
  HardDrive,
  Network,
  Check,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useIngestionStore } from '@/store/ingestionStore';

interface DirectoryNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children: DirectoryNode[];
  file_count: number;
  supported_file_count: number;
  error?: string;
  expanded?: boolean;
  loading?: boolean;
}

interface DirectoryBrowserProps {
  onSelectPath: (path: string) => void;
  onClose: () => void;
  initialPath?: string;
}

export const DirectoryBrowser: React.FC<DirectoryBrowserProps> = ({
  onSelectPath,
  onClose,
  initialPath = ''
}) => {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [directoryTree, setDirectoryTree] = useState<DirectoryNode | null>(null);
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  // Removed process.platform as it's not available in the browser
  // Providing common paths that might work on typical user systems, or remove if not useful.
  // For cross-platform accuracy, these should ideally come from the backend.
  const [commonPaths] = useState([
    { name: 'Documents (Windows)', path: 'C:\\Users\\Public\\Documents' }, // More generic Windows path
    { name: 'Downloads (Windows)', path: 'C:\\Users\\Public\\Downloads' }, // More generic Windows path
    { name: 'Home (Linux/macOS)', path: '/home/user' }, // Generic Linux/macOS path
    { name: 'Temp (Linux/macOS)', path: '/tmp' }, // Generic Linux/macOS path
  ]);

  const { validatePath } = useIngestionStore();

  useEffect(() => {
    if (initialPath) {
      setCurrentPath(initialPath);
      loadDirectoryTree(initialPath);
    }
  }, [initialPath]);

  const loadDirectoryTree = async (path: string) => {
    if (!path.trim()) return;

    setIsLoading(true);
    try {
      // Simulate directory tree API call
      const response = await fetch(`/api/v1/ingestion/directory-tree?path=${encodeURIComponent(path)}&max_depth=2`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      
      if (response.ok) {
        const treeData = await response.json();
        setDirectoryTree(treeData);
      } else {
        // More specific error handling from response
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to load directory tree');
      }
    } catch (error: any) { // Type 'any' for error caught to allow access to .message
      console.error('Error loading directory tree:', error);
      setDirectoryTree({
        name: path,
        path: path,
        type: 'directory',
        children: [],
        file_count: 0,
        supported_file_count: 0,
        error: error.message || 'Failed to load directory' // Use error.message for display
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePathValidation = async (path: string) => {
    if (!path.trim()) {
      setValidationStatus('idle');
      return;
    }

    setValidationStatus('validating');
    try {
      const isValid = await validatePath(path);
      setValidationStatus(isValid ? 'valid' : 'invalid');
    } catch (error) {
      setValidationStatus('invalid');
    }
  };

  const handlePathChange = (path: string) => {
    setCurrentPath(path);
    setSelectedPath(path);
    handlePathValidation(path);
  };

  const handleNodeClick = (node: DirectoryNode) => {
    if (node.type === 'directory') {
      setSelectedPath(node.path);
      setCurrentPath(node.path);
      handlePathValidation(node.path);
    }
  };

  const handleConfirmSelection = () => {
    if (selectedPath && validationStatus === 'valid') {
      onSelectPath(selectedPath);
    }
  };

  const renderDirectoryNode = (node: DirectoryNode, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedPath === node.path;

    return (
      <motion.div
        key={node.path}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.2, delay: depth * 0.05 }}
      >
        <div
          className={`flex items-center p-2 rounded-lg cursor-pointer transition-all duration-200 hover:bg-white/10 ${
            isSelected ? 'bg-primary-500/20 border border-primary-500/30' : ''
          }`}
          style={{ marginLeft: depth * 20 }}
          onClick={() => handleNodeClick(node)}
        >
          <div className="flex items-center flex-1 space-x-2">
            {hasChildren && (
              <div className="w-4 h-4 flex items-center justify-center">
                <ChevronRight className="h-3 w-3 text-white/60" />
              </div>
            )}
            
            {node.type === 'directory' ? (
              <Folder className="h-4 w-4 text-blue-400" />
            ) : (
              <File className="h-4 w-4 text-white/60" />
            )}
            
            <span className="text-white text-sm font-medium">{node.name}</span>
          </div>

          {node.type === 'directory' && (
            <div className="flex items-center space-x-2 text-xs text-white/60">
              {node.supported_file_count > 0 && (
                <span className="bg-green-500/20 px-2 py-1 rounded text-green-400">
                  {node.supported_file_count} files
                </span>
              )}
              {node.error && (
                <AlertCircle className="h-4 w-4 text-red-400" />
              )}
            </div>
          )}
        </div>

        {hasChildren && (
          <div className="ml-4">
            {node.children.map(child => renderDirectoryNode(child, depth + 1))}
          </div>
        )}

        {node.error && (
          <div className="ml-8 text-xs text-red-400 mt-1">
            {node.error}
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-4xl h-[80vh] flex flex-col"
      >
        <GlassCard className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/20">
            <div>
              <h2 className="text-2xl font-bold text-white">Select Directory</h2>
              <p className="text-white/70 mt-1">Choose a directory containing your documents</p>
            </div>
            <Button
              variant="glass"
              size="sm"
              onClick={onClose}
              icon={<X className="h-4 w-4" />}
            >
              Close
            </Button>
          </div>

          {/* Path Input */}
          <div className="p-6 border-b border-white/20">
            <div className="flex space-x-3">
              <div className="flex-1 relative">
                <Input
                  label="Directory Path"
                  placeholder="Enter or select a directory path"
                  value={currentPath}
                  onChange={(e) => handlePathChange(e.target.value)}
                />
                {validationStatus === 'validating' && (
                  <div className="absolute right-3 top-11 flex items-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary-400" />
                  </div>
                )}
                {validationStatus === 'valid' && (
                  <div className="absolute right-3 top-11 flex items-center">
                    <Check className="h-5 w-5 text-green-400" />
                  </div>
                )}
                {validationStatus === 'invalid' && (
                  <div className="absolute right-3 top-11 flex items-center">
                    <AlertCircle className="h-5 w-5 text-red-400" />
                  </div>
                )}
              </div>
              <Button
                variant="primary"
                onClick={() => loadDirectoryTree(currentPath)}
                disabled={!currentPath.trim() || isLoading}
                loading={isLoading}
              >
                Browse
              </Button>
            </div>

            {/* Common Paths */}
            <div className="mt-4">
              <p className="text-white/70 text-sm mb-2">Quick Access:</p>
              <div className="flex flex-wrap gap-2">
                {commonPaths.map((path) => (
                  <button
                    key={path.name}
                    onClick={() => handlePathChange(path.path)}
                    className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg text-white/80 transition-colors"
                  >
                    {path.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Directory Tree */}
          <div className="flex-1 overflow-auto p-6">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="flex items-center space-x-3">
                  <Loader2 className="h-6 w-6 animate-spin text-primary-400" />
                  <span className="text-white/70">Loading directory structure...</span>
                </div>
              </div>
            ) : directoryTree ? (
              <div className="space-y-1">
                {renderDirectoryNode(directoryTree)}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-white/60">
                <div className="text-center">
                  <Folder className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Enter a path above to browse directories</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-white/20">
            <div className="text-sm text-white/70">
              {selectedPath && (
                <span>Selected: <span className="text-white font-mono">{selectedPath}</span></span>
              )}
            </div>
            <div className="flex space-x-3">
              <Button
                variant="glass"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                variant="success"
                onClick={handleConfirmSelection}
                disabled={!selectedPath || validationStatus !== 'valid'}
                icon={<Check className="h-4 w-4" />}
              >
                Select Directory
              </Button>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </motion.div>
  );
};
