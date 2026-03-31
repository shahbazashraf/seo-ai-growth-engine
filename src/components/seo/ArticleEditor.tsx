import React, { useState, useEffect } from 'react';
import { 
  Save, 
  Sparkles, 
  ChevronLeft, 
  Clock, 
  BookOpen, 
  Settings, 
  Check, 
  Loader2,
  Heading,
  FileText,
  Share2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { 
  useArticle, 
  useUpdateArticle,
  Article 
} from '@/hooks/useData';
import { streamGenerateArticle, generateOutline } from '@/lib/ai-engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';

interface ArticleEditorProps {
  articleId: string;
  onBack: () => void;
}

export function ArticleEditor({ articleId, onBack }: ArticleEditorProps) {
  const { data: article, isLoading } = useArticle(articleId);
  const updateArticle = useUpdateArticle();

  const [title, setTitle] = useState('');
  const [outline, setOutline] = useState('');
  const [content, setContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOutlining, setIsOutlining] = useState(false);

  useEffect(() => {
    if (article) {
      setTitle(article.title || '');
      setOutline(article.outline || '');
      setContent(article.content || '');
    }
  }, [article]);

  const handleSave = async () => {
    if (!article) return;
    try {
      await updateArticle.mutateAsync({
        id: articleId,
        projectId: article.projectId,
        title,
        outline,
        content,
      });
      toast.success('Changes saved');
    } catch (error) {
      // handled in hook
    }
  };

  const handleGenerateOutline = async () => {
    if (!article) return;
    const keyword = article.keywordId || title; // Use keyword if available, otherwise title
    if (!keyword) {
      toast.error('Add a keyword or title first');
      return;
    }

    setIsOutlining(true);
    try {
      const generatedOutline = await generateOutline(article.projectId, keyword);
      setOutline(generatedOutline);
      toast.success('Outline generated!');
    } catch (error) {
      toast.error('Failed to generate outline');
    } finally {
      setIsOutlining(false);
    }
  };

  const handleGenerateContent = async () => {
    if (!article) return;
    if (!outline) {
      toast.error('Please generate or provide an outline first');
      return;
    }

    setIsGenerating(true);
    setContent(''); // Clear content to start fresh

    try {
      const keyword = article.keywordId || title;
      await streamGenerateArticle(
        article.projectId,
        keyword,
        outline,
        (chunk) => {
          setContent(prev => prev + chunk);
        }
      );
      toast.success('Article generated!');
    } catch (error) {
      toast.error('Generation interrupted');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Loading article editor...</p>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="text-center p-12">
        <p className="text-destructive font-medium">Article not found</p>
        <Button onClick={onBack} variant="outline" className="mt-4">
          <ChevronLeft className="h-4 w-4 mr-2" />
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {title || 'Untitled Article'}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-secondary/50 text-secondary-foreground border-primary/20">
                {article.status.charAt(0).toUpperCase() + article.status.slice(1)}
              </Badge>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Updated {new Date(article.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={handleSave} 
            disabled={updateArticle.isPending}
            className="border-primary/20 hover:bg-primary/5"
          >
            {updateArticle.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-2 text-primary" />}
            Save Draft
          </Button>
          <Button 
            onClick={handleGenerateContent} 
            disabled={isGenerating || !outline}
            className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
          >
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {isGenerating ? 'AI Writing...' : 'Generate with AI'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-primary/10 bg-white/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                <Heading className="h-4 w-4" />
                Article Outline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Title (H1)</label>
                <Input 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  placeholder="The Ultimate Guide to..."
                  className="bg-white border-primary/10"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-muted-foreground">Detailed Outline</label>
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="h-auto p-0 text-xs text-primary"
                    onClick={handleGenerateOutline}
                    disabled={isOutlining}
                  >
                    {isOutlining ? '...' : 'Auto-outline'}
                  </Button>
                </div>
                <Textarea 
                  value={outline} 
                  onChange={(e) => setOutline(e.target.value)} 
                  placeholder="Plan your content structure here..."
                  className="min-h-[300px] resize-none text-sm font-mono bg-white border-primary/10"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/10 bg-white/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                <Settings className="h-4 w-4" />
                SEO Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-secondary/50 rounded-lg border border-primary/5">
                <p className="text-xs font-medium mb-2">Target Keyword</p>
                <Badge variant="secondary" className="bg-primary/10 text-primary border-none">
                  {article.keywordId || 'None selected'}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-muted-foreground">Est. Word Count</span>
                <span className="text-xs font-medium">{content ? content.split(/\s+/).length : 0} words</span>
              </div>
              <div className="flex items-center justify-between py-2 border-t border-primary/5">
                <span className="text-xs text-muted-foreground">Reading Time</span>
                <span className="text-xs font-medium">{content ? Math.ceil(content.split(/\s+/).length / 200) : 0} min</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8">
          <Tabs defaultValue="editor" className="w-full">
            <div className="flex items-center justify-between mb-4">
              <TabsList className="bg-secondary/50 border border-primary/5">
                <TabsTrigger value="editor" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Editor
                </TabsTrigger>
                <TabsTrigger value="preview" className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Preview
                </TabsTrigger>
              </TabsList>
              {content && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground italic flex items-center gap-1">
                    {isGenerating ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> AI is generating content...</>
                    ) : (
                      <><Check className="h-3 w-3 text-green-500" /> Draft updated</>
                    )}
                  </span>
                </div>
              )}
            </div>
            
            <TabsContent value="editor" className="mt-0 focus-visible:outline-none">
              <Card className="min-h-[600px] shadow-sm border-primary/10">
                <CardContent className="p-0">
                  <Textarea 
                    value={content} 
                    onChange={(e) => setContent(e.target.value)} 
                    placeholder="Begin writing or click 'Generate with AI' to start..."
                    className="min-h-[600px] w-full border-none resize-none focus-visible:ring-0 p-8 text-lg leading-relaxed placeholder:text-muted-foreground/30 font-serif"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="preview" className="mt-0 focus-visible:outline-none">
              <Card className="min-h-[600px] shadow-sm border-primary/10 overflow-hidden bg-white">
                <CardContent className="p-8 prose prose-teal max-w-none">
                  {content ? (
                    <div className="markdown-preview">
                      <MarkdownRenderer content={content} />
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-20">
                      <BookOpen className="h-12 w-12 mb-4 opacity-20" />
                      <p>No content to preview yet.</p>
                      <Button variant="link" onClick={() => handleGenerateContent()} className="text-primary mt-2">
                        Generate some content with AI
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
