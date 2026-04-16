import React, { useState, useMemo } from 'react';
import {
  Sparkles, Loader2, Plus, Trash2, Edit2,
  Send, FileText, Clock, Hash, ImageIcon, AlignLeft, UploadCloud,
  Layout, ShoppingBag, BookOpen, HelpCircle
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localDB } from '@/lib/local-db';
import toast from 'react-hot-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { geminiGenerateJSON, generateAIImageUrl } from '@/lib/ai';
import { createLogger, addBreadcrumb } from '@/lib/logger';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';

const log = createLogger('ContentLab');

// ─── Content Type Configs ─────────────────────────────────────────────────────

type ContentType = 'blog' | 'landing-page' | 'product-description';

const CONTENT_TYPES: { value: ContentType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'blog', label: 'Blog Post', icon: <BookOpen className="h-4 w-4" />, description: 'SEO-optimized article with headings, images, and FAQ' },
  { value: 'landing-page', label: 'Landing Page', icon: <Layout className="h-4 w-4" />, description: 'Conversion-focused page with CTA and benefits' },
  { value: 'product-description', label: 'Product Description', icon: <ShoppingBag className="h-4 w-4" />, description: 'Compelling product copy with features and specs' },
];

function getContentTypePrompt(topic: string, contentType: ContentType): string {
  const base = `Topic: "${topic}"\n\nReturn ONLY valid JSON:\n{\n  "title": "...",\n  "metaDescription": "160 char max",\n  "keywords": ["kw1","kw2","kw3","kw4","kw5"],\n  "content": "full content in markdown",\n  "imagePrompts": ["descriptive AI image prompt for hero", "descriptive prompt for inline"],\n  "faqSchema": [{"question": "...", "answer": "..."}]\n}`;

  switch (contentType) {
    case 'blog':
      return `Write a complete SEO-optimized blog post about: ${base}\n\nRequirements:\n- Minimum 1200 words\n- Proper H1 title, H2 sections, H3 subsections\n- Natural keyword placement (1-2% density)\n- Include a FAQ section with 4-5 questions at the end\n- Include internal linking suggestions as [link text](URL_SUGGESTION)\n- Engaging introduction and strong conclusion with CTA`;

    case 'landing-page':
      return `Write a high-converting landing page about: ${base}\n\nRequirements:\n- Compelling hero headline and subheadline\n- 3-5 key benefits with icons/emoji\n- Social proof section\n- Feature comparison or specs\n- Strong CTA sections (minimum 2)\n- FAQ section with 3-4 questions\n- 600-800 words (concise and punchy)\n- Use persuasive, action-oriented language`;

    case 'product-description':
      return `Write a compelling product description about: ${base}\n\nRequirements:\n- Attention-grabbing product title\n- Key features list (5-7 items)\n- Detailed specifications section\n- Use cases / who it's for\n- Comparison with alternatives (subtle)\n- FAQ section with 3-4 questions\n- 500-700 words\n- Persuasive but honest tone\n- Include schema-ready product attributes`;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContentLabRow {
  id: string;
  userId: string;
  title: string;
  content: string;
  metaDescription: string;
  keywords: string;       // JSON string
  imageUrls: string;      // JSON string
  status: 'draft' | 'published';
  platformsPublished: string; // JSON string {}
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

interface GenerateResult {
  title: string;
  metaDescription: string;
  keywords: string[];
  content: string;
  imagePrompts: string[];
  faqSchema?: { question: string; answer: string }[];
}

interface ContentLabProps {
  projectId: string;
  onNavigate?: (view: string, id?: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function parsePlatforms(json: string): string {
  try {
    const obj: Record<string, boolean> = JSON.parse(json || '{}');
    return Object.keys(obj).filter(k => obj[k]).join(', ') || '—';
  } catch { return '—'; }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContentLab({ projectId, onNavigate }: ContentLabProps) {
  const queryClient = useQueryClient();

  // ── Create tab state ──
  const [topic, setTopic] = useState('');
  const [contentType, setContentType] = useState<ContentType>('blog');
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imagePrompts, setImagePrompts] = useState<string[]>([]);
  const [faqSchema, setFaqSchema] = useState<{ question: string; answer: string }[]>([]);
  const [addingImageIdx, setAddingImageIdx] = useState<number | null>(null);
  const [generated, setGenerated] = useState(false);

  // ── Distribution sync ──

  // ── Tab ──
  const [tab, setTab] = useState<'create' | 'my-content'>('create');

  const wordCount = useMemo(() => countWords(content), [content]);

  // ── Query: list content_lab ──
  const { data: contentList = [], isLoading: loadingList } = useQuery<ContentLabRow[]>({
    queryKey: ['content_lab'],
    queryFn: () => localDB.table<ContentLabRow>('content_lab').list({ orderBy: { createdAt: 'desc' } }),
  });

  // ── Mutation: generate content ──
  const generateMutation = useMutation<GenerateResult, Error, string>({
    mutationFn: async (topicStr) => {
      addBreadcrumb('content_generate', 'ContentLab', { topic: topicStr, contentType });
      log.info('Generating content', { topic: topicStr, contentType });
      const prompt = getContentTypePrompt(topicStr, contentType);
      const result = await geminiGenerateJSON<GenerateResult>(prompt);
      return result;
    },
    onSuccess: async (data) => {
      setTitle(data.title);
      setContent(data.content);
      setMetaDescription(data.metaDescription);
      setKeywords(data.keywords ?? []);
      setImagePrompts(data.imagePrompts ?? []);
      setFaqSchema(data.faqSchema ?? []);
      setGenerated(true);
      log.info('Content generated', { title: data.title, wordCount: countWords(data.content), contentType });

      // Auto-generate images
      const heroUrl = generateAIImageUrl(data.imagePrompts[0] || data.title, 1200, 630);
      const inlineUrl = generateAIImageUrl(data.imagePrompts[1] || data.keywords[0] || 'business', 800, 400);

      setImageUrls([heroUrl, inlineUrl]);

      // Also auto-insert hero image into content
      const heroMarkdown = `\n\n![Hero Image](${heroUrl})\n\n`;
      setContent(prev => {
        const firstHeadingEnd = prev.indexOf('\n\n');
        if (firstHeadingEnd > -1) {
          return prev.slice(0, firstHeadingEnd) + heroMarkdown + prev.slice(firstHeadingEnd);
        }
        return heroMarkdown + prev;
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const fetchImage = async (prompt: string, idx: number) => {
    setAddingImageIdx(idx);
    try {
      // Use AI Image generation
      const sizes = idx === 0 ? { w: 1200, h: 630 } : { w: 800, h: 400 };
      const testUrl = generateAIImageUrl(prompt, sizes.w, sizes.h);
      setImageUrls(prev => {
        const newUrls = [...prev];
        newUrls[idx] = testUrl;
        return newUrls;
      });
      toast.success('Image added!');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Image fetch failed');
    } finally {
      setAddingImageIdx(null);
    }
  };

  // ── Mutation: Enhance Content ──
  const enhanceMutation = useMutation<GenerateResult, Error, void>({
    mutationFn: async () => {
      const result = await geminiGenerateJSON<GenerateResult>(
        `You are an expert SEO content improver. Enhance the following blog post to significantly improve flow, keyword density naturally, add formatting (bolding key terms, better headers), and make it more engaging. Preserve the core message.\n\nCurrent Title: ${title}\nCurrent Content:\n${content}\n\nReturn ONLY valid JSON:\n{\n  "title": "same or improved title",\n  "metaDescription": "160 char max, highly clickable",\n  "keywords": ["..."],\n  "content": "improved full post in markdown",\n  "imagePrompts": ["highly descriptive AI image prompt for hero image", "descriptive prompt for inline"]\n}`
      );
      return result;
    },
    onSuccess: (data) => {
      setTitle(data.title);
      setContent(data.content);
      if (data.metaDescription) setMetaDescription(data.metaDescription);
      if (data.keywords?.length) setKeywords(data.keywords);
      if (data.imagePrompts?.length) setImagePrompts(data.imagePrompts);
      toast.success('Content enhanced with AI!');
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Mutation: save draft ──
  const saveDraftMutation = useMutation<ContentLabRow, Error, void>({
    mutationFn: async () => {
      const payload = {
        title,
        content,
        metaDescription,
        keywords: JSON.stringify(keywords),
        imageUrls: JSON.stringify(imageUrls),
        status: 'draft' as const,
        wordCount,
        platformsPublished: '{}',
        updatedAt: new Date().toISOString(),
      };
      if (editId) {
        return localDB.table<ContentLabRow>('content_lab').update(editId, payload);
      }
      return localDB.table<ContentLabRow>('content_lab').create({
        ...payload,
        userId: '',
        createdAt: new Date().toISOString(),
      });
    },
    onSuccess: (row) => {
      setEditId(row.id);
      queryClient.invalidateQueries({ queryKey: ['content_lab'] });
      toast.success('Draft saved!');
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Mutation: delete ──
  const deleteMutation = useMutation<string, Error, string>({
    mutationFn: async (id) => {
      await localDB.table<ContentLabRow>('content_lab').delete(id);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content_lab'] });
      toast.success('Deleted');
    },
    onError: (e) => toast.error(e.message),
  });

  const loadForEdit = (row: ContentLabRow) => {
    setEditId(row.id);
    setTitle(row.title);
    setContent(row.content);
    setMetaDescription(row.metaDescription);
    setKeywords(() => { try { return JSON.parse(row.keywords || '[]'); } catch { return []; } });
    setImageUrls(() => { try { return JSON.parse(row.imageUrls || '[]'); } catch { return []; } });
    setImagePrompts([]);
    setGenerated(true);
    setTab('create');
  };

  const openDistribution = (id: string) => {
    if (onNavigate) {
      onNavigate('distribution', id);
    } else {
      toast.error('Routing to distribution is unavailable in this view.');
    }
  };

  const resetCreate = () => {
    setEditId(null);
    setTitle('');
    setContent('');
    setMetaDescription('');
    setKeywords([]);
    setImageUrls([]);
    setImagePrompts([]);
    setFaqSchema([]);
    setGenerated(false);
    setTopic('');
    setContentType('blog');
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              AI Content Lab
              <Badge variant="secondary" className="bg-primary/10 text-primary border-none">New</Badge>
            </h1>
            <p className="text-muted-foreground mt-1">Generate, edit and distribute SEO-optimised content.</p>
          </div>
          {tab === 'create' && generated && (
            <Button variant="outline" size="sm" onClick={resetCreate}>
              <Plus className="h-4 w-4 mr-1" /> New Content
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="w-full flex-col">
          <TabsList className="bg-transparent border-b border-border mb-6 rounded-none p-0 h-auto w-full justify-start gap-0 max-w-md">
            <TabsTrigger value="create" className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-muted-foreground">
              <Sparkles className="h-4 w-4" /> Create
            </TabsTrigger>
            <TabsTrigger value="my-content" className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 pt-1 text-muted-foreground">
              <FileText className="h-4 w-4" /> My Content
              {contentList.length > 0 && (
                <Badge className="ml-1 h-5 min-w-5 flex items-center justify-center rounded-full bg-primary/15 text-primary border-none text-[10px]">
                  {contentList.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ══════════════ TAB 1: CREATE ══════════════ */}
          <TabsContent value="create" className="focus-visible:outline-none space-y-6">

            {/* Topic input */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Generate with AI
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Content Type Selector */}
                <div className="flex gap-2 flex-wrap">
                  {CONTENT_TYPES.map(ct => (
                    <button
                      key={ct.value}
                      onClick={() => setContentType(ct.value)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                        contentType === ct.value
                          ? 'border-primary/40 bg-primary/5 text-primary shadow-sm shadow-primary/10'
                          : 'border-border bg-card hover:border-primary/20 text-muted-foreground'
                      }`}
                    >
                      {ct.icon}
                      <span className="font-medium">{ct.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {CONTENT_TYPES.find(ct => ct.value === contentType)?.description}
                </p>

                {/* Topic Input */}
                <div className="flex gap-3">
                  <Input
                    placeholder={contentType === 'blog' ? "Enter a topic, e.g. 'How to rank on Google in 2025'" : contentType === 'landing-page' ? "Enter product/service, e.g. 'AI-powered SEO tool'" : "Enter product name, e.g. 'Wireless noise-canceling headphones'"}
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !generateMutation.isPending && topic.trim() && generateMutation.mutate(topic.trim())}
                    className="flex-1"
                  />
                  <Button
                    onClick={() => generateMutation.mutate(topic.trim())}
                    disabled={generateMutation.isPending || !topic.trim()}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 shrink-0"
                  >
                    {generateMutation.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating…</>
                      : <><Sparkles className="h-4 w-4 mr-2" /> Generate</>}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Generated editor */}
            {generated && (
              <div className="space-y-4 animate-fade-in">
                {/* Title */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <AlignLeft className="h-4 w-4 text-muted-foreground" /> Title
                  </label>
                  <Input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Article title…"
                    className="text-base font-medium"
                  />
                </div>

                {/* Meta description */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Meta Description</label>
                  <Input
                    value={metaDescription}
                    onChange={e => setMetaDescription(e.target.value)}
                    placeholder="SEO meta description…"
                  />
                </div>

                {/* Keywords */}
                {keywords.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Hash className="h-4 w-4 text-muted-foreground" /> Keywords
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="bg-primary/10 text-primary border-primary/20 text-xs">
                          {kw}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Content editor */}
                <div className="space-y-1.5">
                  <Tabs defaultValue="editor" className="w-full">
                    <div className="flex items-center justify-between mb-2">
                      <TabsList className="bg-secondary/50 border border-primary/5">
                        <TabsTrigger value="editor">Editor</TabsTrigger>
                        <TabsTrigger value="preview">Preview</TabsTrigger>
                      </TabsList>
                      <span className="text-xs text-muted-foreground">{wordCount} words</span>
                    </div>
                    <TabsContent value="editor">
                      <Textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder="Write or paste markdown content…"
                        rows={16}
                        className="font-mono text-sm resize-y min-h-[400px]"
                      />
                    </TabsContent>
                    <TabsContent value="preview">
                      <Card className="min-h-[400px] border-primary/10 overflow-hidden bg-white shadow-inner">
                        <CardContent className="p-8 prose prose-teal dark:prose-invert max-w-none">
                          <MarkdownRenderer content={content} />
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Image prompts + previews */}
                {imagePrompts.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" /> Image Suggestions
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {imagePrompts.map((prompt, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          disabled={addingImageIdx === i}
                          onClick={() => fetchImage(prompt, i)}
                        >
                          {addingImageIdx === i
                            ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            : <Plus className="h-3 w-3 mr-1" />}
                          {prompt.length > 40 ? prompt.slice(0, 40) + '…' : prompt}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Image thumbnails */}
                {imageUrls.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <UploadCloud className="h-4 w-4 text-muted-foreground" /> Generated Images
                    </label>
                    <div className="flex flex-wrap gap-3">
                      {imageUrls.map((url, i) => (
                        <div key={i} className="relative group rounded-lg overflow-hidden border border-border w-28 h-28">
                          <img src={url} alt={`Generated ${i + 1}`} className="w-full h-full object-cover" />
                          <button
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            onClick={() => setImageUrls(prev => prev.filter((_, idx) => idx !== i))}
                          >
                            <Trash2 className="h-4 w-4 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* FAQ Schema Preview */}
                {faqSchema.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <HelpCircle className="h-4 w-4 text-muted-foreground" /> FAQ Schema ({faqSchema.length} questions)
                    </label>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                      {faqSchema.map((faq, i) => (
                        <div key={i} className="p-3 bg-secondary/30 rounded-lg border border-primary/5">
                          <p className="text-sm font-medium text-foreground">Q: {faq.question}</p>
                          <p className="text-xs text-muted-foreground mt-1">A: {faq.answer}</p>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      ✓ FAQ schema will be included when publishing — helps with People Also Ask rankings.
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => enhanceMutation.mutate()}
                    disabled={enhanceMutation.isPending || !content.trim()}
                    className="border-primary/20 text-primary hover:bg-primary/5 shadow-sm"
                  >
                    {enhanceMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    {enhanceMutation.isPending ? 'Enhancing...' : 'Enhance with AI'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => saveDraftMutation.mutate()}
                    disabled={saveDraftMutation.isPending || !title.trim()}
                  >
                    {saveDraftMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save Draft
                  </Button>
                  <Button
                    className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20"
                    disabled={!title.trim() || saveDraftMutation.isPending || enhanceMutation.isPending}
                    onClick={async () => {
                      if (!editId) {
                        const saved = await saveDraftMutation.mutateAsync();
                        openDistribution(saved.id);
                      } else {
                        // Force save draft before jumping to publish
                        await saveDraftMutation.mutateAsync();
                        openDistribution(editId);
                      }
                    }}
                  >
                    <Send className="h-4 w-4 mr-2" /> Publish
                  </Button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!generated && !generateMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-1">Start with a topic</h3>
                <p className="text-muted-foreground text-sm max-w-xs">
                  Enter a topic above and click Generate — the AI will write a full SEO article, suggest images, and fill in meta data.
                </p>
              </div>
            )}
          </TabsContent>

          {/* ══════════════ TAB 2: MY CONTENT ══════════════ */}
          <TabsContent value="my-content" className="focus-visible:outline-none">
            {loadingList ? (
              <div className="flex justify-center items-center py-24">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : contentList.length === 0 ? (
              <Card className="border-dashed border-2 py-20 text-center">
                <CardContent>
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-20 mb-4" />
                  <h3 className="text-lg font-medium mb-1">No content yet</h3>
                  <p className="text-muted-foreground text-sm mb-6">
                    Generate your first piece of content in the Create tab.
                  </p>
                  <Button variant="outline" onClick={() => setTab('create')}>
                    <Sparkles className="h-4 w-4 mr-2" /> Create Content
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Words</TableHead>
                        <TableHead>Platforms</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contentList.map(row => (
                        <TableRow key={row.id} className="group">
                          <TableCell className="font-medium max-w-[220px] truncate">
                            {row.title || 'Untitled'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={row.status === 'published'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
                                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'}
                            >
                              {row.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {row.wordCount ?? 0}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {parsePlatforms(row.platformsPublished)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(row.createdAt).toLocaleDateString()}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Edit"
                                onClick={() => loadForEdit(row)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary"
                                title="Publish"
                                onClick={() => openDistribution(row.id)}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                                title="Delete"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(row.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

    </>
  );
}
