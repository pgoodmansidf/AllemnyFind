import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Settings, History, Database, Activity, Users, FileText, Clock, TrendingUp } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { dashboardService, DashboardMetrics, TopicCloudItem } from '@/services/dashboardService';
import toast from 'react-hot-toast';

export const Dashboard: React.FC = () => {
  const { user } = useAuthStore();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [topicCloud, setTopicCloud] = useState<TopicCloudItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [metricsData, topicsData] = await Promise.all([
        dashboardService.getDashboardMetrics(),
        dashboardService.getTopicCloudData(30)
      ]);
      setMetrics(metricsData);
      setTopicCloud(topicsData);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
    toast.success('Dashboard data refreshed');
  };

  const quickActions = [
    {
      title: 'New Ingestion',
      description: 'Start ingesting documents',
      icon: <Plus className="h-8 w-8" />,
      color: 'from-primary-500 to-primary-600',
      action: () => window.location.href = '/ingestion',
    },
    {
      title: 'View History',
      description: 'Check ingestion history',
      icon: <History className="h-8 w-8" />,
      color: 'from-success-500 to-success-600',
      action: () => window.location.href = '/ingestion',
    },
    {
      title: 'Search Knowledge',
      description: 'Search through documents',
      icon: <Database className="h-8 w-8" />,
      color: 'from-blue-500 to-blue-600',
      action: () => window.location.href = '/search',
    },
  ];

  const getStatsFromMetrics = () => {
    if (!metrics) {
      return [
        { label: 'Total Documents', value: '0', icon: <FileText className="h-5 w-5" />, color: 'text-blue-400' },
        { label: 'Active Jobs', value: '0', icon: <Activity className="h-5 w-5" />, color: 'text-green-400' },
        { label: 'Success Rate', value: '100%', icon: <TrendingUp className="h-5 w-5" />, color: 'text-purple-400' },
        { label: 'Total Chunks', value: '0', icon: <Database className="h-5 w-5" />, color: 'text-orange-400' },
      ];
    }

    return [
      {
        label: 'Total Documents',
        value: metrics.basic_stats.total_documents.toLocaleString(),
        icon: <FileText className="h-5 w-5" />,
        color: 'text-blue-400'
      },
      {
        label: 'Active Jobs',
        value: metrics.basic_stats.active_jobs.toString(),
        icon: <Activity className="h-5 w-5" />,
        color: 'text-green-400'
      },
      {
        label: 'Success Rate',
        value: `${metrics.basic_stats.success_rate}%`,
        icon: <TrendingUp className="h-5 w-5" />,
        color: 'text-purple-400'
      },
      {
        label: 'Total Chunks',
        value: metrics.basic_stats.total_chunks.toLocaleString(),
        icon: <Database className="h-5 w-5" />,
        color: 'text-orange-400'
      },
    ];
  };

  const stats = getStatsFromMetrics();

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <GlassCard className="p-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                Welcome back, {user?.full_name || user?.username}!
              </h1>
              <p className="text-white/70 text-lg">
                Ready to load more knowledge?
              </p>
            </div>
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              <Database className="h-16 w-16 text-primary-400" />
            </motion.div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Stats Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {stats.map((stat, index) => (
          <GlassCard key={stat.label} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/70 text-sm font-medium">{stat.label}</p>
                {loading ? (
                  <div className="mt-1 h-8 w-16 bg-white/20 rounded animate-pulse"></div>
                ) : (
                  <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                )}
              </div>
              <div className={stat.color || "text-primary-400"}>{stat.icon}</div>
            </div>
          </GlassCard>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <h2 className="text-2xl font-bold text-white mb-6">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {quickActions.map((action, index) => (
            <motion.div
              key={action.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 * index }}
            >
              <GlassCard className="p-6 cursor-pointer group" onClick={action.action}>
                <div className="text-center">
                  <div
                    className={`inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-r ${action.color} mb-4 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <span className="text-white">{action.icon}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">
                    {action.title}
                  </h3>
                  <p className="text-white/70">{action.description}</p>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Knowledge Overview Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
      >
        {/* Topic Cloud */}
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white">Knowledge Topics</h3>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-50"
            >
              <motion.div
                animate={refreshing ? { rotate: 360 } : {}}
                transition={{ duration: 1, repeat: refreshing ? Infinity : 0, ease: "linear" }}
              >
                <Database className="h-4 w-4 text-white" />
              </motion.div>
            </button>
          </div>
          {loading ? (
            <div className="flex flex-wrap gap-2">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="h-6 bg-white/20 rounded animate-pulse"
                  style={{ width: `${Math.random() * 60 + 40}px` }}
                ></div>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
              {topicCloud.map((topic, index) => (
                <motion.span
                  key={topic.text}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className="inline-block px-3 py-1 rounded-full text-white font-semibold cursor-pointer hover:scale-105 transition-transform"
                  style={{
                    backgroundColor: topic.color + '40',
                    border: `1px solid ${topic.color}`,
                    fontSize: topic.fontSize,
                    fontWeight: topic.fontWeight,
                  }}
                  title={`${topic.value} documents`}
                >
                  {topic.text}
                </motion.span>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Recent Activity */}
        <GlassCard className="p-6">
          <h3 className="text-xl font-bold text-white mb-4">Recent Activity</h3>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex items-center space-x-3">
                  <div className="h-10 w-10 bg-white/20 rounded animate-pulse"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-white/20 rounded animate-pulse mb-2" style={{ width: '70%' }}></div>
                    <div className="h-3 bg-white/20 rounded animate-pulse" style={{ width: '40%' }}></div>
                  </div>
                </div>
              ))}
            </div>
          ) : metrics && metrics.recent_activity.length > 0 ? (
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {metrics.recent_activity.map((activity, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="flex items-center space-x-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <FileText className="h-8 w-8 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{activity.filename}</p>
                    <div className="flex items-center space-x-2 text-sm text-white/60">
                      <span>{activity.file_type}</span>
                      <span>•</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        activity.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                        activity.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                        'bg-yellow-500/20 text-yellow-300'
                      }`}>
                        {activity.status}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <p className="text-white/60 text-center py-8">No recent activity</p>
          )}
        </GlassCard>
      </motion.div>

      {/* Storage & Performance Stats */}
      {metrics && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          <GlassCard className="p-6 text-center">
            <Database className="h-12 w-12 text-blue-400 mx-auto mb-3" />
            <h4 className="text-lg font-semibold text-white mb-2">Storage Used</h4>
            <p className="text-2xl font-bold text-blue-400">{metrics.basic_stats.total_size_mb.toFixed(1)} MB</p>
          </GlassCard>

          <GlassCard className="p-6 text-center">
            <Clock className="h-12 w-12 text-green-400 mx-auto mb-3" />
            <h4 className="text-lg font-semibold text-white mb-2">Recent Uploads</h4>
            <p className="text-2xl font-bold text-green-400">{metrics.basic_stats.recent_documents}</p>
            <p className="text-sm text-white/60">Last 7 days</p>
          </GlassCard>

          <GlassCard className="p-6 text-center">
            <TrendingUp className="h-12 w-12 text-purple-400 mx-auto mb-3" />
            <h4 className="text-lg font-semibold text-white mb-2">Tag Distribution</h4>
            <p className="text-2xl font-bold text-purple-400">{metrics.distribution.main_tags.length}</p>
            <p className="text-sm text-white/60">Unique tags</p>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
};