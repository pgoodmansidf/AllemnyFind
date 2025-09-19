import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Activity,
  BarChart3,
  Settings,
  List,
  Database,
  FileText
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { CreateJobForm } from '@/components/ingestion/CreateJobForm';
import { ProgressDashboard } from '@/components/ingestion/ProgressDashboard';
import { JobManagement } from '@/components/ingestion/JobManagement';
import { StatisticsDashboard } from '@/components/ingestion/StatisticsDashboard';
import { SettingsPanel } from '@/components/ingestion/SettingsPanel';
import { DocumentsList } from '@/components/ingestion/DocumentsList';
import { useIngestionStore } from '@/store/ingestionStore';
import { useJobProgress } from '@/hooks/useJobProgress';

export const IngestionPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const { jobs, documents } = useIngestionStore();
  const { getActiveJobs, isConnected } = useJobProgress();

  const activeJobs = getActiveJobs();
  const recentJobs = jobs.slice(0, 5);

  const tabs = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: <Activity className="h-4 w-4" />,
      badge: activeJobs.length > 0 ? activeJobs.length : undefined,
    },
    {
      id: 'jobs',
      name: 'Jobs',
      icon: <List className="h-4 w-4" />,
      badge: jobs.length > 0 ? jobs.length : undefined,
    },
    {
      id: 'documents',
      name: 'Documents',
      icon: <FileText className="h-4 w-4" />,
      badge: documents.length > 0 ? documents.length : undefined,
    },
    {
      id: 'statistics',
      name: 'Statistics',
      icon: <BarChart3 className="h-4 w-4" />,
    },
    {
      id: 'techvault',
      name: 'TechVault',
      icon: <Settings className="h-4 w-4" />,
    },
    {
      id: 'settings',
      name: 'Settings',
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  const handleJobCreated = (jobName: string) => {
    setShowCreateForm(false);
    setActiveTab('dashboard');
  };

  const renderTabContent = () => {
    if (showCreateForm) {
      return (
        <CreateJobForm
          onSuccess={handleJobCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return <ProgressDashboard jobs={recentJobs} />;
      case 'jobs':
        return <JobManagement />;
      case 'documents':
        return <DocumentsList />;
      case 'statistics':
        return <StatisticsDashboard />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <ProgressDashboard jobs={recentJobs} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Document Ingestion</h1>
          <p className="text-white/70 mt-1">
            Process and analyze documents with AI-powered insights
          </p>
        </div>

        {/* Connection Status Indicator */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-400' : 'bg-red-400'
            }`} />
            <span className="text-white/70 text-sm">
              {isConnected ? 'Live Updates' : 'Offline'}
            </span>
          </div>

          {!showCreateForm && (
            <Button
              variant="primary"
              onClick={() => setShowCreateForm(true)}
              icon={<Plus className="h-4 w-4" />}
            >
              New Job
            </Button>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      {!showCreateForm && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <GlassCard className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary-500/20 rounded-full flex items-center justify-center">
                <Database className="h-5 w-5 text-primary-400" />
              </div>
              <div>
                <p className="text-white/70 text-sm">Total Jobs</p>
                <p className="text-xl font-bold text-white">{jobs.length}</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Activity className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-white/70 text-sm">Active Jobs</p>
                <p className="text-xl font-bold text-white">{activeJobs.length}</p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-white/70 text-sm">Completed</p>
                <p className="text-xl font-bold text-white">
                  {jobs.filter(job => job.status === 'completed').length}
                </p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                <FileText className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <p className="text-white/70 text-sm">Documents</p>
                <p className="text-xl font-bold text-white">
                  {documents.length}
                </p>
              </div>
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                <Settings className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-white/70 text-sm">Files Processed</p>
                <p className="text-xl font-bold text-white">
                  {jobs.reduce((sum, job) => sum + (job.processed_files || 0), 0).toLocaleString()}
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      )}

      {/* Tab Navigation */}
      {!showCreateForm && (
        <GlassCard className="p-1">
          <div className="flex space-x-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-4 py-3 rounded-lg transition-all duration-200 relative ${
                  activeTab === tab.id
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.icon}
                <span className="font-medium">{tab.name}</span>
                {tab.badge && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-primary-500/30 text-primary-400 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Tab Content */}
      <motion.div
        key={showCreateForm ? 'create-form' : activeTab}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        {renderTabContent()}
      </motion.div>

      {/* Active Jobs Notification */}
      {!showCreateForm && activeJobs.length > 0 && activeTab !== 'dashboard' && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 right-6 z-40"
        >
          <GlassCard className="p-4 max-w-sm">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Activity className="h-4 w-4 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-white font-medium text-sm">
                  {activeJobs.length} job{activeJobs.length !== 1 ? 's' : ''} processing
                </p>
                <p className="text-white/70 text-xs">
                  Click Dashboard to monitor progress
                </p>
              </div>
              <Button
                variant="glass"
                size="sm"
                onClick={() => setActiveTab('dashboard')}
              >
                View
              </Button>
            </div>
          </GlassCard>
        </motion.div>
      )}
    </div>
  );
};