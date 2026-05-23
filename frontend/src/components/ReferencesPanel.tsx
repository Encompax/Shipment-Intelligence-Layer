import React, { useState, useEffect } from 'react';

interface Reference {
  id: string;
  title: string;
  source: 'uploaded_document' | 'external_link' | 'user_note';
  content: string;
  category: string;
  tags: string[];
  relevanceScore: number;
  linkedReferences: string[];
  uploadedDate: string;
}

interface ReferenceCluster {
  category: string;
  references: Reference[];
}

const ReferencesPanel: React.FC = () => {
  const [references, setReferences] = useState<Reference[]>([]);
  const [clusters, setClusters] = useState<ReferenceCluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadReferences();
  }, []);

  const loadReferences = async () => {
    setLoading(true);
    try {
      // TODO: Connect to document upload storage and parse uploaded PDFs/docs
      // Extract key information, organize into clusters
      // Use ML/NLP to calculate relevance scores and relationships

      const mockReferences: Reference[] = [
        {
          id: '1',
          title: 'Product Specifications - Reagent Line A',
          source: 'uploaded_document',
          content: 'High-purity reagents for genomic analysis. Lot: RA-2024-001. Contains: DNA extraction buffer, proteinase K, ...',
          category: 'Product Specifications',
          tags: ['Reagents', 'Genomics', 'High-Purity'],
          relevanceScore: 0.95,
          linkedReferences: ['2', '5'],
          uploadedDate: '2026-02-15',
        },
        {
          id: '2',
          title: 'Quality Assurance Report - Q1 2026',
          source: 'uploaded_document',
          content: 'QA testing results for assay kits. Pass rate: 99.2%. All reagent batches meet specification requirements...',
          category: 'Quality Control',
          tags: ['QA', 'Compliance', 'Assays'],
          relevanceScore: 0.89,
          linkedReferences: ['1', '4'],
          uploadedDate: '2026-03-01',
        },
        {
          id: '3',
          title: 'Regulatory Documentation - FDA 510k',
          source: 'uploaded_document',
          content: 'FDA submission for Array Platform v2.0. Includes validation data, risk analysis, clinical trial results...',
          category: 'Regulatory',
          tags: ['Arrays', 'FDA', 'Regulatory'],
          relevanceScore: 0.92,
          linkedReferences: ['6'],
          uploadedDate: '2026-01-20',
        },
        {
          id: '4',
          title: 'Competitive Analysis - Market Report',
          source: 'uploaded_document',
          content: 'Analysis of competitor assay offerings. Market size: $4.2B. Growth rate: 12% CAGR...',
          category: 'Market Intelligence',
          tags: ['Assays', 'Competitive', 'Market'],
          relevanceScore: 0.82,
          linkedReferences: ['2'],
          uploadedDate: '2026-02-28',
        },
        {
          id: '5',
          title: 'Customer Case Study - Hospital Lab Integration',
          source: 'uploaded_document',
          content: 'Implementation of Reagent Line A in large hospital network. ROI: 34% in year 1. Workflow improvement: 28% faster processing...',
          category: 'Customer Profiles',
          tags: ['Reagents', 'Hospital', 'ROI'],
          relevanceScore: 0.87,
          linkedReferences: ['1'],
          uploadedDate: '2026-01-10',
        },
        {
          id: '6',
          title: 'Clinical Trial Results - Arrays Study',
          source: 'uploaded_document',
          content: 'Multi-center clinical trial for Array Platform. Sensitivity: 96.5%, Specificity: 97.2%. N=500 samples...',
          category: 'Clinical Evidence',
          tags: ['Arrays', 'Clinical', 'Evidence'],
          relevanceScore: 0.94,
          linkedReferences: ['3'],
          uploadedDate: '2026-02-01',
        },
        {
          id: '7',
          title: 'Assembly Work Instructions - Array Platform Setup',
          source: 'uploaded_document',
          content: 'Step-by-step assembly instructions for Array Platform reagent kits. Includes quality checkpoints, sterility protocols, and storage requirements...',
          category: 'Work Instructions',
          tags: ['Assembly', 'Array', 'QA-Points'],
          relevanceScore: 0.93,
          linkedReferences: ['1', '8'],
          uploadedDate: '2026-02-20',
        },
        {
          id: '8',
          title: 'Environmental Health & Safety Manual',
          source: 'uploaded_document',
          content: 'Complete EHS compliance documentation. Includes OSHA requirements, hazmat handling, spill procedures, PPE requirements, and incident reporting...',
          category: 'EHS',
          tags: ['Safety', 'Compliance', 'Hazmat'],
          relevanceScore: 0.91,
          linkedReferences: ['3', '7'],
          uploadedDate: '2026-01-15',
        },
        {
          id: '9',
          title: 'FG Product Profile - Genomic Assay Kit v3.2',
          source: 'uploaded_document',
          content: 'Finished goods product profile. SKU: GA-K032-001. Shelf life: 24 months at 2-8°C. Contains 100 reactions per kit. GLP certified...',
          category: 'FG Product Profiles',
          tags: ['Finished-Goods', 'Kits', 'Certified'],
          relevanceScore: 0.88,
          linkedReferences: ['1', '2'],
          uploadedDate: '2026-02-10',
        },
        {
          id: '10',
          title: 'Customer Profile - Genomics Research Institute',
          source: 'uploaded_document',
          content: 'Key customer profile. Annual volume: 50,000 reactions. Primary use: genomic research. Contract value: $2.3M. Account manager: Sarah Chen...',
          category: 'Customer Profiles',
          tags: ['Research', 'Volume', 'Strategic'],
          relevanceScore: 0.85,
          linkedReferences: ['5', '9'],
          uploadedDate: '2026-02-05',
        },
        {
          id: '11',
          title: 'In-Process Quality Control SOP',
          source: 'uploaded_document',
          content: 'Standard operating procedure for in-process QC testing. Includes sampling protocols, acceptance criteria, and documentation requirements...',
          category: 'Quality Control',
          tags: ['SOP', 'Testing', 'Procedures'],
          relevanceScore: 0.90,
          linkedReferences: ['2', '7'],
          uploadedDate: '2026-02-25',
        },
        {
          id: '12',
          title: 'Workplace Safety Update - Q1 2026',
          source: 'uploaded_document',
          content: 'Quarterly EHS safety briefing. Zero incidents this quarter. Training completion: 100%. Updated evacuation procedures effective March 2026...',
          category: 'EHS',
          tags: ['Safety', 'Training', 'Procedures'],
          relevanceScore: 0.83,
          linkedReferences: ['8'],
          uploadedDate: '2026-03-10',
        },
      ];

      setReferences(mockReferences);

      // Organize into clusters by category
      const categoryClusters = mockReferences.reduce((acc, ref) => {
        const existing = acc.find((c) => c.category === ref.category);
        if (existing) {
          existing.references.push(ref);
        } else {
          acc.push({ category: ref.category, references: [ref] });
        }
        return acc;
      }, [] as ReferenceCluster[]);

      setClusters(categoryClusters);
    } catch (err: any) {
      console.error('Failed to load references:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredReferences = references.filter((ref) => {
    const matchesSearch = ref.title.toLowerCase().includes(searchTerm.toLowerCase()) || ref.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = !selectedCategory || ref.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const relevanceGroups = [
    { label: 'Highly Relevant', min: 0.9, color: '#c8e6c9' },
    { label: 'Relevant', min: 0.75, color: '#fff9c4' },
    { label: 'Somewhat Relevant', min: 0, color: '#ffe0b2' },
  ];

  return (
    <section style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2>References & Document Dashboard</h2>

      {/* Search and Filter */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search references by title or tag..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: 1, minWidth: '250px', padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
        />
        <button onClick={loadReferences} style={{ padding: '10px 20px', backgroundColor: '#0078d4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      {/* Category Filter */}
      <div style={{ marginBottom: '20px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          onClick={() => setSelectedCategory(null)}
          style={{
            padding: '8px 12px',
            border: selectedCategory === null ? '2px solid #0078d4' : '1px solid #ddd',
            backgroundColor: selectedCategory === null ? '#e3f2fd' : 'transparent',
            borderRadius: '20px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          All Categories
        </button>
        {clusters.map((cluster) => (
          <button
            key={cluster.category}
            onClick={() => setSelectedCategory(cluster.category === selectedCategory ? null : cluster.category)}
            style={{
              padding: '8px 12px',
              border: selectedCategory === cluster.category ? '2px solid #0078d4' : '1px solid #ddd',
              backgroundColor: selectedCategory === cluster.category ? '#e3f2fd' : 'transparent',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            {cluster.category} ({cluster.references.length})
          </button>
        ))}
      </div>

      {/* References by Relevance */}
      {loading && <div>Loading...</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto', flex: 1 }}>
        {relevanceGroups.map((group) => {
          const groupReferences = filteredReferences.filter((r) => r.relevanceScore >= group.min && r.relevanceScore < (relevanceGroups[relevanceGroups.indexOf(group) - 1]?.min || 1));

          if (groupReferences.length === 0) return null;

          return (
            <div key={group.label}>
              <h3 style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>{group.label}</h3>

              {groupReferences.map((ref) => (
                <div
                  key={ref.id}
                  style={{
                    padding: '15px',
                    backgroundColor: group.color,
                    borderLeft: `4px solid ${group.color === '#c8e6c9' ? '#2e7d32' : group.color === '#fff9c4' ? '#f57f17' : '#e65100'}`,
                    borderRadius: '4px',
                    marginBottom: '10px',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)')}
                  onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                    <h4 style={{ margin: '0', fontSize: '14px', fontWeight: 'bold' }}>{ref.title}</h4>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#666' }}>Relevance: {(ref.relevanceScore * 100).toFixed(0)}%</div>
                  </div>

                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>{ref.content}</div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {ref.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          padding: '3px 8px',
                          backgroundColor: 'rgba(0,0,0,0.1)',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div style={{ fontSize: '11px', color: '#999', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Uploaded: {new Date(ref.uploadedDate).toLocaleDateString()}</span>
                    {ref.linkedReferences.length > 0 && <span>Related: {ref.linkedReferences.length} items</span>}
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {filteredReferences.length === 0 && <div style={{ color: '#999', textAlign: 'center', padding: '20px' }}>No references found</div>}
      </div>
    </section>
  );
};

export default ReferencesPanel;
