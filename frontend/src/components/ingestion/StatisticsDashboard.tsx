import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  FileText, 
  Database,
  Activity,
  CheckCircle,
  AlertCircle,
  Zap,
  Calendar,
  PieChart,
  Target
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useIngestionStore } from '@/store/ingestionStore';

export const StatisticsDashboard: React.FC = () => {
  const { jobs, loadJobs } = useIngestionStore();
  const [timeRange, setTimeRange] = useState('7d');

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Calculate statistics
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(job => job.status === 'completed').length;
  const failedJobs = jobs.filter(job => job.status === 'failed').length;
  const runningJobs = jobs.filter(job => job.status === 'running').length;
  const pendingJobs = jobs.filter(job => job.status === 'pending').length;

  const totalFiles = jobs.reduce((sum, job) => sum + (job.total_files || 0), 0);
  const processedFiles = jobs.reduce((sum, job) => sum + (job.processed_files || 0), 0);
  const failedFiles = jobs.reduce((sum, job) => sum + (job.failed_files || 0), 0);

  const successRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;
  const processingRate = totalFiles > 0 ? (processedFiles / totalFiles) * 100 : 0;

  // Calculate average processing time for completed jobs
  const completedJobsWithDuration = jobs.filter(job => 
    job.status === 'completed' && job.started_at && job.completed_at
  );
  
  const averageProcessingTime = completedJobsWithDuration.length > 0 
    ? completedJobsWithDuration.reduce((sum, job) => {
        const duration = new Date(job.completed_at!).getTime() - new Date(job.started_at!).getTime();
        return sum + duration;
      }, 0) / completedJobsWithDuration.length / 1000 / 60 // Convert to minutes
    : 0;

  // Group jobs by embedding model
  const modelUsage = jobs.reduce((acc, job) => {
    acc[job.embedding_model] = (acc[job.embedding_model] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Group jobs by main tag
  const tagUsage = jobs.reduce((acc, job) => {
    acc[job.main_tag] = (acc[job.main_tag] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Recent activity (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  const recentJobs = jobs.filter(job => 
    new Date(job.created_at) > sevenDaysAgo
  );

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${Math.round(minutes)}m`;
    return `${Math.round(minutes / 60)}h ${Math.round(minutes % 60)}m`;
  };

  const StatCard: React.FC<{
    title: string;
    value: string | number;
    icon: React.ReactNode;
    trend?: number;
    color: string;
    subtitle?: string;
  }> = ({ title, value, icon, trend, color, subtitle }) => (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/70 text-sm font-medium">{title}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
          {subtitle && (
            <p className="text-white/60 text-xs mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      {trend !== undefined && (
        <div className="mt-3 flex items-center space-x-1">
          <TrendingUp className={`h-3 w-3 ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`} />
          <span className={`text-xs ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {trend >= 0 ? '+' : ''}{trend.toFixed(1)}% from last week
          </span>
        </div>
      )}
    </GlassCard>
  );

  const ProgressRing: React.FC<{
    percentage: number;
    size: number;
    strokeWidth: number;
    color: string;
    label: string;
  }> = ({ percentage, size, strokeWidth, color, label }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;

    return (
      <div className="flex flex-col items-center">
        <div className="relative">
          <svg width={size} height={size} className="transform -rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color}
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-white">{percentage.toFixed(0)}%</span>
          </div>
        </div>
        <p className="text-white/70 text-sm mt-2 text-center">{label}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <BarChart3 className="h-6 w-6 text-primary-400" />
          <h2 className="text-2xl font-bold text-white">Statistics</h2>
        </div>
        <div className="flex items-center space-x-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="7d" className="bg-gray-800">Last 7 days</option>
            <option value="30d" className="bg-gray-800">Last 30 days</option>
            <option value="90d" className="bg-gray-800">Last 90 days</option>
            <option value="all" className="bg-gray-800">All time</option>
          </select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Jobs"
          value={totalJobs}
          icon={<Database className="h-6 w-6 text-primary-400" />}
          color="bg-primary-500/20"
          subtitle={`${recentJobs.length} created this week`}
        />
        <StatCard
          title="Success Rate"
          value={`${successRate.toFixed(1)}%`}
          icon={<Target className="h-6 w-6 text-green-400" />}
          color="bg-green-500/20"
          subtitle={`${completedJobs} completed jobs`}
        />
        <StatCard
          title="Files Processed"
          value={processedFiles.toLocaleString()}
          icon={<FileText className="h-6 w-6 text-blue-400" />}
          color="bg-blue-500/20"
          subtitle={`${totalFiles.toLocaleString()} total files`}
        />
        <StatCard
          title="Avg Processing Time"
          value={formatDuration(averageProcessingTime)}
          icon={<Clock className="h-6 w-6 text-purple-400" />}
          color="bg-purple-500/20"
          subtitle="Per completed job"
        />
      </div>

      {/* Status Overview & Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Job Status Distribution */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Job Status Distribution</h3>
          <div className="grid grid-cols-2 gap-6">
            <ProgressRing
              percentage={successRate}
              size={120}
              strokeWidth={8}
              color="#10b981"
              label="Success Rate"
            />
            <ProgressRing
              percentage={processingRate}
              size={120}
              strokeWidth={8}
              color="#3b82f6"
              label="File Processing"
            />
          </div>
          
          <div className="mt-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span className="text-white/70">Completed</span>
              </div>
              <span className="text-white font-medium">{completedJobs}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-blue-400" />
                <span className="text-white/70">Running</span>
              </div>
              <span className="text-white font-medium">{runningJobs}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-yellow-400" />
                <span className="text-white/70">Pending</span>
              </div>
              <span className="text-white font-medium">{pendingJobs}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <span className="text-white/70">Failed</span>
              </div>
              <span className="text-white font-medium">{failedJobs}</span>
            </div>
          </div>
        </GlassCard>

        {/* Performance Metrics */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Performance Metrics</h3>
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/70">File Processing Rate</span>
                <span className="text-white font-medium">{processingRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <motion.div
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${processingRate}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-white/70">Job Success Rate</span>
                <span className="text-white font-medium">{successRate.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <motion.div
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${successRate}%` }}
                  transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
                />
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-white/60">Total Files</p>
                  <p className="text-xl font-bold text-white">{totalFiles.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-white/60">Failed Files</p>
                  <p className="text-xl font-bold text-red-400">{failedFiles.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Usage Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Embedding Models Usage */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Embedding Models Usage</h3>
          <div className="space-y-4">
            {Object.entries(modelUsage)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([model, count]) => {
                const percentage = (count / totalJobs) * 100;
                return (
                  <div key={model}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/70 text-sm truncate">{model}</span>
                      <span className="text-white font-medium text-sm">{count} jobs</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <motion.div
                        className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </GlassCard>

        {/* Tag Categories */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Popular Tags</h3>
          <div className="space-y-4">
            {Object.entries(tagUsage)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([tag, count]) => {
                const percentage = (count / totalJobs) * 100;
                return (
                  <div key={tag}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white/70 text-sm">{tag}</span>
                      <span className="text-white font-medium text-sm">{count} jobs</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-2">
                      <motion.div
                        className="h-full bg-gradient-to-r from-orange-500 to-orange-600 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </GlassCard>
      </div>

      {/* Recent Activity */}
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Recent Activity</h3>
        {recentJobs.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-white/30 mx-auto mb-4" />
            <p className="text-white/70">No recent activity in the last 7 days</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentJobs.slice(0, 5).map((job) => (
              <div key={job.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-2 h-2 rounded-full ${
                    job.status === 'completed' ? 'bg-green-400' :
                    job.status === 'failed' ? 'bg-red-400' :
                    job.status === 'running' ? 'bg-blue-400' :
                    'bg-yellow-400'
                  }`} />
                  <div>
                    <p className="text-white font-medium">{job.name}</p>
                    <p className="text-white/60 text-sm">{job.main_tag}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white/70 text-sm">
                    {new Date(job.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-white/60 text-xs">
                    {job.total_files || 0} files
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
};