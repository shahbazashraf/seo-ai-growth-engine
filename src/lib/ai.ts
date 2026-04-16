// ─── AI Helper (OpenRouter Primary, Gemini Fallback) ──────────────────────────
// Keys are stored in browser localStorage. Set them via the Settings page.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function getOpenRouterKey(): string {
  return (localStorage.getItem('OPENROUTER_API_KEY') || '').trim();
}

function getGeminiKey(): string {
  return (localStorage.getItem('GEMINI_API_KEY') || '').trim();
}

/** Save API keys to localStorage (called from Settings page) */
export function saveAIKeys(openRouterKey: string, geminiKey: string) {
  if (openRouterKey.trim()) localStorage.setItem('OPENROUTER_API_KEY', openRouterKey.trim());
  if (geminiKey.trim()) localStorage.setItem('GEMINI_API_KEY', geminiKey.trim());
}

/** Get current saved keys (for displaying in Settings) */
export function getAIKeys() {
  return {
    openRouterKey: getOpenRouterKey(),
    geminiKey: getGeminiKey(),
  };
}

/** Check if at least one AI key is configured */
export function hasAIKeys(): boolean {
  return !!(getOpenRouterKey() || getGeminiKey());
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; code?: number };
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function fetchOpenRouter(prompt: string, maxRetries = 2): Promise<string> {
  const key = getOpenRouterKey();
  if (!key) throw new Error('OpenRouter API key not set. Go to Settings → AI Keys to add it.');

  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
          'HTTP-Referer': window.location.origin, // Required by OpenRouter
          'X-Title': 'SEO AI Engine', // Required by OpenRouter
        },
        body: JSON.stringify({
          // OpenRouter supports multiple models in array for automatic fallback
          // If DeepSeek is overloaded or rate limited, it automatically falls back!
          models: ['deepseek/deepseek-chat', 'google/gemini-2.5-flash', 'anthropic/claude-3-haiku'],
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(120000), // Increased from 15s to 120s
      });

      if (res.status === 429 && attempt < maxRetries) {
        console.log(`OpenRouter rate limited, retrying in ${Math.pow(2, attempt + 1)}s...`);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        try {
          const errData = JSON.parse(errText);
          lastError = (errData as OpenRouterResponse).error?.message || `OpenRouter API error: HTTP ${res.status}`;
        } catch {
          lastError = `OpenRouter API error: HTTP ${res.status} - ${errText || 'No detail'}`;
        }
        // Retry on server errors or rate limits
        if (attempt < maxRetries && (res.status >= 500 || res.status === 429 || res.status === 528 || res.status === 502)) {
          continue; 
        }
        throw new Error(lastError);
      }

      const data: OpenRouterResponse = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('OpenRouter returned empty response');
      return text;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        lastError = 'OpenRouter request timed out after 120s';
      } else {
        lastError = err.message || 'Unknown network error';
      }
      if (attempt === maxRetries) throw new Error(lastError);
    }
  }
  
  throw new Error(lastError || 'OpenRouter API failed after retries');
}

async function fetchGemini(prompt: string, maxRetries = 3): Promise<string> {
  const key = getGeminiKey();
  if (!key) throw new Error('Gemini API key not set. Go to Settings → AI Keys to add it.');

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`;
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`Gemini retry ${attempt}, waiting ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
        signal: AbortSignal.timeout(120000), // Increased from 15s to 120s
      });

      if (res.status === 429 && attempt < maxRetries) {
        console.log(`Gemini rate limited (429), retrying in ${Math.pow(2, attempt + 1)}s...`);
        continue;
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        lastError = (errData as GeminiResponse).error?.message || `Gemini API error: HTTP ${res.status}`;
        if (res.status === 429 && attempt === maxRetries) {
          throw new Error('Gemini API rate limited entirely.');
        }
        if (attempt < maxRetries && res.status >= 500) {
           continue; 
        }
        throw new Error(lastError);
      }

      const data: GeminiResponse = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini returned empty response');
      return text;
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        lastError = 'Gemini request timed out after 120s';
      } else {
        lastError = err.message || 'Unknown network error';
      }
      if (attempt === maxRetries) throw new Error(lastError);
    }
  }

  throw new Error(lastError || 'Gemini API failed after retries');
}

/**
 * Call AI API: Tries OpenRouter first, falls back to Gemini.
 */
export async function geminiGenerate(prompt: string, maxRetries = 3): Promise<string> {
  const hasRouter = !!getOpenRouterKey();
  const hasGemini = !!getGeminiKey();

  if (!hasRouter && !hasGemini) {
    throw new Error('No AI API keys configured. Go to Settings → AI Keys to add your OpenRouter or Gemini key.');
  }

  if (hasRouter) {
    try {
      return await fetchOpenRouter(prompt);
    } catch (err) {
      if (hasGemini) {
        console.warn('OpenRouter failed, falling back to Gemini:', err);
        return await fetchGemini(prompt, maxRetries);
      }
      throw err;
    }
  }

  return await fetchGemini(prompt, maxRetries);
}

/**
 * Generates an AI image URL based on a prompt.
 * Using pollinations.ai for reliable, free AI image generation via URL.
 */
export function generateAIImageUrl(prompt: string, width = 1200, height = 630): string {
  const seed = Math.floor(Math.random() * 1000000);
  const normalizedPrompt = encodeURIComponent(prompt.trim());
  return `https://image.pollinations.ai/prompt/${normalizedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
}

/**
 * Call AI and parse the response as JSON.
 */
export async function geminiGenerateJSON<T = unknown>(prompt: string, maxRetries = 3): Promise<T> {
  const text = await geminiGenerate(prompt, maxRetries);
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]) as T;
    throw new Error('Failed to parse AI response as JSON');
  }
}

