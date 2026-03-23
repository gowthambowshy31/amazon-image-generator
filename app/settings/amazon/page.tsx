'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/app/components/DashboardLayout';
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface AmazonConnectionInfo {
  id: string;
  sellerId: string;
  marketplaceId: string;
  region: string;
  storeName: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function AmazonSettingsPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="p-6 text-muted-foreground">Loading...</div></DashboardLayout>}>
      <AmazonSettingsContent />
    </Suspense>
  );
}

function AmazonSettingsContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connections, setConnections] = useState<AmazonConnectionInfo[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Check URL params for status messages
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'connected') {
      setMessage({ type: 'success', text: 'Amazon account connected successfully!' });
    } else if (error) {
      const errorMessages: Record<string, string> = {
        missing_params: 'Missing authorization parameters from Amazon.',
        invalid_state: 'Security validation failed. Please try again.',
        token_exchange_failed: 'Failed to exchange authorization code. Please try again.',
        no_refresh_token: 'Amazon did not provide a refresh token. Please try again.',
        server_error: 'An error occurred. Please try again.',
      };
      setMessage({ type: 'error', text: errorMessages[error] || 'An unknown error occurred.' });
    }

    fetchConnectionStatus();
  }, [searchParams]);

  const fetchConnectionStatus = async () => {
    try {
      const res = await fetch('/api/amazon/connection');
      if (res.ok) {
        const data = await res.json();
        setConnected(data.connected);
        setConnections(data.connections);
      }
    } catch (err) {
      console.error('Failed to fetch connection status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await fetch('/api/amazon/authorize');
      if (res.ok) {
        const data = await res.json();
        // Redirect to Amazon OAuth
        window.location.href = data.authUrl;
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Failed to start authorization' });
        setConnecting(false);
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to start authorization' });
      setConnecting(false);
    }
  };

  const handleDisconnect = async (connectionId?: string) => {
    if (!confirm('Are you sure you want to disconnect this Amazon account?')) return;

    try {
      const url = connectionId
        ? `/api/amazon/connection?id=${connectionId}`
        : '/api/amazon/connection';
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Amazon account disconnected.' });
        fetchConnectionStatus();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect.' });
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Amazon Connection</h1>
          <p className="text-muted-foreground mt-1">Connect your Amazon Seller account to import products and push images</p>
        </div>

        {/* Status messages */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-lg border ${
              message.type === 'success'
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-destructive/10 border-destructive/30 text-destructive'
            }`}
          >
            {message.text}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-6">
            {/* Connection status card */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full ${connected ? 'bg-success' : 'bg-muted'}`} />
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">
                        {connected ? 'Connected' : 'Not Connected'}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {connected
                          ? 'Your Amazon Seller account is linked'
                          : 'Connect your Amazon Seller account to get started'}
                      </p>
                    </div>
                  </div>
                  {!connected && (
                    <Button
                      onClick={handleConnect}
                      disabled={connecting}
                      variant={connecting ? "secondary" : "default"}
                    >
                      {connecting ? 'Redirecting...' : 'Connect Amazon Account'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Connected accounts list */}
            {connections.length > 0 && (
              <Card className="overflow-hidden">
                <CardHeader className="px-6 py-4 border-b border-border">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Connected Accounts</CardTitle>
                </CardHeader>
                {connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="px-6 py-4 flex items-center justify-between border-b border-border last:border-0"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-medium">
                          {conn.storeName || `Seller ${conn.sellerId}`}
                        </span>
                        <Badge variant={conn.isActive ? 'default' : 'secondary'}>
                          {conn.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Marketplace: {conn.marketplaceId} | Region: {conn.region.toUpperCase()} |
                        Connected: {new Date(conn.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDisconnect(conn.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      Disconnect
                    </Button>
                  </div>
                ))}
              </Card>
            )}

            {/* How it works */}
            {!connected && (
              <Card>
                <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">How it works</h3>
                <ol className="space-y-3 text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm flex items-center justify-center font-semibold">1</span>
                    <span>Click &quot;Connect Amazon Account&quot; to be redirected to Amazon Seller Central</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm flex items-center justify-center font-semibold">2</span>
                    <span>Log in to your Amazon Seller account and authorize the application</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm flex items-center justify-center font-semibold">3</span>
                    <span>You&apos;ll be redirected back here and your account will be connected</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-sm flex items-center justify-center font-semibold">4</span>
                    <span>Start importing products and pushing images directly to your Amazon listings</span>
                  </li>
                </ol>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
