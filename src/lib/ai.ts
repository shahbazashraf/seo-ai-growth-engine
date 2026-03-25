// ─── AI Helper (OpenRouter Primary, Gemini Fallback) ──────────────────────────
// Calls APIs directly from the browser, bypassing Blink edge functions.

const OPENROUTER_API_KEY = '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';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const GEMINI_API_KEY = 'AIzaSyBLvtJaPAo-kOdlh5XyNc-Y142A9y_sb6s';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; code?: number };
}

interface OpenRouterResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

async function fetchOpenRouter(prompt: string): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-chat',
      messages: [{ role: 'user', content: prompt }]
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error((errData as OpenRouterResponse).error?.message || `OpenRouter API error: HTTP ${res.status}`);
  }

  const data: OpenRouterResponse = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned empty response');
  return text;
}

async function fetchGemini(prompt: string, maxRetries = 3): Promise<string> {
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
      }),
    });

    if (res.status === 429 && attempt < maxRetries) {
      console.log(`Gemini rate limited, retrying in ${Math.pow(2, attempt + 1)}s...`);
      continue;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      lastError = (errData as GeminiResponse).error?.message || `Gemini API error: HTTP ${res.status}`;
      if (res.status === 429 && attempt === maxRetries) {
        throw new Error('Gemini API rate limited entirely.');
      }
      throw new Error(lastError);
    }

    const data: GeminiResponse = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned empty response');
    return text;
  }

  throw new Error(lastError || 'Gemini API failed after retries');
}

/**
 * Call AI API: Tries OpenRouter first, falls back to Gemini.
 * Maintained name `geminiGenerate` to avoid breaking existing imports.
 */
export async function geminiGenerate(prompt: string, maxRetries = 3): Promise<string> {
  try {
    console.log('Attempting OpenRouter generation...');
    return await fetchOpenRouter(prompt);
  } catch (err) {
    console.warn('OpenRouter failed, falling back to Gemini:', err);
    return await fetchGemini(prompt, maxRetries);
  }
}

/**
 * Call AI and parse the response as JSON.
 * Strips markdown code fences if present.
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
