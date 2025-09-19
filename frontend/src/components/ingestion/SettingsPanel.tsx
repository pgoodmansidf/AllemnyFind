import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, 
  Key, 
  Database, 
  TestTube, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Save,
  RefreshCw,
  Eye,
  EyeOff,
  Info
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useIngestionStore } from '@/store/ingestionStore';

export const SettingsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('groq');
  const [showApiKey, setShowApiKey] = useState(false);
  const [tempGroqKey, setTempGroqKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingConnections, setIsTestingConnections] = useState(false);

  // ---------------------------------------------------------------------------
  // Redis server configuration state and handlers
  //
  // Track the status of the local Redis service used by the ingestion and search
  // pipeline.  The status can be 'unknown' (initial), 'connected' or
  // 'disconnected'.  A separate flag indicates whether we're currently
  // attempting to start Redis.  These are defined at the top level of the
  // component to respect React's rules of hooks.
  const [redisStatus, setRedisStatus] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [startingRedis, setStartingRedis] = useState(false);

  // Default Redis host and port.  Adjust these values if your Redis
  // instance runs on a different host or port.
  const redisHost = 'localhost';
  const redisPort = 6379;

  // On mount, check whether Redis is currently running by hitting a
  // hypothetical API endpoint.  If the call fails we assume Redis is not
  // running.  You should implement the `/api/redis/status` endpoint in your
  // backend to return `{ status: 'connected' }` or `{ status: 'disconnected' }`.
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/redis/status');
        if (res.ok) {
          const data = await res.json();
          setRedisStatus(data?.status ?? 'disconnected');
        } else {
          setRedisStatus('disconnected');
        }
      } catch (err) {
        setRedisStatus('disconnected');
      }
    };
    checkStatus();
  }, []);

  // Attempt to start Redis by calling a backend endpoint.  On success the
  // status updates to 'connected'.  Otherwise, the status will remain
  // 'disconnected'.  You should implement the `/api/redis/start` endpoint in
  // your backend to start the Redis service.
  const handleStartRedis = async () => {
    setStartingRedis(true);
    try {
      const res = await fetch('/api/redis/start', { method: 'POST' });
      if (res.ok) {
        setRedisStatus('connected');
      } else {
        setRedisStatus('disconnected');
      }
    } catch (err) {
      setRedisStatus('disconnected');
    } finally {
      setStartingRedis(false);
    }
  };

  const {
    groqApiKey,
    setGroqApiKey,
    connectionStatus,
    testConnections,
    ollamaModels,
    loadOllamaModels,
    selectedEmbeddingModel,
    setSelectedEmbeddingModel
  } = useIngestionStore();

  useEffect(() => {
    setTempGroqKey(groqApiKey);
  }, [groqApiKey]);

  useEffect(() => {
    // Test connections when component mounts
    testConnections();
  }, [testConnections]);

  const handleSaveGroqKey = async () => {
    setIsSaving(true);
    setGroqApiKey(tempGroqKey);
    
    // Test connections after saving
    setTimeout(async () => {
      await testConnections();
      setIsSaving(false);
    }, 1000);
  };

  const handleTestConnections = async () => {
    setIsTestingConnections(true);
    await testConnections();
    await loadOllamaModels();
    setIsTestingConnections(false);
  };

  const tabs = [
    {
      id: 'groq',
      name: 'Groq API',
      icon: <Key className="h-4 w-4" />,
    },
    {
      id: 'ollama',
      name: 'Ollama',
      icon: <Database className="h-4 w-4" />,
    },
    {
      id: 'connections',
      name: 'Connection Test',
      icon: <TestTube className="h-4 w-4" />,
    },
    // Added Redis tab to manage Redis server settings
    {
      id: 'redis',
      name: 'Redis Server',
      icon: <Database className="h-4 w-4" />,
    },
  ];

  const renderGroqSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Groq API Configuration</h3>
        <p className="text-white/70 text-sm mb-6">
          Configure your Groq API key for document summarization and tag extraction.
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <Input
            label="Groq API Key"
            type={showApiKey ? 'text' : 'password'}
            placeholder="Enter your Groq API key"
            value={tempGroqKey}
            onChange={(e) => setTempGroqKey(e.target.value)}
          />
          <button
            type="button"
            className="absolute right-3 top-11 text-white/60 hover:text-white transition-colors"
            onClick={() => setShowApiKey(!showApiKey)}
          >
            {showApiKey ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>

        <div className="flex space-x-3">
          <Button
            variant="primary"
            onClick={handleSaveGroqKey}
            loading={isSaving}
            disabled={tempGroqKey === groqApiKey}
            icon={<Save className="h-4 w-4" />}
          >
            Save API Key
          </Button>
          <Button
            variant="glass"
            onClick={() => setTempGroqKey(groqApiKey)}
            disabled={tempGroqKey === groqApiKey}
          >
            Reset
          </Button>
        </div>
      </div>

      {/* API Key Status */}
      {connectionStatus?.groq && (
        <GlassCard className="p-4">
          <div className="flex items-center space-x-3">
            {connectionStatus.groq.status === 'connected' ? (
              <CheckCircle className="h-5 w-5 text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400" />
            )}
            <div className="flex-1">
              <h4 className="text-white font-medium">
                {connectionStatus.groq.status === 'connected' ? 'API Key Valid' : 'API Key Invalid'}
              </h4>
              <p className="text-white/70 text-sm">
                {connectionStatus.groq.status === 'connected' 
                  ? `Using model: ${connectionStatus.groq.model}`
                  : connectionStatus.groq.error || 'Unable to connect to Groq API'
                }
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Information Card */}
      <GlassCard className="p-4 bg-blue-500/10 border-blue-500/20">
        <div className="flex items-start space-x-3">
          <Info className="h-5 w-5 text-blue-400 mt-0.5" />
          <div>
            <h4 className="text-blue-400 font-medium">About Groq API</h4>
            <p className="text-blue-300/70 text-sm mt-1">
              Groq provides fast AI inference for document summarization and intelligent tag extraction. 
              Get your API key from <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="underline">console.groq.com</a>
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );

  const renderOllamaSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Ollama Configuration</h3>
        <p className="text-white/70 text-sm mb-6">
          Manage your local Ollama installation and embedding models.
        </p>
      </div>

      {/* Connection Status */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {connectionStatus?.ollama?.status === 'connected' ? (
              <CheckCircle className="h-5 w-5 text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400" />
            )}
            <div>
              <h4 className="text-white font-medium">
                {connectionStatus?.ollama?.status === 'connected' ? 'Ollama Connected' : 'Ollama Disconnected'}
              </h4>
              <p className="text-white/70 text-sm">
                {connectionStatus?.ollama?.status === 'connected' 
                  ? `${connectionStatus.ollama.available_models} models available`
                  : 'Ollama service is not running or accessible'
                }
              </p>
            </div>
          </div>
          <Button
            variant="glass"
            size="sm"
            onClick={loadOllamaModels}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        </div>
      </GlassCard>

      {/* Default Model Selection */}
      {ollamaModels.length > 0 && (
        <div>
          <h4 className="text-white font-medium mb-3">Default Embedding Model</h4>
          <div className="space-y-2">
            {ollamaModels.filter(m => m.is_embedding_model).map((model) => (
              <div
                key={model.name}
                className={`p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                  selectedEmbeddingModel === model.name
                    ? 'bg-primary-500/20 border border-primary-500/30'
                    : 'bg-white/5 hover:bg-white/10 border border-white/10'
                }`}
                onClick={() => setSelectedEmbeddingModel(model.name)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded-full border-2 ${
                      selectedEmbeddingModel === model.name
                        ? 'border-primary-500 bg-primary-500'
                        : 'border-white/30'
                    }`}>
                      {selectedEmbeddingModel === model.name && (
                        <div className="w-full h-full rounded-full bg-white scale-50" />
                      )}
                    </div>
                    <span className="text-white font-medium">{model.name}</span>
                  </div>
                  <span className="text-white/60 text-sm">
                    {(model.size / 1024 / 1024 / 1024).toFixed(1)} GB
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Information Card */}
      <GlassCard className="p-4 bg-green-500/10 border-green-500/20">
        <div className="flex items-start space-x-3">
          <Info className="h-5 w-5 text-green-400 mt-0.5" />
          <div>
            <h4 className="text-green-400 font-medium">About Ollama</h4>
            <p className="text-green-300/70 text-sm mt-1">
              Ollama runs large language models locally. Install from{' '}
              <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="underline">
                ollama.ai
              </a>{' '}
              and ensure it's running on port 11434.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );

  const renderConnectionTest = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Connection Test</h3>
        <p className="text-white/70 text-sm mb-6">
          Test connections to all external services and verify system configuration.
        </p>
      </div>

      <Button
        variant="primary"
        onClick={handleTestConnections}
        loading={isTestingConnections}
        icon={<TestTube className="h-4 w-4" />}
        className="w-full"
      >
        Test All Connections
      </Button>

      {/* Connection Results */}
      {connectionStatus && (
        <div className="space-y-4">
          {/* Ollama Status */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Database className="h-5 w-5 text-white/60" />
                <div>
                  <h4 className="text-white font-medium">Ollama Service</h4>
                  <p className="text-white/70 text-sm">
                    {connectionStatus.ollama?.ollama_url || 'http://localhost:11434'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {connectionStatus.ollama?.status === 'connected' ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span className="text-green-400 text-sm font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <span className="text-red-400 text-sm font-medium">Disconnected</span>
                  </>
                )}
              </div>
            </div>
            {connectionStatus.ollama?.error && (
              <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                {connectionStatus.ollama.error}
              </div>
            )}
          </GlassCard>

          {/* Groq Status */}
          <GlassCard className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Key className="h-5 w-5 text-white/60" />
                <div>
                  <h4 className="text-white font-medium">Groq API</h4>
                  <p className="text-white/70 text-sm">
                    {connectionStatus.groq?.model || 'AI Summarization Service'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {connectionStatus.groq?.status === 'connected' ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-400" />
                    <span className="text-green-400 text-sm font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-red-400" />
                    <span className="text-red-400 text-sm font-medium">Disconnected</span>
                  </>
                )}
              </div>
            </div>
            {connectionStatus.groq?.error && (
              <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                {connectionStatus.groq.error}
              </div>
            )}
          </GlassCard>

          {/* Overall Status */}
          <GlassCard className={`p-4 ${
            connectionStatus.overall_status === 'connected' 
              ? 'bg-green-500/10 border-green-500/20' 
              : 'bg-red-500/10 border-red-500/20'
          }`}>
            <div className="flex items-center space-x-3">
              {connectionStatus.overall_status === 'connected' ? (
                <CheckCircle className="h-5 w-5 text-green-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-400" />
              )}
              <div>
                <h4 className={`font-medium ${
                  connectionStatus.overall_status === 'connected' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {connectionStatus.overall_status === 'connected' 
                    ? 'All Systems Ready' 
                    : 'System Configuration Issues'
                  }
                </h4>
                <p className={`text-sm ${
                  connectionStatus.overall_status === 'connected' ? 'text-green-300/70' : 'text-red-300/70'
                }`}>
                  {connectionStatus.overall_status === 'connected' 
                    ? 'All services are connected and ready for document processing'
                    : 'Some services are unavailable. Check configuration above.'
                  }
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );

  // Render the Redis settings tab.  This component uses top-level state
  // variables `redisStatus`, `startingRedis`, `redisHost`, `redisPort` and the
  // `handleStartRedis` function defined in the SettingsPanel component.
  const renderRedisSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Redis Server Configuration</h3>
        <p className="text-white/70 text-sm mb-6">
          Manage your Redis server used for streaming real-time updates and caching.  Ensure Redis
          is running locally or provide the correct host/port information.
        </p>
      </div>

      {/* Connection Info */}
      <GlassCard className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {redisStatus === 'connected' ? (
              <CheckCircle className="h-5 w-5 text-green-400" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-400" />
            )}
            <div>
              <h4 className="text-white font-medium">
                {redisStatus === 'connected' ? 'Redis Connected' : 'Redis Disconnected'}
              </h4>
              <p className="text-white/70 text-sm">
                {redisHost}:{redisPort}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleStartRedis}
            loading={startingRedis}
            disabled={redisStatus === 'connected'}
          >
            {redisStatus === 'connected' ? 'Running' : 'Start Redis'}
          </Button>
        </div>
      </GlassCard>

      {/* Information Card */}
      <GlassCard className="p-4 bg-yellow-500/10 border-yellow-500/20">
        <div className="flex items-start space-x-3">
          <Info className="h-5 w-5 text-yellow-400 mt-0.5" />
          <div>
            <h4 className="text-yellow-400 font-medium">About Redis</h4>
            <p className="text-yellow-300/70 text-sm mt-1">
              Redis is an in-memory data structure store used for caching and messaging.  It can
              significantly improve real-time performance for your ingestion and search pipeline.
              See the <a href="https://redis.io" target="_blank" rel="noopener noreferrer" className="underline">Redis documentation</a> for installation instructions.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );


  const renderTabContent = () => {
    switch (activeTab) {
      case 'groq':
        return renderGroqSettings();
      case 'ollama':
        return renderOllamaSettings();
      case 'connections':
        return renderConnectionTest();
      case 'redis':
        return renderRedisSettings();
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-3 mb-6">
        <Settings className="h-6 w-6 text-primary-400" />
        <h2 className="text-2xl font-bold text-white">Settings</h2>
      </div>

      {/* Tab Navigation */}
      <GlassCard className="p-1">
        <div className="flex space-x-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-3 rounded-lg transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.icon}
              <span className="font-medium">{tab.name}</span>
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Tab Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        <GlassCard className="p-6">
          {renderTabContent()}
        </GlassCard>
      </motion.div>
    </div>
  );
};