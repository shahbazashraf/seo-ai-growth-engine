import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Sparkles, 
  Trash2, 
  BarChart3, 
  ArrowUpRight,
  Loader2,
  PlusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  useKeywords, 
  useCreateKeyword, 
  useDeleteKeyword,
  Keyword
} from '@/hooks/useData';
import { generateKeywordSuggestions } from '@/lib/ai-engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import toast from 'react-hot-toast';

interface KeywordManagerProps {
  projectId: string;
  onSelectKeyword?: (keyword: string) => void;
}

export function KeywordManager({ projectId, onSelectKeyword }: KeywordManagerProps) {
  const [newKeyword, setNewKeyword] = useState('');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ keyword: string; volume: number; difficulty: number }>>([]);

  const { data: keywords = [], isLoading } = useKeywords(projectId);
  const createKeyword = useCreateKeyword();
  const deleteKeyword = useDeleteKeyword();

  const handleAddKeyword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newKeyword.trim()) return;

    try {
      await createKeyword.mutateAsync({
        projectId,
        keyword: newKeyword.trim(),
        volume: Math.floor(Math.random() * 5000) + 500, // Mock volume for manual entry
        difficulty: Math.floor(Math.random() * 60) + 10, // Mock difficulty
      });
      setNewKeyword('');
    } catch (error) {
      // toast handled in hook
    }
  };

  const handleSuggestKeywords = async () => {
    if (!keywords.length && !newKeyword) {
      toast.error('Add at least one keyword or type a seed keyword to get suggestions');
      return;
    }

    const seed = newKeyword || (keywords[0]?.keyword);
    setIsSuggesting(true);
    try {
      const results = await generateKeywordSuggestions(seed);
      setSuggestions(results);
    } catch (error) {
      toast.error('Failed to get suggestions');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleAddSuggestion = async (suggestion: { keyword: string; volume: number; difficulty: number }) => {
    try {
      await createKeyword.mutateAsync({
        projectId,
        ...suggestion
      });
      setSuggestions(prev => prev.filter(s => s.keyword !== suggestion.keyword));
    } catch (error) {
      // error handled in hook
    }
  };

  const handleDelete = (id: string) => {
    deleteKeyword.mutate({ id, projectId });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4">
        <form onSubmit={handleAddKeyword} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Enter a target keyword..."
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={createKeyword.isPending}>
            {createKeyword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add
          </Button>
        </form>
        <Button 
          variant="outline" 
          onClick={handleSuggestKeywords} 
          disabled={isSuggesting}
          className="border-primary/20 hover:bg-primary/5 text-primary"
        >
          {isSuggesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          AI Suggestions
        </Button>
      </div>

      <AnimatePresence>
        {suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            {suggestions.map((s, i) => (
              <Card key={i} className="bg-secondary/50 border-primary/10 hover:border-primary/30 transition-colors group">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">{s.keyword}</p>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                      <span>Vol: {s.volume}</span>
                      <span>Diff: {s.difficulty}</span>
                    </div>
                  </div>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleAddSuggestion(s)}
                  >
                    <PlusCircle className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            <div className="col-span-full flex justify-end">
              <Button variant="link" size="sm" onClick={() => setSuggestions([])} className="text-muted-foreground">
                Clear suggestions
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Tracked Keywords
          </CardTitle>
          <CardDescription>
            Keywords you are targeting for this project.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Keyword</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : keywords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No keywords tracked yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  keywords.map((kw) => (
                    <TableRow key={kw.id} className="group">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {kw.keyword}
                          {onSelectKeyword && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => onSelectKeyword(kw.keyword)}
                              title="Generate content for this keyword"
                            >
                              <ArrowUpRight className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{kw.volume?.toLocaleString() || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={kw.difficulty && kw.difficulty > 50 ? 'destructive' : 'secondary'} className="bg-opacity-10">
                          {kw.difficulty || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleDelete(kw.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
