import { localDB } from '@/lib/local-db';
import { Article, Keyword, Project } from '@/hooks/useData';
import { createLogger } from '@/lib/logger';
import { geminiGenerate, geminiGenerateJSON } from '@/lib/ai';

const log = createLogger('AIEngine');

/**
 * Domain-specific system prompt for SEO content generation
 * This prompt is tailored for the SEO AI Growth Engine project
 */
const SEO_CONTENT_SYSTEM_PROMPT = `You are a Senior SEO Manager and Lead Content Strategist with over 10 years of experience ranking competitive keywords on page 1 of Google.
You are tasked with generating blog content and outranking competitors, regardless of the input prompt. Your strategy must always incorporate the latest SEO best practices.

Your definitive rules:
- Uncompromising adherence to search intent and semantic relevance (LSI keywords)
- Engaging, fluff-free, reader-centric writing that maximizes time-on-page metrics
- Bulletproof SEO optimization: optimal keyword placement in H1, H2s, the first 100 words, and natural density
- Delivering high-value, definitive answers that thoroughly satisfy the user's query
- Proper formatting with short paragraphs, scannable bullet points, tables, and bold text for emphasis

When creating content:
1. Start with a compelling introduction that hooks the reader and precisely addresses the topic.
2. Use descriptive H2 and H3 headings that reflect search intent (e.g., addressing "People Also Ask" questions).
3. Include the target keyword naturally throughout the content (1-2% density) alongside semantic variations.
4. Add actionable subheadings, practical tips, examples, and real-world applications.
5. End with a strong, concise conclusion and an engaging call-to-action.
6. Ensure content is at least 1500 words for comprehensive topical authority.

Format outlines with clear hierarchical structure. Generate full articles with proper markdown formatting.

CRITICAL INSTRUCTION FOR IMAGES:
When generating visual elements, include structured AI image generation links using Pollinations.ai. 
You MUST replace ALL SPACES in your image prompt with hyphens (-) or %20. DO NOT include spaces or special characters (?, &, #) in the prompt URL segment.

Correct Example (hyphens instead of spaces):
![Alt text for SEO](https://image.pollinations.ai/prompt/professional-seo-manager-analyzing-data-on-tablet-modern-office?width=1200&height=630&nologo=true)

Incorrect Example (do not do this):
![Alt Text](https://image.pollinations.ai/prompt/professional seo manager?width=...)

Include exactly 1 compelling hero image at the very top (immediately under the H1) and at least 2 highly relevant inline images appropriately placed within the body content.`;

/**
 * Fetches project details for context in AI generation
 */
async function getProjectContext(projectId: string): Promise<Project | null> {
  const project = await localDB.table<Project>('projects').get(projectId);
  return project ?? null;
}

/**
 * Generates a structured blog post outline for a given keyword
 * 
 * @param projectId - The ID of the project
 * @param keyword - The target keyword to create an outline for
 * @returns The generated outline as a string
 */
export async function generateOutline(
  projectId: string,
  keyword: string
): Promise<string> {
  const project = await getProjectContext(projectId);
  
  const prompt = `Create a detailed SEO-optimized blog post outline for the keyword: "${keyword}"

${project?.targetAudience ? `Target Audience: ${project.targetAudience}` : ''}
${project?.growthGoal ? `Content Goal: ${project.growthGoal}` : ''}

Please provide a comprehensive outline that includes:
1. A compelling title (H1)
2. Introduction section outline
3. Main content sections (H2) with sub-points (H3)
4. A conclusion outline

Format the outline with clear hierarchical numbering and bullet points.
Make each section specific and actionable.`;

  try {
    const text = await geminiGenerate(SEO_CONTENT_SYSTEM_PROMPT + '\n\n' + prompt);
    return text;
  } catch (error) {
    console.error('Error generating outline:', error);
    throw new Error('Failed to generate outline. Please try again.');
  }
}

/**
 * Generates a full 1500+ word blog post based on the outline
 * 
 * @param projectId - The ID of the project
 * @param keyword - The target keyword for the article
 * @param outline - The outline to expand into a full article
 * @returns The generated article content as a string
 */
