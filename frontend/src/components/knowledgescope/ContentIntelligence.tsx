import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Treemap, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';
import { SparklesIcon, TagIcon, BuildingOfficeIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { KnowledgeScopeData } from '../../services/knowledgeScopeService';

interface ContentIntelligenceProps {
  data: KnowledgeScopeData;
  compact?: boolean;
}

const COLORS = ['#1E40AF', '#065F46', '#92400E', '#991B1B', '#5B21B6', '#BE185D', '#064E3B', '#C2410C'];

const ContentIntelligence: React.FC<ContentIntelligenceProps> = ({ data, compact = false }) => {
  const topicData = useMemo(() => {
    return data.topic_coverage.slice(0, 15).map(topic => ({
      name: topic.topic,
      count: topic.count,
      confidence: topic.confidence_score * 100,
      documents: topic.documents.length,
      related: topic.related_topics.length
    }));
  }, [data.topic_coverage]);

  const entityData = useMemo(() => {
    const grouped: { [key: string]: any[] } = {};
    data.entity_analytics.forEach(entity => {
      if (!grouped[entity.entity_type]) {
        grouped[entity.entity_type] = [];
      }
      grouped[entity.entity_type].push({
        name: entity.entity_name,
        count: entity.count,
        type: entity.entity_type
      });
    });
    return grouped;
  }, [data.entity_analytics]);

  const complexityData = useMemo(() => {
    return Object.entries(data.content_depth.complexity_distribution || {}).map(([key, value]) => ({
      name: key.charAt(0).toUpperCase() + key.slice(1),
      value: value
    }));
  }, [data.content_depth]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/40 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-white/20">
          <p className="text-sm font-semibold text-white">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm text-white/80">
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const TreemapContent = ({ root, depth, x, y, width, height, index, name, count }: any) => {
    const color = COLORS[index % COLORS.length];
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: color,
            stroke: '#fff',
            strokeWidth: 1,
            strokeOpacity: 0.8,
          }}
        />
        {width > 50 && height > 30 && (
          <>
            <text
              x={x + width / 2}
              y={y + height / 2 - 7}
              textAnchor="middle"
              fill="#fff"
              fontSize={12}
              fontWeight="bold"
            >
              {name}
            </text>
            <text
              x={x + width / 2}
              y={y + height / 2 + 7}
              textAnchor="middle"
              fill="#fff"
              fontSize={10}
            >
              {count}
            </text>
          </>
        )}
      </g>
    );
  };

  if (compact) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6">
        <div className="flex items-center mb-4">
          <SparklesIcon className="h-6 w-6 text-purple-400 mr-2" />
          <h3 className="text-lg font-semibold text-white">Content Intelligence</h3>
        </div>
        
        {/* Top Topics */}
        <div className="space-y-2">
          <p className="text-sm text-white/60">Top Topics</p>
          {topicData.slice(0, 5).map((topic, index) => (
            <div key={index} className="flex items-center justify-between">
              <span className="text-sm text-white/90">{topic.name}</span>
              <div className="flex items-center">
                <div className="w-20 bg-white/20 rounded-full h-2 mr-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${(topic.count / topicData[0].count) * 100}%` }}
                  />
                </div>
                <span className="text-sm text-white/60">{topic.count}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Entity Summary */}
        <div className="mt-4 pt-4 border-t border-white/20">
          <p className="text-sm text-white/60 mb-2">Entity Coverage</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="text-lg font-bold text-white">
                {entityData.company?.length || 0}
              </p>
              <p className="text-xs text-white/60">Companies</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-white">
                {entityData.sau_number?.length || 0}
              </p>
              <p className="text-xs text-white/60">Projects</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-white">
                {entityData.location?.length || 0}
              </p>
              <p className="text-xs text-white/60">Locations</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topic Coverage */}
      <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <TagIcon className="h-6 w-6 text-purple-400 mr-2" />
            <h2 className="text-xl font-bold text-white">Topic Coverage Analysis</h2>
          </div>
          <div className="text-sm text-white/60">
            {data.coverage_metrics.topic_breadth} unique topics
          </div>
        </div>

        {/* Topic Bar Chart */}
        <div className="h-80 mb-6">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topicData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="name" 
                stroke="rgba(255,255,255,0.6)"
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis stroke="rgba(255,255,255,0.6)" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Bar dataKey="count" fill="#8B5CF6" name="Document Count" radius={[8, 8, 0, 0]} />
              <Bar dataKey="confidence" fill="#EC4899" name="Confidence %" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Topic Treemap */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <Treemap
              data={topicData.map(t => ({ name: t.name, count: t.count }))}
              dataKey="count"
              aspectRatio={4 / 3}
              stroke="#fff"
              content={TreemapContent}
            />
          </ResponsiveContainer>
        </div>

        {/* Topic Details - Fixed styling */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {topicData.slice(0, 6).map((topic, index) => (
            <div key={index} className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-white">{topic.name}</h4>
                <span className="text-sm text-white/80 bg-white/20 px-2 py-1 rounded">
                  {topic.count} docs
                </span>
              </div>
              <div className="text-xs text-white/60">
                Confidence: {topic.confidence.toFixed(1)}% | Related topics: {topic.related}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Entity Analytics */}
      <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6">
        <div className="flex items-center mb-6">
          <BuildingOfficeIcon className="h-6 w-6 text-blue-400 mr-2" />
          <h2 className="text-xl font-bold text-white">Entity Analytics</h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Companies */}
          {entityData.company && (
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/10">
              <h3 className="font-semibold text-white mb-3 flex items-center">
                <BuildingOfficeIcon className="h-5 w-5 mr-2 text-blue-400" />
                Companies
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {entityData.company.slice(0, 10).map((entity, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-white/90 truncate">{entity.name}</span>
                    <span className="text-sm text-white/60 ml-2">{entity.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Projects */}
          {entityData.sau_number && (
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/10">
              <h3 className="font-semibold text-white mb-3 flex items-center">
                <TagIcon className="h-5 w-5 mr-2 text-green-400" />
                SAU Projects
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {entityData.sau_number.slice(0, 10).map((entity, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-white/90 truncate">{entity.name}</span>
                    <span className="text-sm text-white/60 ml-2">{entity.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Locations */}
          {entityData.location && (
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/10">
              <h3 className="font-semibold text-white mb-3 flex items-center">
                <MapPinIcon className="h-5 w-5 mr-2 text-red-400" />
                Locations
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {entityData.location.slice(0, 10).map((entity, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-sm text-white/90 truncate">{entity.name}</span>
                    <span className="text-sm text-white/60 ml-2">{entity.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content Depth Metrics */}
      <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6">
        <h2 className="text-xl font-bold text-white mb-6">Content Depth Analysis</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/10">
            <p className="text-sm text-white/60">Avg Document Length</p>
            <p className="text-2xl font-bold text-white">
              {Math.round(data.content_depth.average_document_length).toLocaleString()}
            </p>
            <p className="text-xs text-white/60">characters</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/10">
            <p className="text-sm text-white/60">Unique Terms</p>
            <p className="text-2xl font-bold text-white">
              {data.content_depth.total_unique_terms.toLocaleString()}
            </p>
            <p className="text-xs text-white/60">words</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/10">
            <p className="text-sm text-white/60">Vocabulary Richness</p>
            <p className="text-2xl font-bold text-white">
              {data.content_depth.vocabulary_richness.toFixed(1)}%
            </p>
            <p className="text-xs text-white/60">diversity</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/10">
            <p className="text-sm text-white/60">Entity Diversity</p>
            <p className="text-2xl font-bold text-white">
              {(data.coverage_metrics.entity_diversity_score * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-white/60">score</p>
          </div>
        </div>

        {/* Complexity Distribution */}
        {complexityData.length > 0 && (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={complexityData}>
                <PolarGrid stroke="rgba(255,255,255,0.2)" />
                <PolarAngleAxis dataKey="name" stroke="rgba(255,255,255,0.6)" />
                <PolarRadiusAxis stroke="rgba(255,255,255,0.6)" />
                <Radar name="Document Complexity" dataKey="value" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default ContentIntelligence;