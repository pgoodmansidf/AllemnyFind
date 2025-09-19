import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { 
  FolderOpen, 
  Settings, 
  Play, 
  AlertCircle, 
  CheckCircle,
  Loader2,
  Database,
  Tag
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useIngestionStore } from '@/store/ingestionStore';
import { CreateIngestionJobRequest } from '@/services/ingestionApi';
import { DirectoryBrowser } from './DirectoryBrowser';
import { ModelSelector } from './ModelSelector';

interface CreateJobFormProps {
  onSuccess?: (jobId: string) => void;
  onCancel?: () => void;
}

interface FormData {
  name: string;
  description: string;
  source_path: string;
  source_type: 'local' | 'network_share';
  main_tag: string;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
}

export const CreateJobForm: React.FC<CreateJobFormProps> = ({
  onSuccess,
  onCancel,
}) => {
  const [step, setStep] = useState(1);
  const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);
  const [isValidatingPath, setIsValidatingPath] = useState(false);
  const [pathValid, setPathValid] = useState<boolean | null>(null);

  const {
    createJob,
    validatePath,
    scanDirectory,
    currentScanResult,
    selectedPath,
    setSelectedPath,
    selectedEmbeddingModel,
    ollamaModels,
    loadOllamaModels,
    isLoading,
  } = useIngestionStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    trigger,
  } = useForm<FormData>({
    defaultValues: {
      name: '',
      description: '',
      source_path: selectedPath || '',
      source_type: 'local',
      main_tag: '',
      embedding_model: selectedEmbeddingModel,
      chunk_size: 500,
      chunk_overlap: 100,
    },
  });

  const watchedPath = watch('source_path');

  // Load Ollama models on mount
  useEffect(() => {
    loadOllamaModels();
  }, [loadOllamaModels]);

  // Update form when selectedPath changes
  useEffect(() => {
    if (selectedPath) {
      setValue('source_path', selectedPath);
      trigger('source_path');
    }
  }, [selectedPath, setValue, trigger]);

  // Update form when selectedEmbeddingModel changes
  useEffect(() => {
    if (selectedEmbeddingModel) {
      setValue('embedding_model', selectedEmbeddingModel);
    }
  }, [selectedEmbeddingModel, setValue]);

  const handlePathValidation = async (path: string) => {
    if (!path.trim()) {
      setPathValid(null);
      return;
    }

    setIsValidatingPath(true);
    try {
      const isValid = await validatePath(path);
      setPathValid(isValid);
      if (isValid) {
        setSelectedPath(path);
        // Auto-scan the directory
        await scanDirectory(path);
      }
    } catch (error) {
      setPathValid(false);
    } finally {
      setIsValidatingPath(false);
    }
  };

  const handlePathChange = (path: string) => {
    setValue('source_path', path);
    setSelectedPath(path);
    handlePathValidation(path);
  };

  const onSubmit = async (data: FormData) => {
    const request: CreateIngestionJobRequest = {
      name: data.name,
      description: data.description || undefined,
      source_path: data.source_path,
      source_type: data.source_type,
      main_tag: data.main_tag,
      embedding_model: data.embedding_model,
      chunk_size: data.chunk_size,
      chunk_overlap: data.chunk_overlap,
    };

    const success = await createJob(request);
    if (success) {
      onSuccess?.(request.name);
    }
  };

  const getStepValidation = () => {
    switch (step) {
      case 1:
        return watch('name') && watch('main_tag');
      case 2:
        return pathValid && currentScanResult?.success;
      case 3:
        return watch('embedding_model');
      default:
        return true;
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-primary-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Tag className="h-8 w-8 text-primary-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Job Information</h3>
              <p className="text-white/70">Set up your ingestion job details</p>
            </div>

            <Input
              label="Job Name"
              placeholder="e.g., Q4 Industry Reports"
              {...register('name', {
                required: 'Job name is required',
                minLength: { value: 3, message: 'Name must be at least 3 characters' },
              })}
              error={errors.name?.message}
            />

            <Input
              label="Description (Optional)"
              placeholder="Brief description of this ingestion job"
              {...register('description')}
            />

            <Input
              label="Main Tag"
              placeholder="e.g., industry-study, market-research, product-report"
              {...register('main_tag', {
                required: 'Main tag is required',
                pattern: {
                  value: /^[a-zA-Z0-9-_]+$/,
                  message: 'Tag can only contain letters, numbers, hyphens, and underscores',
                },
              })}
              error={errors.main_tag?.message}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Chunk Size (tokens)"
                type="number"
                min="100"
                max="2000"
                {...register('chunk_size', {
                  required: 'Chunk size is required',
                  min: { value: 100, message: 'Minimum chunk size is 100' },
                  max: { value: 2000, message: 'Maximum chunk size is 2000' },
                })}
                error={errors.chunk_size?.message}
              />

              <Input
                label="Chunk Overlap (tokens)"
                type="number"
                min="0"
                max="500"
                {...register('chunk_overlap', {
                  required: 'Chunk overlap is required',
                  min: { value: 0, message: 'Minimum overlap is 0' },
                  max: { value: 500, message: 'Maximum overlap is 500' },
                })}
                error={errors.chunk_overlap?.message}
              />
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <FolderOpen className="h-8 w-8 text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Source Directory</h3>
              <p className="text-white/70">Select the directory containing your documents</p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Input
                  label="Directory Path"
                  placeholder="Enter the path to your documents"
                  value={watchedPath}
                  onChange={(e) => handlePathChange(e.target.value)}
                  error={errors.source_path?.message}
                />
                
                {isValidatingPath && (
                  <div className="absolute right-3 top-11 flex items-center">
                    <Loader2 className="h-5 w-5 animate-spin text-white/60" />
                  </div>
                )}
                
                {pathValid !== null && !isValidatingPath && (
                  <div className="absolute right-3 top-11 flex items-center">
                    {pathValid ? (
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-400" />
                    )}
                  </div>
                )}
              </div>

              <Button
                type="button"
                variant="glass"
                onClick={() => setShowDirectoryBrowser(true)}
                className="w-full"
              >
                <FolderOpen className="h-5 w-5 mr-2" />
                Browse Directories
              </Button>
            </div>

            {currentScanResult && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6"
              >
                <GlassCard className="p-4">
                  <h4 className="text-lg font-semibold text-white mb-3">Scan Results</h4>
                  
                  {currentScanResult.success ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-white/70">Total Files:</span>
                          <span className="text-white font-medium ml-2">
                            {currentScanResult.total_files}
                          </span>
                        </div>
                        <div>
                          <span className="text-white/70">Total Size:</span>
                          <span className="text-white font-medium ml-2">
                            {Math.round(currentScanResult.total_size / 1024 / 1024)} MB
                          </span>
                        </div>
                      </div>

                      {Object.keys(currentScanResult.file_types).length > 0 && (
                        <div>
                          <h5 className="text-white/90 font-medium mb-2">File Types:</h5>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {Object.entries(currentScanResult.file_types).map(([ext, stats]) => (
                              <div key={ext} className="flex justify-between">
                                <span className="text-white/70">{ext.toUpperCase()}:</span>
                                <span className="text-white">{stats.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-red-400 text-sm">
                      Scan failed: {currentScanResult.scan_info?.error || 'Unknown error'}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Database className="h-8 w-8 text-purple-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Embedding Model</h3>
              <p className="text-white/70">Choose the model for generating embeddings</p>
            </div>

            <ModelSelector
              selectedModel={watch('embedding_model')}
              onModelChange={(model) => setValue('embedding_model', model)}
              models={ollamaModels}
            />
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Review & Create</h3>
              <p className="text-white/70">Review your settings before creating the job</p>
            </div>

            <GlassCard className="p-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-white/70 text-sm font-medium">Job Name</h4>
                    <p className="text-white">{watch('name')}</p>
                  </div>
                  <div>
                    <h4 className="text-white/70 text-sm font-medium">Main Tag</h4>
                    <p className="text-white">{watch('main_tag')}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-white/70 text-sm font-medium">Source Path</h4>
                  <p className="text-white text-sm break-all">{watch('source_path')}</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <h4 className="text-white/70 text-sm font-medium">Embedding Model</h4>
                    <p className="text-white text-sm">{watch('embedding_model')}</p>
                  </div>
                  <div>
                    <h4 className="text-white/70 text-sm font-medium">Chunk Size</h4>
                    <p className="text-white">{watch('chunk_size')} tokens</p>
                  </div>
                  <div>
                    <h4 className="text-white/70 text-sm font-medium">Overlap</h4>
                    <p className="text-white">{watch('chunk_overlap')} tokens</p>
                  </div>
                </div>

                {currentScanResult && (
                  <div>
                    <h4 className="text-white/70 text-sm font-medium">Files to Process</h4>
                    <p className="text-white">{currentScanResult.total_files} files</p>
                  </div>
                )}
              </div>
            </GlassCard>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <GlassCard className="w-full max-w-4xl mx-auto p-8">
        <form onSubmit={handleSubmit(onSubmit)}>
          {/* Step indicator */}
          <div className="flex items-center justify-center mb-8">
            {[1, 2, 3, 4].map((stepNumber) => (
              <div key={stepNumber} className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                    stepNumber <= step
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : 'border-white/30 text-white/50'
                  }`}
                >
                  {stepNumber < step ? (
                    <CheckCircle className="h-6 w-6" />
                  ) : (
                    stepNumber
                  )}
                </div>
                {stepNumber < 4 && (
                  <div
                    className={`w-16 h-0.5 mx-2 transition-all duration-300 ${
                      stepNumber < step ? 'bg-primary-500' : 'bg-white/30'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Step content */}
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            {renderStepContent()}
          </motion.div>

          {/* Navigation buttons */}
          <div className="flex justify-between mt-8">
            <div className="flex space-x-3">
              {step > 1 && (
                <Button
                  type="button"
                  variant="glass"
                  onClick={() => setStep(step - 1)}
                >
                  Previous
                </Button>
              )}
              
              {onCancel && step === 1 && (
                <Button
                  type="button"
                  variant="glass"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              )}
            </div>

            <div>
              {step < 4 ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setStep(step + 1)}
                  disabled={!getStepValidation()}
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="submit"
                  variant="success"
                  loading={isLoading}
                  disabled={!getStepValidation()}
                  icon={<Play className="h-5 w-5" />}
                >
                  Create Job
                </Button>
              )}
            </div>
          </div>
        </form>
      </GlassCard>

      {/* Directory Browser Modal */}
      {showDirectoryBrowser && (
        <DirectoryBrowser
          onSelectPath={(path) => {
            handlePathChange(path);
            setShowDirectoryBrowser(false);
          }}
          onClose={() => setShowDirectoryBrowser(false)}
        />
      )}
    </>
  );
};