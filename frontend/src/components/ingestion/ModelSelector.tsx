import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Database, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Info,
  Cpu,
  HardDrive
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useIngestionStore } from '@/store/ingestionStore';
import { OllamaModel } from '@/services/ingestionApi';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  models: OllamaModel[];
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onModelChange,
  models
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { loadOllamaModels, testConnections, connectionStatus } = useIngestionStore();

  useEffect(() => {
    // Test connections when component mounts
    testConnections();
  }, [testConnections]);

  const handleRefreshModels = async () => {
    setIsRefreshing(true);
    await loadOllamaModels();
    await testConnections();
    setIsRefreshing(false);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const embeddingModels = models.filter(model => model.is_embedding_model);
  const otherModels = models.filter(model => !model.is_embedding_model);

  const isOllamaConnected = connectionStatus?.ollama?.status === 'connected';

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              isOllamaConnected ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <div>
              <h4 className="text-white font-medium">Ollama Service</h4>
              <p className="text-white/70 text-sm">
                {isOllamaConnected 
                  ? `Connected - ${connectionStatus?.ollama?.available_models || 0} models available`
                  : 'Disconnected - Unable to connect to Ollama'
                }
              </p>
            </div>
          </div>
          <Button
            variant="glass"
            size="sm"
            onClick={handleRefreshModels}
            loading={isRefreshing}
            icon={<Database className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>

        {!isOllamaConnected && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
              <div>
                <p className="text-red-400 font-medium text-sm">Ollama Not Available</p>
                <p className="text-red-300/70 text-sm mt-1">
                  Please ensure Ollama is installed and running on your system.
                </p>
              </div>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Embedding Models */}
      {embeddingModels.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
            <Cpu className="h-5 w-5 mr-2 text-primary-400" />
            Embedding Models (Recommended)
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {embeddingModels.map((model) => (
              <motion.div
                key={model.name}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <GlassCard
                  className={`p-4 cursor-pointer transition-all duration-200 ${
                    selectedModel === model.name
                      ? 'ring-2 ring-primary-500 bg-primary-500/10'
                      : 'hover:bg-white/5'
                  }`}
                  onClick={() => onModelChange(model.name)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        selectedModel === model.name
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-white/30'
                      }`}>
                        {selectedModel === model.name && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-white font-medium">{model.name}</h4>
                        <div className="flex items-center space-x-3 text-sm text-white/70">
                          <span className="flex items-center space-x-1">
                            <HardDrive className="h-3 w-3" />
                            <span>{formatFileSize(model.size)}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Database className="h-3 w-3" />
                            <span>{model.family}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {selectedModel === model.name && (
                      <CheckCircle className="h-5 w-5 text-primary-400" />
                    )}
                  </div>

                  {model.name.includes('nomic') && (
                    <div className="mt-3 p-2 bg-green-500/10 border border-green-500/20 rounded">
                      <p className="text-green-400 text-xs flex items-center">
                        <Info className="h-3 w-3 mr-1" />
                        Recommended for document embeddings
                      </p>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Other Models */}
      {otherModels.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
            <Database className="h-5 w-5 mr-2 text-white/60" />
            Other Available Models
          </h3>
          <div className="grid grid-cols-1 gap-3">
            {otherModels.map((model) => (
              <motion.div
                key={model.name}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <GlassCard
                  className={`p-4 cursor-pointer transition-all duration-200 ${
                    selectedModel === model.name
                      ? 'ring-2 ring-primary-500 bg-primary-500/10'
                      : 'hover:bg-white/5'
                  }`}
                  onClick={() => onModelChange(model.name)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        selectedModel === model.name
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-white/30'
                      }`}>
                        {selectedModel === model.name && (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-white font-medium">{model.name}</h4>
                        <div className="flex items-center space-x-3 text-sm text-white/70">
                          <span className="flex items-center space-x-1">
                            <HardDrive className="h-3 w-3" />
                            <span>{formatFileSize(model.size)}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Database className="h-3 w-3" />
                            <span>{model.family}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {selectedModel === model.name && (
                      <CheckCircle className="h-5 w-5 text-primary-400" />
                    )}
                  </div>

                  <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
                    <p className="text-yellow-400 text-xs flex items-center">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Not optimized for embeddings – may affect performance
                    </p>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* No Models Available */}
      {models.length === 0 && isOllamaConnected && (
        <div className="text-center py-8">
          <Database className="h-16 w-16 text-white/30 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-white mb-2">No Models Available</h3>
          <p className="text-white/70 mb-4">
            No Ollama models are currently installed on your system.
          </p>
          <Button
            variant="primary"
            onClick={handleRefreshModels}
            loading={isRefreshing}
          >
            Refresh Models
          </Button>
        </div>
      )}
    </div>
  );
};