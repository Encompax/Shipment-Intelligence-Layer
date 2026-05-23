import React, { useState, useEffect } from 'react';

interface MarketingCampaign {
  id: string;
  name: string;
  platform: 'LinkedIn' | 'Twitter' | 'Facebook' | 'Instagram' | 'TikTok';
  status: 'active' | 'paused' | 'completed';
  reach: number;
  engagement: number;
  cost: number;
  roi: number;
}

interface DemographicInsight {
  segment: string;
  platform: string;
  reachPotential: number;
  productFit: 'Assays' | 'Arrays' | 'Reagents';
  estimatedCost: number;
  recommendation: string;
}

const MarketingInsightsPanel: React.FC = () => {
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [insights, setInsights] = useState<DemographicInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<'Assays' | 'Arrays' | 'Reagents'>('Assays');
  const [activeTab, setActiveTab] = useState<'campaigns' | 'insights'>('campaigns');

  useEffect(() => {
    loadMarketingData();
  }, []);

  const loadMarketingData = async () => {
    setLoading(true);
    try {
      // TODO: Connect to social media APIs (Meta, LinkedIn, Twitter/X, TikTok)
      // and analytics platforms (GA4, Sprout Social, etc.)
      
      const mockCampaigns: MarketingCampaign[] = [
        {
          id: '1',
          name: 'Lab Professionals - LinkedIn Campaign',
          platform: 'LinkedIn',
          status: 'active',
          reach: 145000,
          engagement: 8.2,
          cost: 3500,
          roi: 2.8,
        },
        {
          id: '2',
          name: 'Biotech Startups - Instagram Ads',
          platform: 'Instagram',
          status: 'active',
          reach: 89000,
          engagement: 5.4,
          cost: 2100,
          roi: 1.9,
        },
        {
          id: '3',
          name: 'Clinical Labs - Facebook Retargeting',
          platform: 'Facebook',
          status: 'completed',
          reach: 234000,
          engagement: 3.1,
          cost: 5200,
          roi: 3.2,
        },
      ];

      const mockInsights: DemographicInsight[] = [
        {
          segment: 'Biotech Researchers (18-35)',
          platform: 'TikTok',
          reachPotential: 450000,
          productFit: 'Arrays',
          estimatedCost: 6000,
          recommendation: 'High engagement potential. Create educational content series.',
        },
        {
          segment: 'Laboratory Managers (35-55)',
          platform: 'LinkedIn',
          reachPotential: 230000,
          productFit: 'Reagents',
          estimatedCost: 4500,
          recommendation: 'Strong ROI expected. Focus on cost-benefit and compliance.',
        },
        {
          segment: 'Hospital Procurement Teams (45+)',
          platform: 'Facebook',
          reachPotential: 180000,
          productFit: 'Assays',
          estimatedCost: 3200,
          recommendation: 'B2B2C model. Partner with hospital networks.',
        },
        {
          segment: 'Life Sciences Students (18-28)',
          platform: 'Instagram',
          reachPotential: 380000,
          productFit: 'Arrays',
          estimatedCost: 5000,
          recommendation: 'Build brand loyalty early. Offer educational discounts.',
        },
        {
          segment: 'Academic Researchers (25-60)',
          platform: 'Twitter/X',
          reachPotential: 120000,
          productFit: 'Assays',
          estimatedCost: 2800,
          recommendation: 'Thought leadership. Share research partnerships.',
        },
      ];

      setCampaigns(mockCampaigns);
      setInsights(mockInsights);
    } catch (err: any) {
      console.error('Failed to load marketing data:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredInsights = insights.filter((i) => i.productFit === selectedProduct);

  const totalReach = campaigns.reduce((sum, c) => sum + c.reach, 0);
  const avgEngagement = (campaigns.reduce((sum, c) => sum + c.engagement, 0) / campaigns.length).toFixed(1);
  const totalCost = campaigns.reduce((sum, c) => sum + c.cost, 0);
  const totalROI = (campaigns.reduce((sum, c) => sum + c.cost * c.roi, 0) / totalCost).toFixed(2);

  return (
    <section style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2>Marketing Insights & Social Reach</h2>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', borderBottom: '2px solid #ddd' }}>
        <button
          onClick={() => setActiveTab('campaigns')}
          style={{
            padding: '10px 20px',
            border: 'none',
            backgroundColor: activeTab === 'campaigns' ? '#0078d4' : 'transparent',
            color: activeTab === 'campaigns' ? 'white' : '#0078d4',
            cursor: 'pointer',
            borderRadius: '4px 4px 0 0',
            fontWeight: 'bold',
          }}
        >
          Active Campaigns
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          style={{
            padding: '10px 20px',
            border: 'none',
            backgroundColor: activeTab === 'insights' ? '#0078d4' : 'transparent',
            color: activeTab === 'insights' ? 'white' : '#0078d4',
            cursor: 'pointer',
            borderRadius: '4px 4px 0 0',
            fontWeight: 'bold',
          }}
        >
          Demographic Insights
        </button>
      </div>

      {loading && <div>Loading...</div>}

      {activeTab === 'campaigns' && (
        <div>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
            <div style={{ padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>Total Reach</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{(totalReach / 1000).toFixed(0)}K</div>
            </div>
            <div style={{ padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>Avg Engagement</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{avgEngagement}%</div>
            </div>
            <div style={{ padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>Total Cost</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>${totalCost.toLocaleString()}</div>
            </div>
            <div style={{ padding: '15px', backgroundColor: '#e8f5e9', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>Avg ROI</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{totalROI}x</div>
            </div>
          </div>

          {/* Campaigns Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: '10px', textAlign: 'left' }}>Campaign</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Platform</th>
                <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Reach</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Engagement</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Cost</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>ROI</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr key={campaign.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '10px' }}>{campaign.name}</td>
                  <td style={{ padding: '10px' }}>{campaign.platform}</td>
                  <td style={{ padding: '10px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        backgroundColor: campaign.status === 'active' ? '#c8e6c9' : campaign.status === 'paused' ? '#fff9c4' : '#f5f5f5',
                      }}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{(campaign.reach / 1000).toFixed(0)}K</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{campaign.engagement}%</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>${campaign.cost.toLocaleString()}</td>
                  <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#2e7d32' }}>{campaign.roi}x</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'insights' && (
        <div>
          {/* Product Filter */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ marginRight: '15px' }}>
              <strong>Filter by Product:</strong>
            </label>
            {(['Assays', 'Arrays', 'Reagents'] as const).map((product) => (
              <label key={product} style={{ marginRight: '20px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="product"
                  value={product}
                  checked={selectedProduct === product}
                  onChange={(e) => setSelectedProduct(e.target.value as any)}
                  style={{ marginRight: '5px' }}
                />
                {product}
              </label>
            ))}
          </div>

          {/* Insights Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '15px' }}>
            {filteredInsights.map((insight, idx) => (
              <div
                key={idx}
                style={{
                  padding: '15px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  backgroundColor: '#fafafa',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0', fontSize: '16px' }}>{insight.segment}</h3>
                    <div style={{ fontSize: '12px', color: '#666' }}>{insight.platform}</div>
                  </div>
                  <div
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#e3f2fd',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#0056b3',
                    }}
                  >
                    {insight.productFit}
                  </div>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    <strong>Reach Potential:</strong> {(insight.reachPotential / 1000).toFixed(0)}K
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    <strong>Est. Cost:</strong> ${insight.estimatedCost.toLocaleString()}
                  </div>
                </div>

                <div style={{ padding: '10px', backgroundColor: '#e8f5e9', borderRadius: '4px', fontSize: '13px', color: '#1b5e20' }}>
                  <strong>Recommendation:</strong>
                  <p style={{ margin: '5px 0 0 0' }}>{insight.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default MarketingInsightsPanel;
