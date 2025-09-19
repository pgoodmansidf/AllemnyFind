import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database,
  Activity,
  RefreshCw,
  Trash2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Server,
  HardDrive,
  Users,
  Zap,
  Settings
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useIngestionStore } from '@/store/ingestionStore';
import toast from 'react-hot-toast';

interface RedisStats {
  memory: {
    used_memory: number;
    used_memory_human: string;
    used_memory_peak: number;
    used_memory_peak_human: string;
    maxmemory: number;
  };
  performance: {
    total_commands_processed: number;
    instantaneous_ops_per_sec: number;
    keyspace_hits: number;
    keyspace_misses: number;
    hit_rate: number;
  };
  keys: {
    total_keys: number;
    ingestion_keys: number;
    celery_keys: number;
    job_keys: number;
    expires: number;
  };
  connections: {
    connected_clients: number;
    blocked_clients: number;
    tracking_clients: number;
  };
  uptime: {
    uptime_in_seconds: number;
    uptime_in_days: number;
  };
}

interface RedisHealth {
  status: string;
  version: string;
  memory_usage: string;
  connected_clients: number;
  uptime: number;
  keyspace: any;
  last_checked: string;
  error?: string;
}

export const RedisManagement: React.FC = () => {
  const [redisStats, setRedisStats] = useState<RedisStats | null>(null);
  const [redisHealth, setRedisHealth] = useState<RedisHealth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [clearPattern, setClearPattern] = useState('*');
  const [confirmClear, setConfirmClear] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fetchRedisStats = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/v1/ingestion/redis/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      if (response.ok) {
        const stats = await response.json();
        setRedisStats(stats);
      } else {
        toast.error('Failed to fetch Redis statistics');
      }
    } catch (error) {
      console.error('Error fetching Redis stats:', error);
      toast.error('Error connecting to Redis');
    }
  };

  const fetchRedisHealth = async () => {
    try {
      const response = await fetch('/api/v1/ingestion/redis/health', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      const health = await response.json();
      setRedisHealth(health);
    } catch (error) {
      console.error('Error fetching Redis health:', error);
    }
  };

  const clearRedisCache = async (pattern: string = '*') => {
    if (!confirmClear) {
      toast.error('Please confirm the cache clear operation');
      return;
    }

    try {
      const response = await fetch('/api/v1/ingestion/redis/clear-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          pattern,
          confirm: true
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`${result.message} (${result.deleted_count} keys deleted)`);
        setConfirmClear(false);
        // Refresh stats after clearing
        await fetchRedisStats();
        await fetchRedisHealth();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to clear cache');
      }
    } catch (error) {
      console.error('Error clearing Redis cache:', error);
      toast.error('Error clearing cache');
    }
  };

  const clearIngestionCache = async () => {
    if (!confirmClear) {
      toast.error('Please confirm the ingestion cache clear operation');
      return;
    }

    try {
      const response = await fetch('/api/v1/ingestion/redis/clear-ingestion-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify({
          confirm: true
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(result.message);
        setConfirmClear(false);
        // Refresh stats after clearing
        await fetchRedisStats();
        await fetchRedisHealth();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to clear ingestion cache');
      }
    } catch (error) {
      console.error('Error clearing ingestion cache:', error);
      toast.error('Error clearing ingestion cache');
    }
  };

  const refreshData = async () => {
    setIsLoading(true);
    await Promise.all([fetchRedisStats(), fetchRedisHealth()]);
    setLastRefresh(new Date());
    setIsLoading(false);
  };

  useEffect(() => {
    refreshData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  };

  const getHealthStatusColor = (status: string) => {
    return status === 'connected' ? 'text-green-400' : 'text-red-400';
  };

  const getHealthStatusIcon = (status: string) => {
    return status === 'connected' ?
      <CheckCircle className="h-5 w-5 text-green-400" /> :
      <XCircle className="h-5 w-5 text-red-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
            <Database className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Redis Management</h2>
            <p className="text-white/70">Monitor and manage Redis cache</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant="glass"
            onClick={refreshData}
            disabled={isLoading}
            icon={<RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
          {lastRefresh && (
            <span className="text-sm text-white/60">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Health Status */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white flex items-center space-x-2">
            <Server className="h-5 w-5" />
            <span>Connection Status</span>
          </h3>
          {redisHealth && getHealthStatusIcon(redisHealth.status)}
        </div>

        {redisHealth ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-white/70 text-sm">Status</p>
              <p className={`font-medium ${getHealthStatusColor(redisHealth.status)}`}>
                {redisHealth.status === 'connected' ? 'Connected' : 'Disconnected'}
              </p>
            </div>
            <div>
              <p className="text-white/70 text-sm">Version</p>
              <p className="text-white font-medium">{redisHealth.version}</p>
            </div>
            <div>
              <p className="text-white/70 text-sm">Memory Usage</p>
              <p className="text-white font-medium">{redisHealth.memory_usage}</p>
            </div>
            <div>
              <p className="text-white/70 text-sm">Clients</p>
              <p className="text-white font-medium">{redisHealth.connected_clients}</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <Activity className="h-8 w-8 text-white/60 mx-auto mb-2 animate-spin" />
            <p className="text-white/70">Loading health status...</p>
          </div>
        )}

        {redisHealth?.error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{redisHealth.error}</p>
          </div>
        )}
      </GlassCard>

      {/* Statistics Overview */}
      {redisStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <GlassCard className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                <HardDrive className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-white/70 text-sm">Memory Used</p>
                <p className="text-xl font-bold text-white">{redisStats.memory.used_memory_human}</p>
                <p className="text-white/50 text-xs">Peak: {redisStats.memory.used_memory_peak_human}</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Database className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-white/70 text-sm">Total Keys</p>
                <p className="text-xl font-bold text-white">{redisStats.keys.total_keys.toLocaleString()}</p>
                <p className="text-white/50 text-xs">Ingestion: {redisStats.keys.ingestion_keys}</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                <Zap className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-white/70 text-sm">Hit Rate</p>
                <p className="text-xl font-bold text-white">{redisStats.performance.hit_rate.toFixed(1)}%</p>
                <p className="text-white/50 text-xs">Ops/sec: {redisStats.performance.instantaneous_ops_per_sec}</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                <Users className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <p className="text-white/70 text-sm">Connections</p>
                <p className="text-xl font-bold text-white">{redisStats.connections.connected_clients}</p>
                <p className="text-white/50 text-xs">Uptime: {formatUptime(redisStats.uptime.uptime_in_seconds)}</p>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Detailed Statistics */}
      {redisStats && (
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white flex items-center space-x-2">
              <Activity className="h-5 w-5" />
              <span>Detailed Statistics</span>
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvanced(!showAdvanced)}
              icon={<Settings className="h-4 w-4" />}
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <h4 className="text-lg font-medium text-white mb-3">Performance</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/70">Commands Processed:</span>
                  <span className="text-white">{redisStats.performance.total_commands_processed.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Cache Hits:</span>
                  <span className="text-white">{redisStats.performance.keyspace_hits.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Cache Misses:</span>
                  <span className="text-white">{redisStats.performance.keyspace_misses.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-medium text-white mb-3">Key Distribution</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/70">Celery Keys:</span>
                  <span className="text-white">{redisStats.keys.celery_keys}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Job Keys:</span>
                  <span className="text-white">{redisStats.keys.job_keys}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Ingestion Keys:</span>
                  <span className="text-white">{redisStats.keys.ingestion_keys}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-lg font-medium text-white mb-3">Connections</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/70">Connected:</span>
                  <span className="text-white">{redisStats.connections.connected_clients}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Blocked:</span>
                  <span className="text-white">{redisStats.connections.blocked_clients}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/70">Tracking:</span>
                  <span className="text-white">{redisStats.connections.tracking_clients}</span>
                </div>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 pt-6 border-t border-white/10"
              >
                <h4 className="text-lg font-medium text-white mb-3">Memory Details</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-white/70">Used Memory:</span>
                    <p className="text-white font-mono">{(redisStats.memory.used_memory / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <div>
                    <span className="text-white/70">Peak Memory:</span>
                    <p className="text-white font-mono">{(redisStats.memory.used_memory_peak / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                  <div>
                    <span className="text-white/70">Max Memory:</span>
                    <p className="text-white font-mono">
                      {redisStats.memory.maxmemory > 0 ?
                        `${(redisStats.memory.maxmemory / 1024 / 1024).toFixed(2)} MB` :
                        'Unlimited'
                      }
                    </p>
                  </div>
                  <div>
                    <span className="text-white/70">Memory Usage:</span>
                    <p className="text-white font-mono">
                      {redisStats.memory.maxmemory > 0 ?
                        `${((redisStats.memory.used_memory / redisStats.memory.maxmemory) * 100).toFixed(1)}%` :
                        'N/A'
                      }
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      )}

      {/* Cache Management */}
      <GlassCard className="p-6">
        <h3 className="text-xl font-semibold text-white mb-4 flex items-center space-x-2">
          <Trash2 className="h-5 w-5" />
          <span>Cache Management</span>
        </h3>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Input
              type="checkbox"
              checked={confirmClear}
              onChange={(e) => setConfirmClear(e.target.checked)}
              className="w-4 h-4"
            />
            <label className="text-white/70 text-sm">
              I confirm that I want to clear Redis cache data
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="text-lg font-medium text-white">Quick Actions</h4>
              <Button
                variant="danger"
                onClick={() => clearIngestionCache()}
                disabled={!confirmClear}
                icon={<Trash2 className="h-4 w-4" />}
                className="w-full"
              >
                Clear Ingestion Cache
              </Button>
              <p className="text-white/60 text-xs">
                Clears ingestion, celery, and job-related cache entries
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="text-lg font-medium text-white">Pattern-based Clear</h4>
              <Input
                placeholder="Pattern (e.g., job:*, celery:*)"
                value={clearPattern}
                onChange={(e) => setClearPattern(e.target.value)}
              />
              <Button
                variant="danger"
                onClick={() => clearRedisCache(clearPattern)}
                disabled={!confirmClear || !clearPattern.trim()}
                icon={<Trash2 className="h-4 w-4" />}
                className="w-full"
              >
                Clear Pattern
              </Button>
              <p className="text-white/60 text-xs">
                Use Redis pattern matching (* for wildcard)
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-start space-x-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-yellow-400 text-sm font-medium">Warning</p>
              <p className="text-yellow-300/80 text-sm">
                Clearing cache will remove all background job data and may affect running processes.
                Make sure no critical ingestion jobs are currently running.
              </p>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};