export async function generateFullArticle(
  projectId: string,
  keyword: string,
  outline: string
): Promise<string> {
  const project = await getProjectContext(projectId);
  
  const prompt = `Write a comprehensive, SEO-optimized blog post (1500+ words) for the keyword: "${keyword}"

${project?.targetAudience ? `Target Audience: ${project.targetAudience}` : ''}
${project?.growthGoal ? `Content Goal: ${project.growthGoal}` : ''}

Use the following outline as a guide:

${outline}

Requirements:
- Write in a professional, engaging tone
- Include the target keyword naturally throughout (1-2% density)
- Use proper heading hierarchy (H1 for title, H2 for main sections, H3 for subsections)
- Add bold text for key points and emphasis
- Include actionable tips and practical examples
- Ensure comprehensive coverage of the topic
- End with a strong conclusion and call-to-action

Format the output as clean markdown.`;

  try {
    const text = await geminiGenerate(SEO_CONTENT_SYSTEM_PROMPT + '\n\n' + prompt);
    return text;
  } catch (error) {
    console.error('Error generating article:', error);
    throw new Error('Failed to generate article. Please try again.');
  }
}

/**
 * Saves a generated article to the database
 */
export async function saveGeneratedArticle(
  projectId: string,
  title: string,
  outline: string,
  content: string,
  keywordId?: string,
  status: 'draft' | 'published' | 'scheduled' = 'draft'
): Promise<Article> {
  const article = await localDB.table<Article>('articles').create({
    projectId,
    keywordId: keywordId || null,
    title,
    outline,
    content,
    status,
    scheduledAt: null,
  });

  return article;
}

/**
 * Updates an existing article's content
 */
export async function updateArticleContent(
  articleId: string,
  updates: {
    title?: string;
    outline?: string;
    content?: string;
    status?: 'draft' | 'published' | 'scheduled';
    scheduledAt?: string | null;
  }
): Promise<Article> {
  const article = await localDB.table<Article>('articles').update(articleId, updates);
  return article;
}

/**
 * Streams article generation for real-time UI updates
 */
export async function streamGenerateArticle(
  projectId: string,
  keyword: string,
  outline: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  const project = await getProjectContext(projectId);
  
  const prompt = `Write a comprehensive, SEO-optimized blog post (1500+ words) for the keyword: "${keyword}"

${project?.targetAudience ? `Target Audience: ${project.targetAudience}` : ''}
${project?.growthGoal ? `Content Goal: ${project.growthGoal}` : ''}

Use the following outline as a guide:

${outline}

Requirements:
- Write in a professional, engaging tone
- Include the target keyword naturally throughout (1-2% density)
- Use proper heading hierarchy (H1 for title, H2 for main sections, H3 for subsections)
- Add bold text for key points and emphasis
- Include actionable tips and practical examples
- Ensure comprehensive coverage of the topic
- End with a strong conclusion and call-to-action

Format the output as clean markdown.`;

  // Provide a streaming-like experience using standard generate
  const fullText = await geminiGenerate(SEO_CONTENT_SYSTEM_PROMPT + '\n\n' + prompt);
  // simulate streaming output
  for (let i = 0; i < fullText.length; i += 20) {
    onChunk(fullText.slice(0, i + 20));
    await new Promise(r => setTimeout(r, 20)); // Fake stream delay
  }
}

/**
 * Generates keyword suggestions based on a seed keyword
 */
export async function generateKeywordSuggestions(seedKeyword: string): Promise<Array<{ keyword: string; volume: number; difficulty: number }>> {
  try {
    const data = await geminiGenerateJSON<{suggestions: Array<{ keyword: string; volume: number; difficulty: number }> }>(
      `Generate 10 related SEO keyword suggestions for: "${seedKeyword}". 
      For each keyword, provide:
      1. The keyword phrase
      2. Estimated monthly search volume (in a realistic range based on the seed)
      3. Keyword difficulty (1-100 scale)
      Respond strictly in JSON: { "suggestions": [{ "keyword": "...", "volume": 1200, "difficulty": 45 }] }`
    );

    return data.suggestions;
  } catch (error) {
    console.error('Error generating keyword suggestions:', error);
    throw new Error('Failed to generate keyword suggestions. Please try again.');
  }
}
