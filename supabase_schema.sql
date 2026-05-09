-- SEO AI Growth Engine — Comprehensive Supabase Schema

-- 1. Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  site_url TEXT,
  name TEXT NOT NULL,
  target_audience TEXT,
  growth_goal TEXT,
  primary_locale TEXT DEFAULT 'en',
  target_market TEXT DEFAULT 'global',
  cms_type TEXT,
  search_console_connected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Articles Table
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  keyword_id UUID,
  title TEXT,
  outline TEXT,
  content TEXT,
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  origin_site_url TEXT,
  canonical_url TEXT,
  published_url TEXT,
  distribution_mode TEXT,
  publish_target_type TEXT,
  syndication_policy TEXT,
  verification_status TEXT,
  provenance TEXT,
  publish_source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Audits Table
CREATE TABLE IF NOT EXISTS audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  score INTEGER,
  subScores JSONB,
  meta JSONB,
  headings JSONB,
  links JSONB,
  images JSONB,
  structuredData JSONB,
  keywordDensity JSONB,
  wordCount INTEGER,
  responseTime INTEGER,
  issues JSONB,
  recommendations JSONB,
  pageSpeedHints JSONB,
  screenshots JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Content Lab Table
CREATE TABLE IF NOT EXISTS content_lab (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  site_url TEXT,
  title TEXT,
  content TEXT,
  keywords JSONB,
  meta_description TEXT,
  word_count INTEGER,
  status TEXT DEFAULT 'draft',
  canonical_url TEXT,
  last_refreshed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Platform Credentials
CREATE TABLE IF NOT EXISTS platform_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  platform TEXT NOT NULL,
  iv TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- 6. Sites Table
CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  url TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  last_audit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Keywords Table
CREATE TABLE IF NOT EXISTS keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  keyword TEXT NOT NULL,
  volume INTEGER,
  difficulty INTEGER,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Distribution Logs
CREATE TABLE IF NOT EXISTS distribution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content_id UUID NOT NULL,
  platform TEXT NOT NULL,
  mode TEXT,
  status TEXT DEFAULT 'pending',
  published_url TEXT,
  platform_post_id TEXT,
  canonical_applied BOOLEAN DEFAULT FALSE,
  posted_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 9. Automation Settings
CREATE TABLE IF NOT EXISTS automation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  enabled BOOLEAN DEFAULT FALSE,
  frequency TEXT DEFAULT 'weekly',
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

-- 10. Backlinks Table
CREATE TABLE IF NOT EXISTS backlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  site_url TEXT NOT NULL,
  source_url TEXT NOT NULL,
  anchor_text TEXT,
  domain_authority INTEGER,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Backlink Opportunities
CREATE TABLE IF NOT EXISTS backlink_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  site_url TEXT NOT NULL,
  opportunity_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. SEO Actions
CREATE TABLE IF NOT EXISTS seo_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  project_id UUID,
  type TEXT NOT NULL,
  priority TEXT,
  status TEXT DEFAULT 'pending',
  impact INTEGER,
  effort INTEGER,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 13. Performance Snapshots
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  site_url TEXT NOT NULL,
  date DATE NOT NULL,
  score INTEGER,
  metrics JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 14. Indexation Records
CREATE TABLE IF NOT EXISTS "indexationRecords" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content_id UUID NOT NULL,
  url TEXT NOT NULL,
  status TEXT,
  "lastChecked" TIMESTAMPTZ,
  "nextCheckAt" TIMESTAMPTZ,
  "crawledAs" TEXT,
  "lastCrawlTime" TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 15. Ranking Snapshots
CREATE TABLE IF NOT EXISTS "rankingSnapshots" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content_id UUID NOT NULL,
  url TEXT NOT NULL,
  "snapshotDate" TIMESTAMPTZ,
  "topKeyword" TEXT,
  "topPosition" INTEGER,
  "avgPosition" NUMERIC,
  "totalClicks" INTEGER,
  "totalImpressions" INTEGER,
  "decayDetected" BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 16. Outreach Records
CREATE TABLE IF NOT EXISTS "outreachRecords" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  "campaignId" UUID,
  "targetUrl" TEXT,
  "targetEmail" TEXT,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'draft',
  "sentAt" TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 17. Run Logs
CREATE TABLE IF NOT EXISTS "runLogs" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  "runAt" TIMESTAMPTZ DEFAULT now(),
  "siteUrl" TEXT,
  status TEXT,
  "summary" TEXT,
  "details" JSONB
);

-- 18. Distribution Campaigns
CREATE TABLE IF NOT EXISTS "distributionCampaigns" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  "contentId" UUID NOT NULL,
  title TEXT,
  "scheduleMode" TEXT,
  timezone TEXT,
  "defaultTime" TEXT,
  status TEXT,
  "targetCount" INTEGER,
  "lastRunAt" TIMESTAMPTZ,
  "nextRunAt" TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 19. Distribution Campaign Targets
CREATE TABLE IF NOT EXISTS "distributionCampaignTargets" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  "campaignId" UUID NOT NULL,
  "contentId" UUID NOT NULL,
  platform TEXT,
  "targetKind" TEXT,
  "targetName" TEXT,
  "targetIdentifier" TEXT,
  mode TEXT,
  rationale TEXT,
  "riskLevel" TEXT,
  "requiresReview" BOOLEAN,
  status TEXT,
  "scheduledFor" TIMESTAMPTZ,
  "executedAt" TIMESTAMPTZ,
  "publishedUrl" TEXT,
  error TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 20. Generated Content
CREATE TABLE IF NOT EXISTS generated_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  site_url TEXT,
  title TEXT,
  content TEXT,
  keywords JSONB,
  meta_description TEXT,
  word_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 21. OAuth States (for temporary state mapping)
CREATE TABLE IF NOT EXISTS oauth_states (
  state UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS POLICIES (Row Level Security)
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Owner access" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Owner access" ON public.%I FOR ALL USING (auth.uid() = user_id)', t);
    END LOOP;
END $$;
