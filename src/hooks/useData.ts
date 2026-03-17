import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blink } from '@/blink/client';
import toast from 'react-hot-toast';

// Types based on database schema
export interface Project {
  id: string;
  userId: string;
  url: string;
  name: string;
  targetAudience: string | null;
  growthGoal: string | null;
  createdAt: string;
}

export interface Keyword {
  id: string;
  projectId: string;
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  createdAt: string;
}

export interface Article {
  id: string;
  projectId: string;
  keywordId: string | null;
  title: string | null;
  outline: string | null;
  content: string | null;
  status: 'draft' | 'published' | 'scheduled';
  scheduledAt: string | null;
  createdAt: string;
}

// Query keys
export const queryKeys = {
  projects: ['projects'] as const,
  project: (id: string) => ['projects', id] as const,
  keywords: (projectId: string) => ['keywords', projectId] as const,
  keyword: (id: string) => ['keywords', 'detail', id] as const,
  articles: (projectId: string) => ['articles', projectId] as const,
  article: (id: string) => ['articles', 'detail', id] as const,
};

// ==================== Projects ====================

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: async () => {
      const result = await blink.db.table<Project>('projects').list({
        orderBy: { createdAt: 'desc' },
      });
      return result;
    },
  });
}

export function useProject(id: string) {
  return useQuery<Project | null>({
    queryKey: queryKeys.project(id),
    queryFn: async () => {
      const result = await blink.db.table<Project>('projects').get(id);
      return result ?? null;
    },
    enabled: !!id,
  });
}

interface CreateProjectInput {
  url: string;
  name: string;
  targetAudience?: string;
  growthGoal?: string;
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation<Project, Error, CreateProjectInput>({
    mutationFn: async (input) => {
      const result = await blink.db.table<Project>('projects').create({
        url: input.url,
        name: input.name,
        targetAudience: input.targetAudience || null,
        growthGoal: input.growthGoal || null,
      });
      toast.success('Project created successfully!');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

interface UpdateProjectInput {
  id: string;
  url?: string;
  name?: string;
  targetAudience?: string;
  growthGoal?: string;
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation<Project, Error, UpdateProjectInput>({
    mutationFn: async (input) => {
      const result = await blink.db.table<Project>('projects').update(input.id, {
        url: input.url,
        name: input.name,
        targetAudience: input.targetAudience,
        growthGoal: input.growthGoal,
      });
      toast.success('Project updated successfully!');
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      queryClient.invalidateQueries({ queryKey: queryKeys.project(data.id) });
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation<string, Error, string>({
    mutationFn: async (id) => {
      await blink.db.table<Project>('projects').delete(id);
      toast.success('Project deleted successfully!');
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

// ==================== Keywords ====================

export function useKeywords(projectId: string) {
  return useQuery<Keyword[]>({
    queryKey: queryKeys.keywords(projectId),
    queryFn: async () => {
      const result = await blink.db.table<Keyword>('keywords').list({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      });
      return result;
    },
    enabled: !!projectId,
  });
}

export function useKeyword(id: string) {
  return useQuery<Keyword | null>({
    queryKey: queryKeys.keyword(id),
    queryFn: async () => {
      const result = await blink.db.table<Keyword>('keywords').get(id);
      return result ?? null;
    },
    enabled: !!id,
  });
}

interface CreateKeywordInput {
  projectId: string;
  keyword: string;
  volume?: number;
  difficulty?: number;
}

export function useCreateKeyword() {
  const queryClient = useQueryClient();

  return useMutation<Keyword, Error, CreateKeywordInput>({
    mutationFn: async (input) => {
      const result = await blink.db.table<Keyword>('keywords').create({
        projectId: input.projectId,
        keyword: input.keyword,
        volume: input.volume || null,
        difficulty: input.difficulty || null,
      });
      toast.success('Keyword added successfully!');
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.keywords(data.projectId) });
    },
  });
}

interface UpdateKeywordInput {
  id: string;
  projectId: string;
  keyword?: string;
  volume?: number;
  difficulty?: number;
}

export function useUpdateKeyword() {
  const queryClient = useQueryClient();

  return useMutation<Keyword, Error, UpdateKeywordInput>({
    mutationFn: async (input) => {
      const result = await blink.db.table<Keyword>('keywords').update(input.id, {
        keyword: input.keyword,
        volume: input.volume,
        difficulty: input.difficulty,
      });
      toast.success('Keyword updated successfully!');
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.keywords(data.projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.keyword(data.id) });
    },
  });
}

export function useDeleteKeyword() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string; projectId: string }, Error, { id: string; projectId: string }>({
    mutationFn: async (variables) => {
      await blink.db.table<Keyword>('keywords').delete(variables.id);
      toast.success('Keyword deleted successfully!');
      return variables;
    },
    onSuccess: (variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.keywords(variables.projectId) });
    },
  });
}

// ==================== Articles ====================

export function useArticles(projectId: string) {
  return useQuery<Article[]>({
    queryKey: queryKeys.articles(projectId),
    queryFn: async () => {
      const result = await blink.db.table<Article>('articles').list({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      });
      return result;
    },
    enabled: !!projectId,
  });
}

export function useArticle(id: string) {
  return useQuery<Article | null>({
    queryKey: queryKeys.article(id),
    queryFn: async () => {
      const result = await blink.db.table<Article>('articles').get(id);
      return result ?? null;
    },
    enabled: !!id,
  });
}

interface CreateArticleInput {
  projectId: string;
  keywordId?: string;
  title?: string;
  outline?: string;
  content?: string;
  status?: 'draft' | 'published' | 'scheduled';
  scheduledAt?: string;
}

export function useCreateArticle() {
  const queryClient = useQueryClient();

  return useMutation<Article, Error, CreateArticleInput>({
    mutationFn: async (input) => {
      const result = await blink.db.table<Article>('articles').create({
        projectId: input.projectId,
        keywordId: input.keywordId || null,
        title: input.title || null,
        outline: input.outline || null,
        content: input.content || null,
        status: input.status || 'draft',
        scheduledAt: input.scheduledAt || null,
      });
      toast.success('Article created successfully!');
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.articles(data.projectId) });
    },
  });
}

interface UpdateArticleInput {
  id: string;
  projectId: string;
  keywordId?: string;
  title?: string;
  outline?: string;
  content?: string;
  status?: 'draft' | 'published' | 'scheduled';
  scheduledAt?: string | null;
}

export function useUpdateArticle() {
  const queryClient = useQueryClient();

  return useMutation<Article, Error, UpdateArticleInput>({
    mutationFn: async (input) => {
      const result = await blink.db.table<Article>('articles').update(input.id, {
        keywordId: input.keywordId,
        title: input.title,
        outline: input.outline,
        content: input.content,
        status: input.status,
        scheduledAt: input.scheduledAt,
      });
      toast.success('Article updated successfully!');
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.articles(data.projectId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.article(data.id) });
    },
  });
}

export function useDeleteArticle() {
  const queryClient = useQueryClient();

  return useMutation<{ id: string; projectId: string }, Error, { id: string; projectId: string }>({
    mutationFn: async (variables) => {
      await blink.db.table<Article>('articles').delete(variables.id);
      toast.success('Article deleted successfully!');
      return variables;
    },
    onSuccess: (variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.articles(variables.projectId) });
    },
  });
}
