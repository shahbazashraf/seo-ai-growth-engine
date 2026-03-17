import React, { useState } from 'react';
import { 
  FileText, 
  Search, 
  Sparkles, 
  Trash2, 
  LayoutGrid, 
  LayoutList, 
  MoreVertical, 
  Clock, 
  Plus, 
  Loader2,
  ArrowRight,
  BookOpen,
  ArrowUpRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  useArticles, 
  useCreateArticle, 
  useDeleteArticle,
  Article,
  useKeywords
} from '@/hooks/useData';
import { KeywordManager } from './KeywordManager';
import { ArticleEditor } from './ArticleEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import toast from 'react-hot-toast';

interface ContentLabProps {
  projectId: string;
}

export function ContentLab({ projectId }: ContentLabProps) {
  const [activeTab, setActiveTab] = useState<'articles' | 'keywords'>('articles');
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isListView, setIsListView] = useState(false);

  const { data: articles = [], isLoading: isLoadingArticles } = useArticles(projectId);
  const { data: keywords = [] } = useKeywords(projectId);
  const createArticle = useCreateArticle();
  const deleteArticle = useDeleteArticle();

  const handleCreateArticle = async (keyword?: string) => {
    try {
      const result = await createArticle.mutateAsync({
        projectId,
        title: keyword ? `Ultimate Guide to ${keyword}` : '',
        keywordId: keyword || '',
        status: 'draft',
      });
      setEditingArticleId(result.id);
      toast.success('Draft created!');
    } catch (error) {
      // toast handled in hook
    }
  };

  const handleDeleteArticle = (id: string) => {
    deleteArticle.mutate({ id, projectId });
  };

  const filteredArticles = articles.filter(a => 
    (a.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.keywordId || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (editingArticleId) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
      >
        <ArticleEditor 
          articleId={editingArticleId} 
          onBack={() => setEditingArticleId(null)} 
        />
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            AI Content Lab
            <Badge variant="secondary" className="bg-primary/10 text-primary border-none">Phase 2</Badge>
          </h1>
          <p className="text-muted-foreground mt-1">
            Research keywords and generate high-quality SEO content.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            onClick={() => handleCreateArticle()} 
            disabled={createArticle.isPending}
            className="bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
          >
            {createArticle.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            New Article
          </Button>
        </div>
      </div>

      <Tabs 
        value={activeTab} 
        onValueChange={(v) => setActiveTab(v as any)} 
        className="w-full"
      >
        <TabsList className="bg-secondary/50 border border-primary/5 mb-6">
          <TabsTrigger value="articles" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Articles
          </TabsTrigger>
          <TabsTrigger value="keywords" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Keywords
          </TabsTrigger>
        </TabsList>

        <TabsContent value="articles" className="focus-visible:outline-none">
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search articles by title or keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2 border border-primary/5 rounded-md p-1 bg-secondary/30">
              <Button 
                variant={!isListView ? 'secondary' : 'ghost'} 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setIsListView(false)}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button 
                variant={isListView ? 'secondary' : 'ghost'} 
                size="icon" 
                className="h-8 w-8"
                onClick={() => setIsListView(true)}
              >
                <LayoutList className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {isLoadingArticles ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredArticles.length === 0 ? (
            <Card className="border-dashed border-2 py-20 text-center">
              <CardContent>
                <FileText className="h-12 w-12 mx-auto text-muted-foreground opacity-20 mb-4" />
                <h3 className="text-lg font-medium">No articles found</h3>
                <p className="text-muted-foreground mb-6">
                  {searchQuery ? 'No articles match your search criteria.' : 'Start your content strategy by creating your first article.'}
                </p>
                <Button onClick={() => handleCreateArticle()} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Article
                </Button>
              </CardContent>
            </Card>
          ) : isListView ? (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-primary/5">
                  {filteredArticles.map((article) => (
                    <div 
                      key={article.id} 
                      className="p-4 hover:bg-secondary/20 transition-colors flex items-center justify-between group cursor-pointer"
                      onClick={() => setEditingArticleId(article.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-lg bg-primary/5 flex items-center justify-center text-primary">
                          <BookOpen className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold">{article.title || 'Untitled Article'}</h4>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Search className="h-3 w-3" />
                              {article.keywordId || 'No keyword'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(article.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-secondary border-primary/10">
                          {article.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingArticleId(article.id)}>
                              Edit Article
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteArticle(article.id)}>
                              Delete Article
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredArticles.map((article) => (
                <Card 
                  key={article.id} 
                  className="group hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5 cursor-pointer flex flex-col h-full"
                  onClick={() => setEditingArticleId(article.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <Badge variant="outline" className="mb-2 bg-secondary/50 border-primary/10 text-[10px]">
                        {article.status.toUpperCase()}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingArticleId(article.id)}>
                            Edit Article
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteArticle(article.id)}>
                            Delete Article
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <CardTitle className="line-clamp-2 min-h-[3rem]">
                      {article.title || 'Untitled Article'}
                    </CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-2">
                      <Search className="h-3 w-3" />
                      {article.keywordId || 'No keyword'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <div className="text-sm text-muted-foreground line-clamp-3 italic opacity-60">
                      {article.content 
                        ? (article.content.substring(0, 150) + '...')
                        : 'No content generated yet. Click to start writing.'}
                    </div>
                  </CardContent>
                  <CardFooter className="pt-0 pb-4 border-t border-primary/5 mt-4">
                    <div className="flex items-center justify-between w-full pt-4">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(article.createdAt).toLocaleDateString()}
                      </span>
                      <Button variant="ghost" size="sm" className="h-8 text-primary group-hover:translate-x-1 transition-transform p-0">
                        Continue <ArrowRight className="h-3 w-3 ml-2" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="keywords" className="focus-visible:outline-none">
          <KeywordManager 
            projectId={projectId} 
            onSelectKeyword={(keyword) => {
              setActiveTab('articles');
              handleCreateArticle(keyword);
            }} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
