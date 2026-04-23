'use client';

import { useState, useEffect } from 'react';
import DashboardLayout from '@/app/components/DashboardLayout';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export default function ApiKeysSettingsPage() {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newlyCreated, setNewlyCreated] = useState<{ key: string; name: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/keys');
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewlyCreated({ key: data.key, name: data.name });
        setName('');
        await fetchKeys();
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? Any CLI or app using it will stop working.')) return;
    await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    await fetchKeys();
  };

  const copyKey = async () => {
    if (!newlyCreated) return;
    await navigator.clipboard.writeText(newlyCreated.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Use these keys with the ImageGen CLI or MCP server to generate images programmatically.
          </p>
        </div>

        {newlyCreated && (
          <Card className="border-green-500/40 bg-green-500/5">
            <CardHeader>
              <CardTitle className="text-green-600 text-lg">Key created: {newlyCreated.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Copy this key now — it won&apos;t be shown again.
              </p>
              <div className="flex gap-2">
                <code className="flex-1 font-mono text-xs bg-background border rounded px-3 py-2 break-all">
                  {newlyCreated.key}
                </code>
                <Button size="sm" onClick={copyKey}>
                  {copied ? 'Copied!' : 'Copy'}
                </Button>
              </div>
              <div className="text-sm">
                <p className="font-medium mb-1">Quick start:</p>
                <pre className="bg-background border rounded p-3 text-xs overflow-x-auto">{`npm i -g @bowshai/imagegen
imagegen login ${newlyCreated.key.slice(0, 12)}...
imagegen generate ./my-images --variants 3`}</pre>
              </div>
              <Button variant="outline" size="sm" onClick={() => setNewlyCreated(null)}>
                Dismiss
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Create new key</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Input
              placeholder="e.g. Laptop CLI, MCP on Claude Desktop"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your keys</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : keys.length === 0 ? (
              <p className="text-muted-foreground text-sm">No keys yet. Create one above.</p>
            ) : (
              <div className="space-y-2">
                {keys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between border rounded-md p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{k.name}</span>
                        {k.revokedAt && <Badge variant="destructive">Revoked</Badge>}
                      </div>
                      <code className="text-xs text-muted-foreground">{k.keyPrefix}…</code>
                      <div className="text-xs text-muted-foreground">
                        Created {new Date(k.createdAt).toLocaleDateString()}
                        {k.lastUsedAt && ` • last used ${new Date(k.lastUsedAt).toLocaleDateString()}`}
                      </div>
                    </div>
                    {!k.revokedAt && (
                      <Button variant="outline" size="sm" onClick={() => handleRevoke(k.id)}>
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
