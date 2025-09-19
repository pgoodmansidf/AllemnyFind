import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DocumentTextIcon, FolderOpenIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { KnowledgeScopeData } from '../../services/knowledgeScopeService';

interface DocumentCoverageProps {
  data: KnowledgeScopeData;
  compact?: boolean;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

const DocumentCoverage: React.FC<DocumentCoverageProps> = ({ data, compact = false }) => {
  // Main tags distribution (Knowledge Spread)
  const knowledgeSpreadData = useMemo(() => {
    return data.knowledge_spread || data.document_coverage.map((item, index) => ({
      name: item.main_tag || item.file_type.toUpperCase(),
      value: item.count,
      percentage: item.percentage,
      size: item.total_size_mb
    }));
  }, [data]);

  // File formats distribution
  const fileFormatsData = useMemo(() => {
    return data.document_coverage.map((item) => ({
      name: item.file_type.toUpperCase(),
      value: item.count,
      percentage: item.percentage,
      size: item.total_size_mb
    }));
  }, [data.document_coverage]);

  const temporalData = useMemo(() => {
    return data.temporal_coverage.slice(-30).map(item => ({
      date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: item.document_count,
      cumulative: item.cumulative_count
    }));
  }, [data.temporal_coverage]);

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

  const PieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-black/40 backdrop-blur-sm p-3 rounded-lg shadow-lg border border-white/20">
          <p className="text-sm font-semibold text-white">{data.name}</p>
          <p className="text-sm text-white/80">Count: {data.value}</p>
          <p className="text-sm text-white/80">Percentage: {data.payload.percentage.toFixed(1)}%</p>
          <p className="text-sm text-white/80">Size: {data.payload.size.toFixed(2)} MB</p>
        </div>
      );
    }
    return null;
  };

  if (compact) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6">
        <div className="flex items-center mb-4">
          <DocumentTextIcon className="h-6 w-6 text-blue-400 mr-2" />
          <h3 className="text-lg font-semibold text-white">Knowledge Spread</h3>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={knowledgeSpreadData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {knowledgeSpreadData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {knowledgeSpreadData.slice(0, 4).map((item, index) => (
            <div key={index} className="flex items-center">
              <div 
                className="w-3 h-3 rounded-full mr-2" 
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-sm text-white/80">
                {item.name}: {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Knowledge Spread (Main Tags) */}
      <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <FolderOpenIcon className="h-6 w-6 text-blue-400 mr-2" />
            <h2 className="text-xl font-bold text-white">Knowledge Spread</h2>
          </div>
          <div className="text-sm text-white/60">
            Total: {data.volume_metrics.total_documents} documents
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={knowledgeSpreadData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={120}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                  labelStyle={{ fill: 'white', fontSize: 12 }}
                >
                  {knowledgeSpreadData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart */}
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={knowledgeSpreadData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" />
                <YAxis stroke="rgba(255,255,255,0.6)" />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" fill="#3B82F6" radius={[8, 8, 0, 0]}>
                  {knowledgeSpreadData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Knowledge Categories Table */}
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead>
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                  Count
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                  Percentage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                  Total Size
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {knowledgeSpreadData.map((item, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                    <div className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2" 
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      {item.name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white/80">
                    {item.value}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white/80">
                    {item.percentage.toFixed(1)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-white/80">
                    {item.size.toFixed(2)} MB
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Document Formats Section */}
      <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6">
        <div className="flex items-center mb-6">
          <DocumentTextIcon className="h-6 w-6 text-green-400 mr-2" />
          <h2 className="text-xl font-bold text-white">Document Formats</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {fileFormatsData.map((format, index) => (
            <div key={index} className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">{format.name}</span>
                <div 
                  className="w-2 h-2 rounded-full" 
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
              </div>
              <p className="text-2xl font-bold text-white">{format.value}</p>
              <p className="text-xs text-white/60">{format.percentage.toFixed(1)}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* Temporal Coverage */}
      <div className="bg-white/10 backdrop-blur-sm rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <CalendarIcon className="h-6 w-6 text-green-400 mr-2" />
            <h2 className="text-xl font-bold text-white">Temporal Coverage</h2>
          </div>
          <div className="text-sm text-white/60">
            Last 30 days
          </div>
        </div>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={temporalData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="date" 
                stroke="rgba(255,255,255,0.6)"
                angle={-45}
                textAnchor="end"
                height={70}
              />
              <YAxis stroke="rgba(255,255,255,0.6)" />
              <Tooltip content={<CustomTooltip />} />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="#10B981" 
                strokeWidth={2}
                dot={{ fill: '#10B981', r: 4 }}
                activeDot={{ r: 6 }}
                name="Daily Documents"
              />
              <Line 
                type="monotone" 
                dataKey="cumulative" 
                stroke="#3B82F6" 
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ fill: '#3B82F6', r: 3 }}
                name="Cumulative Total"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Temporal Stats */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <p className="text-sm text-white/60">Temporal Range</p>
            <p className="text-xl font-bold text-white">
              {data.coverage_metrics.temporal_range_days} days
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <p className="text-sm text-white/60">Earliest Document</p>
            <p className="text-xl font-bold text-white">
              {data.coverage_metrics.earliest_document_date 
                ? new Date(data.coverage_metrics.earliest_document_date).toLocaleDateString()
                : 'N/A'}
            </p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
            <p className="text-sm text-white/60">Latest Document</p>
            <p className="text-xl font-bold text-white">
              {data.coverage_metrics.latest_document_date
                ? new Date(data.coverage_metrics.latest_document_date).toLocaleDateString()
                : 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentCoverage;