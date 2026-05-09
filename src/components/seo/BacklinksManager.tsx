import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Mail, Search, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { localDB } from '@/lib/local-db';
import { apiUrl } from '@/lib/api-endpoints';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';

type OutreachType = 'resource-page' | 'guest-post' | 'broken-link' | 'mention';
type OutreachStatus = 'draft' | 'sent' | 'replied' | 'won' | 'lost';

interface ContentRecord {
  id: string;
  title?: string;
  canonicalUrl?: string;
  createdAt?: string;
}

interface BacklinkRecord {
  id: string;
  siteUrl: string;
  sourceUrl: string;
  source?: 'measured' | 'scraped' | 'estimated' | 'ai-suggested';
  verificationStatus?: 'ai-suggested' | 'outreach-sent' | 'verified' | 'lost';
  wonViaOutreachId?: string;
}

interface OpportunityRecord {
  id: string;
  siteUrl: string;
  opportunityData: string;
  createdAt: string;
}

interface OpportunityData {
  siteName: string;
  url: string;
  reason: string;
  domainAuthority: number;
  type: string;
  source?: 'measured' | 'scraped' | 'estimated' | 'ai-suggested';
}

interface OutreachRecord {
  id: string;
  contentId: string;
  targetSite: string;
  targetEmail: string;
  targetName?: string;
  outreachType: OutreachType;
  subject: string;
  bodyHtml: string;
  status: OutreachStatus;
  generatedAt?: string;
  sentAt?: string;
  repliedAt?: string;
  wonAt?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  createdAt?: string;
}

function statusBadge(status: OutreachStatus) {
  if (status === 'won') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">won</Badge>;
  if (status === 'replied') return <Badge className="bg-amber-100 text-amber-700 border-amber-200 border">replied</Badge>;
  if (status === 'sent') return <Badge className="bg-blue-100 text-blue-700 border-blue-200 border">sent</Badge>;
  if (status === 'lost') return <Badge className="bg-red-100 text-red-700 border-red-200 border">lost</Badge>;
  return <Badge variant="outline">draft</Badge>;
}

function typeToOutreachType(value: string): OutreachType {
  if (value.toLowerCase().includes('guest')) return 'guest-post';
  if (value.toLowerCase().includes('broken')) return 'broken-link';
  if (value.toLowerCase().includes('mention')) return 'mention';
  return 'resource-page';
}

