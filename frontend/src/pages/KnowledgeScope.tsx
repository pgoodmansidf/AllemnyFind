// src/pages/KnowledgeScope.tsx - UPDATED WITH STANDALONE SIDEBAR
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ChartBarIcon, 
  DocumentTextIcon, 
  SparklesIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon,
  CpuChipIcon,
  ClockIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { PageLayout } from '@/components/layout/PageLayout';
import DocumentCoverage from '../components/knowledgescope/DocumentCoverage';
import ContentIntelligence from '../components/knowledgescope/ContentIntelligence';
import MetricsCards from '../components/knowledgescope/MetricsCards';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { knowledgeScopeService, KnowledgeScopeData } from '../services/knowledgeScopeService';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';

export const KnowledgeScope: React.FC = () => {
  const { user } = useAuthStore();
  const [analyticsData, setAnalyticsData] = useState<KnowledgeScopeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'coverage' | 'intelligence' | 'search' | 'quality'>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const isAdmin = user?.is_superuser || false;

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await knowledgeScopeService.getCompleteAnalytics();
      setAnalyticsData(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching analytics data:', err);
      setError('Failed to load analytics data. Please try again later.');
      toast.error('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAnalyticsData();
    setRefreshing(false);
    toast.success('Analytics data refreshed');
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: ChartBarIcon },
    { id: 'coverage', label: 'Knowledge Spread', icon: DocumentTextIcon },
    { id: 'intelligence', label: 'Content Intelligence', icon: SparklesIcon },
    { id: 'search', label: 'Search Analytics', icon: MagnifyingGlassIcon },
    { id: 'quality', label: 'Quality Metrics', icon: ExclamationTriangleIcon },
  ];

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center h-screen">
          <LoadingSpinner size="large" text="Loading analytics data..." />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center h-screen">
          <ExclamationTriangleIcon className="h-16 w-16 text-red-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Error Loading Analytics</h2>
          <p className="text-white/80 mb-4">{error}</p>
          <button
            onClick={fetchAnalyticsData}
            className="px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-lg hover:bg-white/30 transition-colors"
          >
            Retry
          </button>
        </div>
      </PageLayout>
    );
  }

  if (!analyticsData) {
    return null;
  }

  return (
    <PageLayout>
      <div className="flex-1 relative z-10">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-sm border-b border-white/10 mt-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center space-x-4">
                <motion.div
                  initial={{ rotate: 0 }}
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="p-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg"
                >
                  <CpuChipIcon className="h-6 w-6 text-white" />
                </motion.div>
                <div>
                  <h1 className="text-2xl font-bold text-white">KnowledgeScope</h1>
                  <p className="text-sm text-white/80">
                    Knowledge Base Analytics & Insights
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex items-center text-sm text-white/80 bg-white/10 backdrop-blur-sm px-3 py-2 rounded-lg">
                  <ClockIcon className="h-4 w-4 mr-1" />
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </div>
                <button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className={`p-2 rounded-lg transition-all ${
                    refreshing 
                      ? 'bg-white/10 cursor-not-allowed' 
                      : 'bg-white/10 backdrop-blur-sm hover:bg-white/20'
                  }`}
                >
                  <ArrowPathIcon className={`h-5 w-5 text-white ${refreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white/5 backdrop-blur-sm border-b border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex space-x-8 py-2" aria-label="Tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`
                      flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all
                      ${activeTab === tab.id
                        ? 'bg-white/20 text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                      }
                    `}
                  >
                    <Icon className="h-5 w-5 mr-2" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Metrics Cards */}
                <MetricsCards data={analyticsData} isAdmin={isAdmin} />

                {/* Knowledge Gaps Alert */}
                {analyticsData.knowledge_gaps.length > 0 && (
                  <div className="bg-yellow-500/10 backdrop-blur-sm border border-yellow-400/30 rounded-lg p-6">
                    <div className="flex items-start">
                      <ExclamationTriangleIcon className="h-6 w-6 text-yellow-400 mt-1 mr-3" />
                      <div>
                        <h3 className="text-lg font-semibold text-yellow-300 mb-2">
                          Knowledge Gaps Detected
                        </h3>
                        <div className="space-y-2">
                          {analyticsData.knowledge_gaps.slice(0, 3).map((gap, index) => (
                            <div key={index} className="flex items-start">
                              <span className={`inline-block w-2 h-2 rounded-full mt-1.5 mr-2 ${
                                gap.severity === 'high' ? 'bg-red-500' :
                                gap.severity === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                              }`} />
                              <div className="flex-1">
                                <p className="text-sm text-white/90">{gap.description}</p>
                                <p className="text-xs text-white/60 mt-1">
                                  Recommendation: {gap.recommended_action}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <DocumentCoverage 
                    data={analyticsData} 
                    compact={true}
                  />
                  <ContentIntelligence 
                    data={analyticsData} 
                    compact={true}
                  />
                </div>
              </div>
            )}

            {activeTab === 'coverage' && (
              <DocumentCoverage 
                data={analyticsData} 
                compact={false}
              />
            )}

            {activeTab === 'intelligence' && (
              <ContentIntelligence 
                data={analyticsData} 
                compact={false}
              />
            )}

            {activeTab === 'search' && (
              <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-white mb-6">Search Analytics</h2>
                <p className="text-white/80">
                  Search analytics will be implemented in Section 3
                </p>
              </div>
            )}

            {activeTab === 'quality' && (
              <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-bold text-white mb-6">Quality Metrics</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                    <p className="text-sm text-white/60">Extraction Accuracy</p>
                    <p className="text-2xl font-bold text-white">
                      {analyticsData.quality_metrics.extraction_accuracy.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                    <p className="text-sm text-white/60">Duplicate Documents</p>
                    <p className="text-2xl font-bold text-white">
                      {analyticsData.quality_metrics.duplicate_count}
                    </p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                    <p className="text-sm text-white/60">Processing Success Rate</p>
                    <p className="text-2xl font-bold text-white">
                      {analyticsData.quality_metrics.processing_success_rate.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </PageLayout>
  );
};

export default KnowledgeScope;