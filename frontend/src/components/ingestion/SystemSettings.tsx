import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Monitor,
  Settings,
  CheckCircle,
  AlertCircle,
  Loader2,
  Info,
  Cpu,
  HardDrive,
  Terminal,
  Windows,
  FileText
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

interface SystemInfo {
  platform: string;
  platform_release: string;
  platform_version: string;
  architecture: string;
  processor: string;
  python_version: string;
  is_windows: boolean;
  is_wsl: boolean;
  available_tools: {
    [key: string]: boolean;
  };
}

interface ProcessingModeInfo {
  mode: 'native' | 'wsl';
  available_modes: string[];
}

export const SystemSettings: React.FC = () => {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [processingMode, setProcessingMode] = useState<ProcessingModeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChangingMode, setIsChangingMode] = useState(false);

  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('/api/v1/ingestion/system/environment', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      if (response.ok) {
        const info = await response.json();
        setSystemInfo(info);
      } else {
        toast.error('Failed to fetch system information');
      }
    } catch (error) {
      console.error('Error fetching system info:', error);
      toast.error('Error loading system information');
    }
  };

  const fetchProcessingMode = async () => {
    try {
      const response = await fetch('/api/v1/ingestion/system/processing-mode', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      if (response.ok) {
        const mode = await response.json();
        setProcessingMode(mode);
      } else {
        console.error('Failed to fetch processing mode');
      }
    } catch (error) {
      console.error('Error fetching processing mode:', error);
    }
  };

  const setProcessingModePreference = async (mode: 'native' | 'wsl') => {
    setIsChangingMode(true);
    try {
      const response = await fetch('/api/v1/ingestion/system/set-processing-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({ mode })
      });

      if (response.ok) {
        const result = await response.json();
        setProcessingMode(prev => ({ ...prev!, mode }));
        toast.success(result.message);
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to set processing mode');
      }
    } catch (error) {
      console.error('Error setting processing mode:', error);
      toast.error('Error updating processing mode');
    } finally {
      setIsChangingMode(false);
    }
  };

  const refreshData = async () => {
    setIsLoading(true);
    await Promise.all([fetchSystemInfo(), fetchProcessingMode()]);
    setIsLoading(false);
  };

  useEffect(() => {
    refreshData();
  }, []);

  const getToolStatus = (toolName: string, isAvailable: boolean) => {
    return isAvailable ?
      <CheckCircle className="h-4 w-4 text-green-400" /> :
      <AlertCircle className="h-4 w-4 text-red-400" />;
  };

  const getSystemIcon = () => {
    if (!systemInfo) return <Monitor className="h-5 w-5" />;

    if (systemInfo.is_windows) {
      return <Windows className="h-5 w-5" />;
    } else if (systemInfo.is_wsl) {
      return <Terminal className="h-5 w-5" />;
    } else {
      return <Monitor className="h-5 w-5" />;
    }
  };

  const formatPlatformInfo = (info: SystemInfo) => {
    return `${info.platform} ${info.platform_release} (${info.architecture})`;
  };

  if (!systemInfo) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
        <span className="ml-2 text-white/70">Loading system information...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
            {getSystemIcon()}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">System Settings</h2>
            <p className="text-white/70">Configure processing environment</p>
          </div>
        </div>
        <Button
          variant="glass"
          onClick={refreshData}
          disabled={isLoading}
          icon={<Loader2 className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />}
        >
          Refresh
        </Button>
      </div>

      {/* System Information */}
      <GlassCard className="p-6">
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center space-x-2">
          <Info className="h-5 w-5" />
          <span>System Information</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <h4 className="text-lg font-medium text-white mb-3 flex items-center space-x-2">
              <Cpu className="h-4 w-4" />
              <span>Platform</span>
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/70">OS:</span>
                <span className="text-white">{formatPlatformInfo(systemInfo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Processor:</span>
                <span className="text-white">{systemInfo.processor || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Python:</span>
                <span className="text-white">{systemInfo.python_version}</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-medium text-white mb-3 flex items-center space-x-2">
              <HardDrive className="h-4 w-4" />
              <span>Environment</span>
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-white/70">Windows:</span>
                <div className="flex items-center space-x-2">
                  <span className="text-white">{systemInfo.is_windows ? 'Yes' : 'No'}</span>
                  {systemInfo.is_windows ?
                    <CheckCircle className="h-4 w-4 text-green-400" /> :
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  }
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/70">WSL:</span>
                <div className="flex items-center space-x-2">
                  <span className="text-white">{systemInfo.is_wsl ? 'Yes' : 'No'}</span>
                  {systemInfo.is_wsl ?
                    <CheckCircle className="h-4 w-4 text-green-400" /> :
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  }
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-lg font-medium text-white mb-3 flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Available Tools</span>
            </h4>
            <div className="space-y-2 text-sm">
              {Object.entries(systemInfo.available_tools).map(([tool, isAvailable]) => (
                <div key={tool} className="flex justify-between items-center">
                  <span className="text-white/70 capitalize">{tool}:</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-white">{isAvailable ? 'Available' : 'Missing'}</span>
                    {getToolStatus(tool, isAvailable)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Processing Mode Settings */}
      {systemInfo.is_windows && (
        <GlassCard className="p-6">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center space-x-2">
            <Settings className="h-5 w-5" />
            <span>Processing Mode</span>
          </h3>

          <div className="space-y-4">
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start space-x-2">
                <Info className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-blue-400 text-sm font-medium">Windows Processing Mode</p>
                  <p className="text-blue-300/80 text-sm">
                    Choose between native Windows processing or WSL (Windows Subsystem for Linux) mode.
                    WSL mode may provide better compatibility with certain document processing tools.
                  </p>
                </div>
              </div>
            </div>

            {processingMode && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <motion.div
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    processingMode.mode === 'native'
                      ? 'bg-primary-500/20 border-primary-500/50'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => processingMode.mode !== 'native' && setProcessingModePreference('native')}
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <Windows className="h-6 w-6 text-blue-400" />
                    <div>
                      <h4 className="text-white font-medium">Native Windows</h4>
                      {processingMode.mode === 'native' && (
                        <p className="text-green-400 text-sm">Currently Active</p>
                      )}
                    </div>
                  </div>
                  <p className="text-white/70 text-sm">
                    Use native Windows tools and binaries for document processing.
                    Best for standard Windows environments.
                  </p>
                  <div className="mt-3">
                    <p className="text-white/60 text-xs">
                      Pros: Direct integration, no virtualization overhead<br/>
                      Cons: May require manual tool installation
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    processingMode.mode === 'wsl'
                      ? 'bg-primary-500/20 border-primary-500/50'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => processingMode.mode !== 'wsl' && setProcessingModePreference('wsl')}
                >
                  <div className="flex items-center space-x-3 mb-3">
                    <Terminal className="h-6 w-6 text-green-400" />
                    <div>
                      <h4 className="text-white font-medium">WSL Mode</h4>
                      {processingMode.mode === 'wsl' && (
                        <p className="text-green-400 text-sm">Currently Active</p>
                      )}
                    </div>
                  </div>
                  <p className="text-white/70 text-sm">
                    Use Windows Subsystem for Linux for document processing.
                    Better compatibility with Linux-based tools.
                  </p>
                  <div className="mt-3">
                    <p className="text-white/60 text-xs">
                      Pros: Better tool compatibility, Linux ecosystem<br/>
                      Cons: Requires WSL installation, slight overhead
                    </p>
                  </div>
                </motion.div>
              </div>
            )}

            {isChangingMode && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary-400 mr-2" />
                <span className="text-white/70">Updating processing mode...</span>
              </div>
            )}

            {processingMode && (
              <div className="mt-4">
                <h4 className="text-white font-medium mb-2">Mode Information</h4>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-white/70">Current Mode:</span>
                      <span className="text-white font-medium ml-2 capitalize">{processingMode.mode}</span>
                    </div>
                    <div>
                      <span className="text-white/70">Available Modes:</span>
                      <span className="text-white font-medium ml-2">
                        {processingMode.available_modes.join(', ')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* Tool Installation Guidance */}
      {systemInfo.is_windows && Object.values(systemInfo.available_tools).some(tool => !tool) && (
        <GlassCard className="p-6">
          <h3 className="text-xl font-semibold text-white mb-4">Missing Tools Installation</h3>

          <div className="space-y-4">
            {!systemInfo.available_tools.tesseract && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <h4 className="text-yellow-400 font-medium">Tesseract OCR</h4>
                <p className="text-yellow-300/80 text-sm mt-1">
                  For OCR text extraction from images and scanned documents.
                </p>
                <p className="text-white/60 text-xs mt-2">
                  Download from: https://github.com/UB-Mannheim/tesseract/wiki
                </p>
              </div>
            )}

            {!systemInfo.available_tools.libreoffice && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <h4 className="text-yellow-400 font-medium">LibreOffice</h4>
                <p className="text-yellow-300/80 text-sm mt-1">
                  For processing Office documents (DOCX, PPTX, etc.).
                </p>
                <p className="text-white/60 text-xs mt-2">
                  Download from: https://www.libreoffice.org/download/
                </p>
              </div>
            )}

            {!systemInfo.available_tools.java && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                <h4 className="text-yellow-400 font-medium">Java Runtime</h4>
                <p className="text-yellow-300/80 text-sm mt-1">
                  Required for advanced table extraction from PDFs.
                </p>
                <p className="text-white/60 text-xs mt-2">
                  Download from: https://adoptopenjdk.net/
                </p>
              </div>
            )}
          </div>
        </GlassCard>
      )}
    </div>
  );
};