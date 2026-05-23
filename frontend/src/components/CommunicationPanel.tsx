import React, { useState, useEffect } from 'react';

interface TeamsChannel {
  id: string;
  displayName: string;
  description?: string;
  unreadCount?: number;
}

interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: string;
  isOwn?: boolean;
}

const CommunicationPanel: React.FC = () => {
  const [channels, setChannels] = useState<TeamsChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<TeamsChannel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Fetch Teams channels on mount
  useEffect(() => {
    loadTeamsChannels();
  }, []);

  const loadTeamsChannels = async () => {
    setLoading(true);
    try {
      // TODO: Replace with actual Microsoft Graph API call
      // GET /me/chats (or /teams)
      // Requires: Authorization header with Bearer token
      const mockChannels: TeamsChannel[] = [
        { id: '1', displayName: 'Operations Team', description: 'Operations coordination', unreadCount: 3 },
        { id: '2', displayName: 'Executive Updates', description: 'Company announcements' },
        { id: '3', displayName: 'Engineering Squad', description: 'Product development' },
      ];
      setChannels(mockChannels);
      setIsConnected(true);
      setError(null);
    } catch (err: any) {
      setError(`Failed to load Teams channels: ${err.message}`);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const loadChannelMessages = async (channel: TeamsChannel) => {
    setLoading(true);
    try {
      // TODO: Replace with Microsoft Graph API call
      // GET /me/chats/{channelId}/messages
      const mockMessages: ChatMessage[] = [
        {
          id: '1',
          sender: 'Brian Richardson',
          content: 'The production run finished ahead of schedule. WIP is down to 1,240 units.',
          timestamp: '2026-03-12T14:30:00Z',
          isOwn: false,
        },
        {
          id: '2',
          sender: 'Sarah Ahmed',
          content: 'Great work! Can we push the next batch forward?',
          timestamp: '2026-03-12T14:35:00Z',
          isOwn: false,
        },
        {
          id: '3',
          sender: 'You',
          content: 'Sure, moving it to tomorrow morning.',
          timestamp: '2026-03-12T14:40:00Z',
          isOwn: true,
        },
      ];
      setMessages(mockMessages);
      setSelectedChannel(channel);
      setError(null);
    } catch (err: any) {
      setError(`Failed to load messages: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedChannel) return;

    try {
      // TODO: Call Microsoft Graph API to send message
      // POST /me/chats/{channelId}/messages
      const newMessage: ChatMessage = {
        id: String(messages.length + 1),
        sender: 'You',
        content: replyText,
        timestamp: new Date().toISOString(),
        isOwn: true,
      };

      setMessages([...messages, newMessage]);
      setReplyText('');
    } catch (err: any) {
      setError(`Failed to send message: ${err.message}`);
    }
  };

  const handleOpenTeams = () => {
    // Open Teams in new window
    window.open('https://teams.microsoft.com', '_blank');
  };

  return (
    <section style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2>Communication Hub</h2>

      {/* Status */}
      <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: isConnected ? '#e6ffe6' : '#ffe6e6', borderRadius: '4px' }}>
        <strong>{isConnected ? '✓ Connected to Teams' : '✗ Not connected'}</strong>
      </div>

      {error && (
        <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#ffe6e6', color: '#cc0000', borderRadius: '4px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '15px', flex: 1 }}>
        {/* Channels List */}
        <div style={{ width: '250px', borderRight: '1px solid #ccc', paddingRight: '15px', overflowY: 'auto' }}>
          <h3>Your Chats</h3>
          <button onClick={loadTeamsChannels} style={{ marginBottom: '10px', padding: '8px', width: '100%' }}>
            Refresh Channels
          </button>

          {loading && <div>Loading...</div>}

          {channels.map((channel) => (
            <div
              key={channel.id}
              onClick={() => loadChannelMessages(channel)}
              style={{
                padding: '10px',
                marginBottom: '8px',
                border: selectedChannel?.id === channel.id ? '2px solid #0078d4' : '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                backgroundColor: selectedChannel?.id === channel.id ? '#e3f2fd' : 'transparent',
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{channel.displayName}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>{channel.description}</div>
              {channel.unreadCount && <div style={{ fontSize: '12px', color: '#f44336', fontWeight: 'bold' }}>● {channel.unreadCount} unread</div>}
            </div>
          ))}
        </div>

        {/* Message View */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {selectedChannel ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3>{selectedChannel.displayName}</h3>
                <button onClick={handleOpenTeams} style={{ padding: '8px 16px', backgroundColor: '#0078d4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Open in Teams →
                </button>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: '15px', paddingRight: '10px', borderTop: '1px solid #ddd', borderBottom: '1px solid #ddd', paddingTop: '10px' }}>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      marginBottom: '12px',
                      padding: '10px',
                      backgroundColor: msg.isOwn ? '#e3f2fd' : '#f5f5f5',
                      borderRadius: '6px',
                      marginLeft: msg.isOwn ? '50px' : '0',
                      marginRight: msg.isOwn ? '0' : '50px',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#666' }}>{msg.sender}</div>
                    <div style={{ marginTop: '4px' }}>{msg.content}</div>
                    <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>{new Date(msg.timestamp).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>

              {/* Reply Input */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendReply()}
                  placeholder="Type your reply..."
                  style={{ flex: 1, padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }}
                />
                <button onClick={handleSendReply} disabled={!replyText.trim()} style={{ padding: '10px 20px', backgroundColor: '#0078d4', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Send
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
              {loading ? 'Loading messages...' : 'Select a chat to view messages'}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default CommunicationPanel;
