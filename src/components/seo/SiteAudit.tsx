import React, { useState } from 'react';
import { blink } from '@/blink/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Search, Loader2, CheckCircle2, AlertCircle, ExternalLink, ArrowRight } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const SiteAudit = () => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setResult(null);

    try {
      // Step 1: Scrape the site
      const scrapeResult = await blink.data.scrape(url);
      
      // Step 2: Analyze with AI (Simulated for Phase 1 MVP)
      const { text: analysis } = await blink.ai.generateText({
        model: 'google/gemini-3-flash',
        prompt: `Analyze the following website content for SEO best practices. Identify 3 strengths and 3 improvements. Content: ${scrapeResult.markdown.slice(0, 2000)}`,
      });

      setResult({
        scrape: scrapeResult,
        analysis: analysis,
      });
      toast.success('Audit complete!');
    } catch (error: any) {
      console.error(error);
      toast.error('Failed to audit website. Make sure the URL is valid.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <Card className="border-primary/20 shadow-lg shadow-primary/5">
        <CardHeader>
          <CardTitle>Launch New SEO Audit</CardTitle>
          <CardDescription>Enter your website URL to begin the autonomous analysis.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAudit} className="flex flex-col sm:flex-row gap-4">
            <Input 
              type="url" 
              placeholder="https://yourwebsite.com" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="flex-1 h-12 text-lg"
            />
            <Button size="lg" className="h-12 px-8" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-5 w-5" />
                  Start Audit
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Metadata Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Globe className="mr-2 h-5 w-5 text-primary" />
                Site Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Title Tag</p>
                <p className="font-semibold text-lg">{result.scrape.metadata.title || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Meta Description</p>
                <p className="text-sm text-muted-foreground italic">
                  {result.scrape.metadata.description || 'No description found.'}
                </p>
              </div>
              <div className="flex items-center space-x-4 pt-4">
                <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">SSL Secure</div>
                <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">Fast Response</div>
              </div>
            </CardContent>
          </Card>

          {/* AI Analysis Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckCircle2 className="mr-2 h-5 w-5 text-primary" />
                AI SEO Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert">
                <p className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                  {result.analysis}
                </p>
              </div>
              <div className="mt-6 flex flex-col gap-2">
                <Button variant="outline" className="w-full justify-between">
                  Generate Content Plan <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" className="w-full justify-between">
                  Keyword Opportunities <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

const Globe = ({ className, size }: { className?: string, size?: number }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size || 24} 
    height={size || 24} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
