import { blink } from '@/blink/client';
import { Article, Keyword, Project } from '@/hooks/useData';

/**
 * Domain-specific system prompt for SEO content generation
 * This prompt is tailored for the SEO AI Growth Engine project
 */
const SEO_CONTENT_SYSTEM_PROMPT = `You are an expert SEO content strategist and copywriter specializing in creating high-ranking blog content.

Your expertise includes:
- Research-based content that satisfies search intent
- SEO-optimized structure with proper headings, keyword placement, and semantic relevance
- Engaging, reader-friendly writing that maintains high time-on-page metrics
- Data-backed insights and actionable advice
- Proper formatting with bullet points, tables, and visual elements

When creating content:
1. Start with a compelling introduction that hooks the reader and establishes the topic
2. Use descriptive H2 and H3 headings that reflect search intent
3. Include the target keyword naturally throughout the content (1-2% density)
4. Add subheadings that answer related questions and cover related topics
5. Include actionable tips, examples, and real-world applications
6. End with a strong conclusion and call-to-action
7. Ensure content is at least 1500 words for comprehensive coverage

Format outlines with clear hierarchical structure using numbering and bullet points.
Generate full articles with proper markdown formatting, including bold text for emphasis, lists for readability, and strategic keyword placement.

When mentioning visual elements, include structured AI image prompts like:
![Alt Text](https://image.pollinations.ai/prompt/YOUR_DETAILED_PROMPT_HERE?width=1200&height=630&nologo=true)
Ensure prompts are extremely descriptive and relevant to the surrounding text. Include at least 1 hero image at the top and 2 relevant inline images for long articles.`;

/**
 * Fetches project details for context in AI generation
 */
async function getProjectContext(projectId: string): Promise<Project | null> {
  const project = await blink.db.table<Project>('projects').get(projectId);
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
    const { text } = await blink.ai.generateText({
      model: 'google/gemini-3-flash',
      messages: [
        { role: 'system', content: SEO_CONTENT_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens: 2000,
      temperature: 0.7,
    });

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
    const { text } = await blink.ai.generateText({
      model: 'google/gemini-3-flash',
      messages: [
        { role: 'system', content: SEO_CONTENT_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4000,
      temperature: 0.7,
    });

    return text;
  } catch (error) {
    console.error('Error generating article:', error);
    throw new Error('Failed to generate article. Please try again.');
  }
}

/**
 * Saves a generated article to the database
 * 
 * @param projectId - The ID of the project
 * @param keywordId - The ID of the associated keyword (optional)
 * @param title - The article title
 * @param outline - The article outline
 * @param content - The full article content
 * @param status - The article status (default: 'draft')
 * @returns The created article
 */
export async function saveGeneratedArticle(
  projectId: string,
  title: string,
  outline: string,
  content: string,
  keywordId?: string,
  status: 'draft' | 'published' | 'scheduled' = 'draft'
): Promise<Article> {
  const article = await blink.db.table<Article>('articles').create({
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
 * 
 * @param articleId - The ID of the article to update
 * @param updates - The fields to update
 * @returns The updated article
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
  const article = await blink.db.table<Article>('articles').update(articleId, updates);
  return article;
}

/**
 * Streams article generation for real-time UI updates
 * 
 * @param projectId - The ID of the project
 * @param keyword - The target keyword
 * @param outline - The outline to expand
 * @param onChunk - Callback for each text chunk
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

  await blink.ai.streamText(
    {
      model: 'google/gemini-3-flash',
      messages: [
        { role: 'system', content: SEO_CONTENT_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens: 4000,
      temperature: 0.7,
    },
    onChunk
  );
}

/**
 * Generates keyword suggestions based on a seed keyword
 * 
 * @param seedKeyword - The seed keyword to generate suggestions from
 * @returns Array of suggested keywords with metadata
 */
export async function generateKeywordSuggestions(seedKeyword: string): Promise<Array<{ keyword: string; volume: number; difficulty: number }>> {
  try {
    const { object } = await blink.ai.generateObject({
      model: 'google/gemini-3-flash',
      prompt: `Generate 10 related SEO keyword suggestions for: "${seedKeyword}". 
      For each keyword, provide:
      1. The keyword phrase
      2. Estimated monthly search volume (in a realistic range based on the seed)
      3. Keyword difficulty (1-100 scale)`,
      schema: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                keyword: { type: 'string' },
                volume: { type: 'number' },
                difficulty: { type: 'number' }
              },
              required: ['keyword', 'volume', 'difficulty']
            }
          }
        },
        required: ['suggestions']
      }
    });

    return (object as any).suggestions;
  } catch (error) {
    console.error('Error generating keyword suggestions:', error);
    throw new Error('Failed to generate keyword suggestions. Please try again.');
  }
}
