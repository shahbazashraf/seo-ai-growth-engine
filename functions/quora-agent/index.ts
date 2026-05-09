import { createClient } from "npm:@blinkdotnew/sdk";
import { loadToken } from "../_shared/token-store.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ContentRecord {
  id: string;
  title?: string;
  excerpt?: string;
  metaDescription?: string;
  canonicalUrl?: string;
}

interface PostResult {
  success: boolean;
  platformPostId?: string;
  publishedUrl?: string;
  error?: string;
  postedAt?: string;
  matchedQuestion?: string;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function callAnthropic(prompt: string, fallback: string): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")?.trim();
  if (!apiKey) return fallback;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      temperature: 0.4,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return fallback;
  const data = await res.json().catch(() => ({}));
  const text = Array.isArray((data as any).content)
    ? (data as any).content.map((item: any) => item?.text || "").join("\n").trim()
    : "";
  return text || fallback;
}

async function loadCredentialsFromStore() {
  const token = await loadToken("quora");
  if (!token) return null;
  const email = token.accessToken || "";
  const password = token.refreshToken || "";
  if (!email || !password) return null;
  return { email, password };
}

async function findFirstVisible(page: any, selectors: string[]) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count().catch(() => 0)) {
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  const blink = createClient({
    projectId: Deno.env.get("BLINK_PROJECT_ID")!,
    secretKey: Deno.env.get("BLINK_SECRET_KEY")!,
  });

  try {
    const body = await req.json().catch(() => ({}));
    const contentId = String(body?.contentId || "");
    const topicHint = String(body?.topic || body?.keyword || "").trim();
    let quoraEmail = String(body?.quoraEmail || "").trim();
    let quoraPassword = String(body?.quoraPassword || "").trim();

    if (!contentId) return jsonResponse({ success: false, error: "contentId is required." }, 400);

    if (!quoraEmail || !quoraPassword) {
      const stored = await loadCredentialsFromStore();
      if (stored) {
        quoraEmail = stored.email;
        quoraPassword = stored.password;
      }
    }
    if (!quoraEmail || !quoraPassword) {
      return jsonResponse({ success: false, error: "Quora credentials not configured in Settings." }, 400);
    }

    const rows = await blink.db.table("content_lab").list({ where: { id: contentId }, limit: 1 });
    const content = (rows?.[0] || null) as ContentRecord | null;
    if (!content) return jsonResponse({ success: false, error: "Content not found." }, 404);

    const title = content.title || "Untitled";
    const excerpt = (content.excerpt || content.metaDescription || "").trim();
    const canonicalUrl = (content.canonicalUrl || "").trim();
    if (!canonicalUrl) return jsonResponse({ success: false, error: "Canonical URL is required before Quora posting." }, 400);

    const questionPrompt = `What Quora question would this article answer? Article: ${title}. ${excerpt}. Return just the question text.`;
    const generatedQuestion = await callAnthropic(
      questionPrompt,
      topicHint ? `What should founders know about ${topicHint}?` : `How can you apply ${title} in practice?`,
    );
    const searchQuery = generatedQuestion.replace(/^["'\s]+|["'\s]+$/g, "");

    const answerPrompt = `Write a Quora-style expert answer to '${searchQuery}'. Provide genuine value. Near the end, naturally reference: ${canonicalUrl} as a source. Do not make it promotional. Return only the answer text.`;
    const answerText = await callAnthropic(
      answerPrompt,
      `${excerpt}\n\nIn practice, the key is to apply this step-by-step and validate against real outcomes.\n\nA deeper walkthrough is available here: ${canonicalUrl}`,
    );

    let playwright: any;
    try {
      playwright = await import("playwright");
    } catch {
      return jsonResponse({
        success: false,
        error: "Quora automation requires the self-hosted version. Contact support.",
      });
    }

    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto("https://www.quora.com", { waitUntil: "domcontentloaded", timeout: 30000 });

      const avatar = await findFirstVisible(page, [
        "[data-testid='ProfilePhoto']",
        "img[alt*='profile']",
      ]);

      if (!avatar) {
        const emailInput = await findFirstVisible(page, [
          "input[type='email']",
          "input[name='email']",
        ]);
        const passwordInput = await findFirstVisible(page, [
          "input[type='password']",
          "input[name='password']",
        ]);
        if (!emailInput || !passwordInput) {
          await browser.close();
          return jsonResponse({ success: false, error: "Quora login failed. Check credentials in Settings." });
        }

        await emailInput.fill(quoraEmail);
        await passwordInput.fill(quoraPassword);

        const loginButton = await findFirstVisible(page, [
          "button:has-text('Login')",
          "button:has-text('Log In')",
          "button[type='submit']",
        ]);
        if (!loginButton) {
          await browser.close();
          return jsonResponse({ success: false, error: "Quora login failed. Check credentials in Settings." });
        }

        await Promise.all([
          page.waitForLoadState("domcontentloaded").catch(() => null),
          loginButton.click(),
        ]);

        const loggedInAvatar = await findFirstVisible(page, [
          "[data-testid='ProfilePhoto']",
          "img[alt*='profile']",
        ]);
        if (!loggedInAvatar) {
          await browser.close();
          return jsonResponse({ success: false, error: "Quora login failed. Check credentials in Settings." });
        }
      }

      await page.goto(`https://www.quora.com/search?q=${encodeURIComponent(searchQuery)}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      const topQuestion = await findFirstVisible(page, [
        "a[href*='/answer/']",
        "a[href*='/What-']",
        "a[href^='/']",
      ]);
      if (!topQuestion) {
        await browser.close();
        return jsonResponse({ success: false, error: "No matching Quora question found. Try different keywords." });
      }

      const matchedQuestion = (await topQuestion.innerText().catch(() => "")) || searchQuery;

      await Promise.all([
        page.waitForLoadState("domcontentloaded").catch(() => null),
        topQuestion.click(),
      ]);

      const answerButton = await findFirstVisible(page, [
        "button:has-text('Answer')",
        "[role='button']:has-text('Answer')",
      ]);
      if (!answerButton) {
        await browser.close();
        return jsonResponse({ success: false, error: "No matching Quora question found. Try different keywords." });
      }
      await answerButton.click();

      const editor = await findFirstVisible(page, [
        "[contenteditable='true']",
        "div[role='textbox']",
      ]);
      if (!editor) {
        await browser.close();
        return jsonResponse({ success: false, error: "No matching Quora question found. Try different keywords." });
      }

      await editor.click();
      await page.keyboard.type(answerText, { delay: 18 });

      const submitButton = await findFirstVisible(page, [
        "button:has-text('Post')",
        "button:has-text('Submit')",
        "button:has-text('Add Answer')",
      ]);
      if (!submitButton) {
        await browser.close();
        return jsonResponse({ success: false, error: "No matching Quora question found. Try different keywords." });
      }

      await Promise.all([
        page.waitForTimeout(1500),
        submitButton.click(),
      ]);

      const answerUrl = page.url();
      const postedAt = new Date().toISOString();

      await blink.db.table("distribution_logs").create({
        contentId,
        platform: "quora",
        mode: "social-snippet",
        status: "posted",
        publishedUrl: answerUrl,
        platformPostId: answerUrl,
        canonicalApplied: 0,
        postedAt,
        error: "",
      });

      await browser.close();

      const result: PostResult = {
        success: true,
        platformPostId: answerUrl,
        publishedUrl: answerUrl,
        postedAt,
        matchedQuestion,
      };
      return jsonResponse(result);
    } catch {
      await browser.close();
      return jsonResponse({ success: false, error: "No matching Quora question found. Try different keywords." });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
