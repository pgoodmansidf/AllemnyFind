import React from 'react';
import { motion } from 'framer-motion';
import { 
  DocumentTextIcon, 
  ServerIcon, 
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { KnowledgeScopeData } from '../../services/knowledgeScopeService';

interface MetricsCardsProps {
  data: KnowledgeScopeData;
  isAdmin: boolean;
}

const MetricsCards: React.FC<MetricsCardsProps> = ({ data, isAdmin }) => {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const cards = [
    {
      title: 'Total Documents',
      value: formatNumber(data.volume_metrics.total_documents),
      subtitle: `${data.document_coverage.length} types`,
      icon: DocumentTextIcon,
      color: 'blue',
      change: null,
      adminOnly: false
    },
    {
      title: 'Storage Usage',
      value: data.volume_metrics.total_size_gb.toFixed(2) + ' GB',
      subtitle: `${data.volume_metrics.storage_utilization_percentage.toFixed(1)}% utilized`,
      icon: ServerIcon,
      color: 'purple',
      change: null,
      adminOnly: false
    },
    {
      title: 'Search Performance',
      value: data.search_metrics.success_rate.toFixed(1) + '%',
      subtitle: `${formatNumber(data.search_metrics.total_searches)} searches`,
      icon: MagnifyingGlassIcon,
      color: 'green',
      change: data.search_metrics.success_rate > 90 ? 'positive' : 'negative',
      adminOnly: false
    },
    {
      title: 'Processing Success',
      value: data.quality_metrics.processing_success_rate.toFixed(1) + '%',
      subtitle: `${data.quality_metrics.error_rate.toFixed(1)}% error rate`,
      icon: ShieldCheckIcon,
      color: 'yellow',
      change: data.quality_metrics.processing_success_rate > 95 ? 'positive' : 'negative',
      adminOnly: true
    },
    {
      title: 'Topic Coverage',
      value: data.coverage_metrics.topic_breadth,
      subtitle: 'unique topics',
      icon: ChartBarIcon,
      color: 'indigo',
      change: null,
      adminOnly: false
    },
    {
      title: 'Avg Response Time',
      value: data.performance_metrics.average_search_latency_ms.toFixed(0) + 'ms',
      subtitle: `P95: ${data.performance_metrics.p95_search_latency_ms.toFixed(0)}ms`,
      icon: ClockIcon,
      color: 'pink',
      change: data.performance_metrics.average_search_latency_ms < 100 ? 'positive' : 'negative',
      adminOnly: true
    }
  ];

  const visibleCards = cards.filter(card => !card.adminOnly || isAdmin);

  const getColorClasses = (color: string) => {
    const colorMap = {
      blue: 'bg-blue-500/20 text-blue-400',
      purple: 'bg-purple-500/20 text-purple-400',
      green: 'bg-green-500/20 text-green-400',
      yellow: 'bg-yellow-500/20 text-yellow-400',
      indigo: 'bg-indigo-500/20 text-indigo-400',
      pink: 'bg-pink-500/20 text-pink-400'
    };
    return colorMap[color as keyof typeof colorMap] || colorMap.blue;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {visibleCards.map((card, index) => {
        const Icon = card.icon;
        return (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow border border-white/10"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm text-white/60 mb-1">{card.title}</p>
                <p className="text-3xl font-bold text-white mb-2">
                  {card.value}
                </p>
                <p className="text-sm text-white/80">{card.subtitle}</p>
              </div>
              <div className={`p-3 rounded-lg ${getColorClasses(card.color)}`}>
                <Icon className="h-6 w-6" />
              </div>
            </div>
            
            {card.change && (
              <div className="mt-4 flex items-center">
                {card.change === 'positive' ? (
                  <>
                    <CheckCircleIcon className="h-5 w-5 text-green-400 mr-2" />
                    <span className="text-sm text-green-400">Performing well</span>
                  </>
                ) : (
                  <>
                    <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mr-2" />
                    <span className="text-sm text-yellow-400">Needs attention</span>
                  </>
                )}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
};

export default MetricsCards;