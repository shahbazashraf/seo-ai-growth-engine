// ─── Gemini AI Helper ─────────────────────────────────────────────────────────
// Calls Google Gemini API directly from the browser, bypassing Blink edge functions.
// Includes automatic retry with exponential backoff for 429 rate-limit errors.

const GEMINI_API_KEY = 'AIzaSyBLvtJaPAo-kOdlh5XyNc-Y142A9y_sb6s';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string; code?: number };
}

/**
 * Call Gemini API with automatic retry on 429 rate-limit errors.
 * Returns the raw text response from the model.
 */
export async function geminiGenerate(prompt: string, maxRetries = 3): Promise<string> {
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (res.status === 429 && attempt < maxRetries) {
      console.log(`Gemini rate limited, retrying in ${Math.pow(2, attempt + 1)}s... (attempt ${attempt + 1}/${maxRetries})`);
      continue;
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      lastError = (errData as GeminiResponse).error?.message || `Gemini API error: HTTP ${res.status}`;
      if (res.status === 429 && attempt === maxRetries) {
        throw new Error('Gemini API rate limited. Please wait a moment and try again.');
      }
      throw new Error(lastError);
    }

    const data: GeminiResponse = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini returned empty response');
    }
    return text;
  }

  throw new Error(lastError || 'Gemini API failed after retries');
}

/**
 * Call Gemini and parse the response as JSON.
 * Strips markdown code fences if present.
 */
export async function geminiGenerateJSON<T = unknown>(prompt: string, maxRetries = 3): Promise<T> {
  const text = await geminiGenerate(prompt, maxRetries);
  // Strip markdown json fences
  const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try to extract JSON from text
    const jsonMatch = cleaned.match(/[\[{][\s\S]*[\]}]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
    throw new Error('Failed to parse AI response as JSON');
  }
}