export const BacklinksManager = () => {
  const queryClient = useQueryClient();
  const [siteUrl, setSiteUrl] = useState('');
  const [emailByOpportunity, setEmailByOpportunity] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [replyChecking, setReplyChecking] = useState(false);

  const { data: contentRows = [] } = useQuery<ContentRecord[]>({
    queryKey: ['content-lab-for-outreach'],
    queryFn: async () => await localDB.table<ContentRecord>('content_lab').list({ orderBy: { createdAt: 'desc' }, limit: 50 }),
  });

  const { data: opportunityRows = [] } = useQuery<OpportunityRecord[]>({
    queryKey: ['backlink-opportunities-v5'],
    queryFn: async () => await localDB.table<OpportunityRecord>('backlink_opportunities').list({ orderBy: { createdAt: 'desc' }, limit: 50 }),
  });

  const { data: outreachRecords = [], refetch: refetchOutreach } = useQuery<OutreachRecord[]>({
    queryKey: ['outreach-records'],
    queryFn: async () => await localDB.table<OutreachRecord>('outreachRecords').list({ orderBy: { createdAt: 'desc' }, limit: 300 }),
  });

  const opportunities = useMemo(() => {
    const rows = siteUrl.trim()
      ? opportunityRows.filter((row) => row.siteUrl === siteUrl.trim())
      : opportunityRows;
    const parsed: Array<OpportunityData & { sourceSiteUrl: string }> = [];
    rows.forEach((row) => {
      try {
        const list = JSON.parse(row.opportunityData) as OpportunityData[];
        list.forEach((item) => parsed.push({ ...item, sourceSiteUrl: row.siteUrl }));
      } catch {
        // Ignore malformed rows
      }
    });
    return parsed.slice(0, 40);
  }, [opportunityRows, siteUrl]);

  const wonLinks = outreachRecords.filter((row) => row.status === 'won');

  const generateEmail = async (opp: OpportunityData & { sourceSiteUrl: string }, targetEmail: string) => {
    const content = contentRows.find((row) => Boolean(row.canonicalUrl)) || contentRows[0];
    if (!content?.id) {
      toast.error('Create at least one content item before outreach.');
      return;
    }
    if (!targetEmail.trim()) {
      toast.error('Enter a target email first.');
      return;
    }

    const key = `${opp.url}-${targetEmail}`;
    setGeneratingKey(key);
    try {
      const response = await fetch(apiUrl('/api/outreach-generator/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: content.id,
          targetSite: opp.url,
          targetEmail: targetEmail.trim(),
          outreachType: typeToOutreachType(opp.type),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to generate outreach email.');
      }

      const record = payload.outreachRecord as OutreachRecord;
      await localDB.table<OutreachRecord>('outreachRecords').create({
        id: record.id,
        contentId: record.contentId,
        targetSite: record.targetSite,
        targetEmail: record.targetEmail,
        targetName: record.targetName || '',
        outreachType: record.outreachType,
        subject: record.subject,
        bodyHtml: record.bodyHtml,
        status: 'draft',
        generatedAt: record.generatedAt || new Date().toISOString(),
      });
      await refetchOutreach();
      toast.success('Outreach email generated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate outreach email');
    } finally {
      setGeneratingKey(null);
    }
  };

  const sendNow = async (record: OutreachRecord) => {
    setSendingId(record.id);
    try {
      const response = await fetch(apiUrl('/api/outreach-sender/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreachId: record.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to send outreach email.');
      }

      await localDB.table<OutreachRecord>('outreachRecords').update(record.id, {
        status: 'sent',
        sentAt: new Date().toISOString(),
        gmailMessageId: payload.messageId || '',
        gmailThreadId: payload.threadId || '',
      });

      const backlinks = await localDB.table<BacklinkRecord>('backlinks').list({ where: { sourceUrl: record.targetSite } });
      await Promise.all(backlinks.map((link) => localDB.table<BacklinkRecord>('backlinks').update(link.id, {
        verificationStatus: 'outreach-sent',
      })));

      await refetchOutreach();
      toast.success('Outreach email sent.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send outreach email');
    } finally {
      setSendingId(null);
    }
  };

  const checkReplies = async () => {
    setReplyChecking(true);
    try {
      const response = await fetch(apiUrl('/api/outreach-sender/check-replies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Reply check failed.');
      }

      const updated = Array.isArray(payload.updatedRecords) ? payload.updatedRecords : [];
      await Promise.all(updated.map((row: OutreachRecord) => localDB.table<OutreachRecord>('outreachRecords').update(row.id, {
        status: 'replied',
        repliedAt: row.repliedAt || new Date().toISOString(),
      })));
      await refetchOutreach();
      toast.success(`Reply check completed. ${updated.length} replied thread(s) found.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to check replies');
    } finally {
      setReplyChecking(false);
    }
  };

  const markOutcome = async (record: OutreachRecord, outcome: 'won' | 'lost') => {
    await localDB.table<OutreachRecord>('outreachRecords').update(record.id, {
      status: outcome,
      wonAt: outcome === 'won' ? new Date().toISOString() : '',
    });

    const backlinks = await localDB.table<BacklinkRecord>('backlinks').list({ where: { sourceUrl: record.targetSite } });
    await Promise.all(backlinks.map((link) => localDB.table<BacklinkRecord>('backlinks').update(link.id, {
      verificationStatus: outcome === 'won' ? 'verified' : 'lost',
      wonViaOutreachId: outcome === 'won' ? record.id : '',
      source: outcome === 'won' ? 'scraped' : link.source,
    })));

    await refetchOutreach();
    toast.success(outcome === 'won' ? 'Marked as won and backlink verified.' : 'Marked as lost.');
  };

  return (
    <div className="space-y-6">
      <Card className="border-primary/10">
        <CardHeader>
          <CardTitle>Backlink Outreach Engine</CardTitle>
          <CardDescription>Generate personalized outreach, send through Gmail, track replies, and promote won links to verified status.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Input
            placeholder="Filter opportunities by site URL (optional)"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
          />
          <Button variant="outline" onClick={() => setSiteUrl('')}>
            <Search className="h-4 w-4 mr-1.5" /> Clear
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="opportunities">
        <TabsList>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="outreach">Outreach</TabsTrigger>
          <TabsTrigger value="won-links">Won links</TabsTrigger>
        </TabsList>

        <TabsContent value="opportunities" className="space-y-4">
          {opportunities.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">No opportunities yet. Run backlink analysis first.</CardContent></Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {opportunities.map((opp, index) => {
                const matchedDraft = outreachRecords.find((record) => record.targetSite === opp.url && record.status === 'draft');
                const defaultEmail = emailByOpportunity[opp.url] || '';
                const loading = generatingKey === `${opp.url}-${defaultEmail}`;
                return (
                  <Card key={`${opp.url}-${index}`} className="border-primary/10">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{opp.siteName}</p>
                          <p className="text-xs text-muted-foreground">{opp.url}</p>
                        </div>
                        <Badge variant="outline">AI-suggested</Badge>
                      </div>

                      <p className="text-xs text-muted-foreground">{opp.reason}</p>
                      <div className="text-xs">
                        <span className="font-medium">Outreach type:</span> {typeToOutreachType(opp.type)}
                      </div>

                      <Input
                        placeholder="Target email (required)"
                        value={defaultEmail}
                        onChange={(e) => setEmailByOpportunity((prev) => ({ ...prev, [opp.url]: e.target.value }))}
                      />

                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => generateEmail(opp, defaultEmail)}
                          disabled={loading}
                        >
                          {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Generating</> : <><Mail className="h-3.5 w-3.5 mr-1.5" />Generate email</>}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => matchedDraft ? sendNow(matchedDraft) : toast.error('Generate email first.')}
                          disabled={!matchedDraft || sendingId === matchedDraft.id}
                        >
                          {sendingId === matchedDraft?.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Sending</> : 'Send now'}
                        </Button>
                      </div>

                      {matchedDraft && (
                        <div className="rounded border bg-secondary/20 p-2">
                          <p className="text-xs font-medium">{matchedDraft.subject}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-3">{matchedDraft.bodyHtml.replace(/<[^>]+>/g, ' ')}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="outreach">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Outreach records</CardTitle>
                <CardDescription>Track status, sent date, and reply outcomes.</CardDescription>
              </div>
              <Button variant="outline" onClick={checkReplies} disabled={replyChecking}>
                {replyChecking ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Checking</> : 'Check replies'}
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Target site</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent date</TableHead>
                    <TableHead>Reply?</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outreachRecords.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No outreach records yet.</TableCell></TableRow>
                  ) : outreachRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.targetSite}</TableCell>
                      <TableCell>{record.subject}</TableCell>
                      <TableCell>{statusBadge(record.status)}</TableCell>
                      <TableCell>{record.sentAt ? new Date(record.sentAt).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>{record.status === 'replied' || record.status === 'won' ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-right">
                        {(record.status === 'replied' || record.status === 'sent') && (
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => markOutcome(record, 'won')}>
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Mark as Won
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => markOutcome(record, 'lost')}>
                              <XCircle className="h-3.5 w-3.5 mr-1.5" /> Mark as Lost
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="won-links">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verified won links</CardTitle>
              <CardDescription>Outreach wins promoted from AI-suggested to Verified won.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Linking site</TableHead>
                    <TableHead>Our page</TableHead>
                    <TableHead>Date won</TableHead>
                    <TableHead>Link type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wonLinks.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No won links yet.</TableCell></TableRow>
                  ) : wonLinks.map((record) => {
                    const content = contentRows.find((row) => row.id === record.contentId);
                    return (
                      <TableRow key={record.id}>
                        <TableCell>{record.targetSite}</TableCell>
                        <TableCell>{content?.canonicalUrl || content?.title || '-'}</TableCell>
                        <TableCell>{record.wonAt ? new Date(record.wonAt).toLocaleDateString() : '-'}</TableCell>
                        <TableCell>{record.outreachType}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
