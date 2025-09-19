// src/components/techvault/MachineryComparison.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  GitCompare,
  Copy,
  Check,
  Loader2,
  Package,
  Building2,
  MapPin,
  Calendar,
  Hash,
  AlertCircle,
  Calculator,
  TrendingUp
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { machineryApi } from '@/services/machineryApi';
import { formatDateWithRelative } from '@/utils/dateUtils';
import toast from 'react-hot-toast';

interface MachineryItem {
  id: string;
  sector: string | null;
  project_name: string | null;
  sau_number: string | null;
  description: string;
  manufacturer: string | null;
  origin: string | null;
  cost: number | null;
  cost_index: number | null;
  unit_of_measure: string | null;
  unit: string | null;
  production_year: number | null;
  last_update: string | null;
  sau_numbers: string[];
}

interface MachineryComparisonProps {
  selectedItems: string[];
  searchResults: MachineryItem[];
  onBack: () => void;
}

interface CostAnalysis {
  averageCost: number | null;
  minCost: number | null;
  maxCost: number | null;
  unit: string;
  unitOfMeasure: string;
  itemCount: number;
}

export const MachineryComparison: React.FC<MachineryComparisonProps> = ({
  selectedItems,
  searchResults,
  onBack
}) => {
  const [comparisonData, setComparisonData] = useState<MachineryItem[]>([]);
  const [llmAnalysis, setLlmAnalysis] = useState<string>('');
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [copied, setCopied] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState<string>('');
  const [streamedAnalysis, setStreamedAnalysis] = useState<string>('');
  const [costAnalyses, setCostAnalyses] = useState<Map<string, CostAnalysis>>(new Map());
  const analysisGeneratedRef = useRef(false);

  useEffect(() => {
    // Filter selected items from search results
    const selected = searchResults.filter(item => selectedItems.includes(item.id));
    setComparisonData(selected);
    
    // Calculate cost analyses
    calculateCostAnalyses(selected);
    
    // Generate LLM analysis only once
    if (selected.length > 1 && !analysisGeneratedRef.current) {
      analysisGeneratedRef.current = true;
      generateComparison(selected);
    }
  }, [selectedItems, searchResults]);

  const calculateCostAnalyses = (items: MachineryItem[]) => {
    const groupedByUnit = new Map<string, MachineryItem[]>();
    
    // Group items by unit of measure and unit combination
    items.forEach(item => {
      if (item.cost && item.unit_of_measure && item.unit) {
        const key = `${item.unit_of_measure}|${item.unit}`;
        if (!groupedByUnit.has(key)) {
          groupedByUnit.set(key, []);
        }
        groupedByUnit.get(key)?.push(item);
      }
    });

    // Calculate averages for each group
    const analyses = new Map<string, CostAnalysis>();
    groupedByUnit.forEach((groupItems, key) => {
      const [unitOfMeasure, unit] = key.split('|');
      const costs = groupItems.map(item => item.cost!).filter(cost => cost !== null);
      
      if (costs.length > 0) {
        const average = costs.reduce((sum, cost) => sum + cost, 0) / costs.length;
        const min = Math.min(...costs);
        const max = Math.max(...costs);
        
        analyses.set(key, {
          averageCost: average,
          minCost: min,
          maxCost: max,
          unit,
          unitOfMeasure,
          itemCount: costs.length
        });
      }
    });

    setCostAnalyses(analyses);
  };

  const generateComparison = async (items: MachineryItem[]) => {
    if (isLoadingAnalysis) return; // Prevent multiple calls
    
    setIsLoadingAnalysis(true);
    setStreamedAnalysis('');
    setAnalysisStatus('Analyzing machinery specifications...');
    
    try {
      const statusMessages = [
        'Gathering machine specifications...',
        'Analyzing equipment applications...',
        'Evaluating manufacturer reputation...',
        'Generating insights...'
      ];
      
      for (let i = 0; i < statusMessages.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 600));
        setAnalysisStatus(statusMessages[i]);
      }
      
      const response = await machineryApi.compareEquipment({
        machinery_items: items.map(item => ({
          id: item.id,
          description: item.description,
          manufacturer: item.manufacturer,
          origin: item.origin,
          cost: item.cost,
          sector: item.sector,
          production_year: item.production_year
        }))
      });
      
      const analysisText = response.analysis || 'Analysis not available';
      setLlmAnalysis(analysisText);
      setAnalysisStatus('Analysis complete');
      
      // Simulate streaming effect
      let index = 0;
      const streamInterval = setInterval(() => {
        if (index < analysisText.length) {
          setStreamedAnalysis(analysisText.substring(0, index + 15));
          index += 15;
        } else {
          setStreamedAnalysis(analysisText);
          clearInterval(streamInterval);
        }
      }, 20);
      
    } catch (error) {
      console.error('Failed to generate comparison:', error);
      toast.error('Failed to generate comparison analysis');
      setAnalysisStatus('Analysis failed');
      setLlmAnalysis('Unable to generate analysis at this time.');
      setStreamedAnalysis('Unable to generate analysis at this time.');
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  const formatCost = (cost: number | null) => {
    if (!cost) return 'N/A';
    return cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const copyComparison = async () => {
    const comparisonText = generateComparisonText();
    try {
      await navigator.clipboard.writeText(comparisonText);
      setCopied(true);
      toast.success('Comparison copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy comparison');
    }
  };

  const generateComparisonText = () => {
    let text = 'MACHINERY COMPARISON\n';
    text += '='.repeat(80) + '\n\n';
    
    // Add cost analysis summary
    if (costAnalyses.size > 0) {
      text += 'COST ANALYSIS\n';
      text += '-'.repeat(40) + '\n';
      costAnalyses.forEach((analysis) => {
        text += `Unit: ${analysis.unitOfMeasure} (${analysis.unit})\n`;
        text += `  Average Cost: SAR ${formatCost(analysis.averageCost)}\n`;
        text += `  Range: SAR ${formatCost(analysis.minCost)} - SAR ${formatCost(analysis.maxCost)}\n`;
        text += `  Items: ${analysis.itemCount}\n\n`;
      });
    }
    
    // Add table data
    const fields = [
      { key: 'description', label: 'Description' },
      { key: 'manufacturer', label: 'Manufacturer' },
      { key: 'origin', label: 'Origin' },
      { key: 'sector', label: 'Sector' },
      { key: 'cost', label: 'Cost (SAR)' },
      { key: 'production_year', label: 'Production Year' },
      { key: 'unit_of_measure', label: 'Unit of Measure' },
      { key: 'unit', label: 'Unit' },
      { key: 'sau_number', label: 'SAU Number' },
      { key: 'last_update', label: 'Last Update' }
    ];

    fields.forEach(field => {
      text += `${field.label}:\n`;
      comparisonData.forEach((item, idx) => {
        let value: any;
        if (field.key === 'cost' && item.cost) {
          value = formatCost(item.cost);
        } else if (field.key === 'last_update' && item.last_update) {
          value = formatDateWithRelative(item.last_update);
        } else {
          value = item[field.key as keyof MachineryItem] || 'N/A';
        }
        text += `  Machine ${idx + 1}: ${value}\n`;
      });
      text += '\n';
    });

    if (streamedAnalysis) {
      text += '\nAI ANALYSIS\n';
      text += '-'.repeat(40) + '\n';
      text += streamedAnalysis + '\n';
    }

    return text;
  };

  const formatAnalysisContent = (content: string): React.ReactNode => {
    if (!content) return null;

    const lines = content.split('\n');
    return lines.map((line, idx) => {
      if (!line.trim()) return null;
      
      const isHeader = /^\d+\./.test(line) || /^[A-Z\s]+:?$/.test(line.trim());
      const isBullet = /^[•\-\*]/.test(line.trim());
      
      if (isHeader) {
        return (
          <h4 key={idx} className="text-white font-semibold mt-4 mb-2">
            {line}
          </h4>
        );
      } else if (isBullet) {
        return (
          <li key={idx} className="text-white/80 ml-4 mb-1 list-disc">
            {line.replace(/^[•\-\*]\s*/, '')}
          </li>
        );
      } else {
        return (
          <p key={idx} className="text-white/80 mb-2">
            {line}
          </p>
        );
      }
    }).filter(Boolean);
  };

  if (comparisonData.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center">
            <GitCompare className="h-6 w-6 mr-3 text-yellow-400" />
            Machinery Comparison
          </h2>
          <p className="text-white/70">
            Comparing {comparisonData.length} similar machines
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            variant="glass"
            onClick={onBack}
          >
            Back to Results
          </Button>
        </div>
      </div>

      {/* Cost Analysis Summary */}
      {costAnalyses.size > 0 && (
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
            <Calculator className="h-5 w-5 mr-2 text-green-400" />
            Cost Analysis Summary
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from(costAnalyses.entries()).map(([key, analysis]) => (
              <div key={key} className="bg-black/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-white font-medium">
                    {analysis.unitOfMeasure} ({analysis.unit})
                  </h4>
                  <span className="text-white/50 text-xs">
                    {analysis.itemCount} item{analysis.itemCount > 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Average Cost:</span>
                    <span className="text-green-400 font-medium flex items-center">
                      <img
                        src="/sar.png"
                        alt="SAR"
                        className="h-3.5 w-3.5 mr-1 object-contain"
                        style={{ filter: 'brightness(0) saturate(100%) invert(68%) sepia(97%) saturate(381%) hue-rotate(81deg) brightness(104%) contrast(91%)' }}
                      />
                      {formatCost(analysis.averageCost)}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-white/70 text-sm">Range:</span>
                    <span className="text-white/80 text-sm">
                      SAR {formatCost(analysis.minCost)} - {formatCost(analysis.maxCost)}
                    </span>
                  </div>
                  
                  {analysis.maxCost && analysis.minCost && analysis.maxCost !== analysis.minCost && (
                    <div className="mt-2">
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-green-400 to-yellow-400"
                          style={{
                            width: `${((analysis.averageCost! - analysis.minCost) / (analysis.maxCost - analysis.minCost)) * 100}%`
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          {/* Note for different units */}
          {costAnalyses.size > 1 && (
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-300 text-xs flex items-start">
                <TrendingUp className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                Multiple unit combinations detected. Average costs are calculated separately for each unit type to ensure accurate comparisons.
              </p>
            </div>
          )}
        </GlassCard>
      )}

      {/* Comparison Table */}
      <GlassCard className="p-6 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/20">
              <th className="text-left py-3 px-4 text-white/70 text-sm font-medium">Attribute</th>
              {comparisonData.map((item, idx) => (
                <th key={item.id} className="text-left py-3 px-4 text-white text-sm font-medium">
                  Machine {idx + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Description */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">Description</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm font-medium">
                  {item.description}
                </td>
              ))}
            </tr>

            {/* Project Name */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">Project</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm">
                  {item.project_name || 'N/A'}
                </td>
              ))}
            </tr>

            {/* Manufacturer */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">Manufacturer</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm">
                  <span className="flex items-center">
                    {item.manufacturer && <Building2 className="h-3 w-3 mr-1" />}
                    {item.manufacturer || 'N/A'}
                  </span>
                </td>
              ))}
            </tr>

            {/* Origin */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">Origin</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm">
                  <span className="flex items-center">
                    {item.origin && <MapPin className="h-3 w-3 mr-1" />}
                    {item.origin || 'N/A'}
                  </span>
                </td>
              ))}
            </tr>

            {/* Sector */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">Sector</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm">
                  {item.sector || 'N/A'}
                </td>
              ))}
            </tr>

            {/* Cost */}
            <tr className="border-b border-white/10 bg-green-500/5">
              <td className="py-3 px-4 text-white/70 text-sm">Cost</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-green-400 text-sm font-medium">
                  {item.cost ? (
                    <span className="flex items-center">
                      <img
                        src="/sar.png"
                        alt="SAR"
                        className="h-4 w-4 mr-1 object-contain"
                        style={{ filter: 'brightness(0) saturate(100%) invert(68%) sepia(97%) saturate(381%) hue-rotate(81deg) brightness(104%) contrast(91%)' }}
                      />
                      {formatCost(item.cost)}
                    </span>
                  ) : 'N/A'}
                </td>
              ))}
            </tr>

            {/* Cost Index */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">Cost Index</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm">
                  {item.cost_index || 'N/A'}
                </td>
              ))}
            </tr>

            {/* Production Year */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">Production Year</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm">
                  {item.production_year || 'N/A'}
                </td>
              ))}
            </tr>

            {/* Unit of Measure */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">Unit of Measure</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm">
                  {item.unit_of_measure || 'N/A'}
                </td>
              ))}
            </tr>

            {/* Unit */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">Unit</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm">
                  {item.unit || 'N/A'}
                </td>
              ))}
            </tr>

            {/* SAU Number */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">SAU Number</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm">
                  {item.sau_number ? (
                    <span className="inline-flex items-center px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs rounded">
                      <Hash className="h-3 w-3 mr-1" />
                      {item.sau_number}
                    </span>
                  ) : 'N/A'}
                </td>
              ))}
            </tr>

            {/* Last Update */}
            <tr className="border-b border-white/10">
              <td className="py-3 px-4 text-white/70 text-sm">Last Update</td>
              {comparisonData.map(item => (
                <td key={item.id} className="py-3 px-4 text-white text-sm">
                  {item.last_update ? (
                    <span className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      {formatDateWithRelative(item.last_update)}
                    </span>
                  ) : 'N/A'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </GlassCard>

      {/* LLM Analysis */}
      <GlassCard className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
          <Package className="h-5 w-5 mr-2 text-yellow-400" />
          Allemny Analysis
        </h3>
        
        {isLoadingAnalysis ? (
          <div className="space-y-4">
            <div className="flex items-center py-4">
              <Loader2 className="h-6 w-6 text-white animate-spin mr-3" />
              <span className="text-white/70">{analysisStatus}</span>
            </div>
          </div>
        ) : streamedAnalysis ? (
          <div className="space-y-4">
            <div className="bg-black/30 rounded-lg p-4">
              <div className="text-sm leading-relaxed">
                {formatAnalysisContent(streamedAnalysis)}
              </div>
            </div>
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-300 text-xs flex items-start">
                <AlertCircle className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                This analysis is AI-generated based on the equipment descriptions and specifications. 
                Always verify with manufacturer documentation for critical decisions.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-white/50">Analysis unavailable</p>
        )}
      </GlassCard>
    </motion.div>
  );
};