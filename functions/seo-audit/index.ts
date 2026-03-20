import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AuditIssue {
  check: string;
  severity: "critical" | "warning" | "info";
  detail: string;
  passed: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalise URL
    let targetUrl = url.trim();
    if (!targetUrl.startsWith("http")) targetUrl = "https://" + targetUrl;

    const blink = createClient({
      projectId: Deno.env.get("BLINK_PROJECT_ID")!,
      secretKey: Deno.env.get("BLINK_SECRET_KEY")!,
    });

    const issues: AuditIssue[] = [];
    let score = 100;

    // --- Fetch the page ---
    const startTime = Date.now();
    let html = "";
    let fetchOk = false;
    try {
      const pageRes = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0 SEO-Audit-Bot/1.0" },
        signal: AbortSignal.timeout(12000),
        redirect: "follow",
      });
      html = await pageRes.text();
      fetchOk = pageRes.ok;
    } catch (e) {
      issues.push({
        check: "Page Reachability",
        severity: "critical",
        detail: `Could not fetch the URL: ${(e as Error).message}`,
        passed: false,
      });
      score -= 30;
    }

    const responseTime = Date.now() - startTime;

    // HTTPS check
    const isHttps = targetUrl.startsWith("https://");
    if (!isHttps) {
      issues.push({ check: "HTTPS", severity: "critical", detail: "Site is not using HTTPS. This hurts rankings and user trust.", passed: false });
      score -= 15;
    } else {
      issues.push({ check: "HTTPS", severity: "info", detail: "Site uses HTTPS. Good for security and rankings.", passed: true });
    }

    // Response time
    if (responseTime > 3000) {
      issues.push({ check: "Page Speed", severity: "critical", detail: `Page loaded in ${responseTime}ms (>3s is too slow — hurts Core Web Vitals).`, passed: false });
      score -= 12;
    } else if (responseTime > 1500) {
      issues.push({ check: "Page Speed", severity: "warning", detail: `Page loaded in ${responseTime}ms (aim for under 1.5s).`, passed: false });
      score -= 5;
    } else {
      issues.push({ check: "Page Speed", severity: "info", detail: `Page loaded in ${responseTime}ms. Fast!`, passed: true });
    }

    if (fetchOk && html) {
      // --- Title ---
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "";
      if (!title) {
        issues.push({ check: "Title Tag", severity: "critical", detail: "No <title> tag found. This is essential for SEO.", passed: false });
        score -= 15;
      } else if (title.length < 30) {
        issues.push({ check: "Title Length", severity: "warning", detail: `Title is too short (${title.length} chars). Aim for 30-60 characters.`, passed: false });
        score -= 6;
      } else if (title.length > 60) {
        issues.push({ check: "Title Length", severity: "warning", detail: `Title is too long (${title.length} chars, truncated in SERPs). Keep under 60 chars.`, passed: false });
        score -= 4;
      } else {
        issues.push({ check: "Title Tag", severity: "info", detail: `Title "${title.substring(0, 60)}" is well-optimized (${title.length} chars).`, passed: true });
      }

      // --- Meta Description ---
      const metaDescMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
      const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : "";
      if (!metaDesc) {
        issues.push({ check: "Meta Description", severity: "critical", detail: "No meta description found. Write one that compels clicks (120-160 chars).", passed: false });
        score -= 12;
      } else if (metaDesc.length < 120) {
        issues.push({ check: "Meta Description Length", severity: "warning", detail: `Meta description is short (${metaDesc.length} chars). Aim for 120-160.`, passed: false });
        score -= 4;
      } else if (metaDesc.length > 160) {
        issues.push({ check: "Meta Description Length", severity: "warning", detail: `Meta description may be truncated (${metaDesc.length} chars). Keep under 160.`, passed: false });
        score -= 3;
      } else {
        issues.push({ check: "Meta Description", severity: "info", detail: `Meta description is well-optimized (${metaDesc.length} chars).`, passed: true });
      }

      // --- H1 ---
      const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
      if (h1Matches.length === 0) {
        issues.push({ check: "H1 Tag", severity: "critical", detail: "No H1 tag found. Every page must have exactly one H1.", passed: false });
        score -= 10;
      } else if (h1Matches.length > 1) {
        issues.push({ check: "H1 Count", severity: "warning", detail: `Found ${h1Matches.length} H1 tags. Use exactly one H1 per page.`, passed: false });
        score -= 6;
      } else {
        issues.push({ check: "H1 Tag", severity: "info", detail: "Page has exactly one H1 tag. Good.", passed: true });
      }

      // --- Images without alt text ---
      const allImages = html.match(/<img[^>]+>/gi) || [];
      const imagesWithoutAlt = allImages.filter(img => !/alt=["'][^"']*["']/i.test(img) || /alt=["']["']/i.test(img));
      if (imagesWithoutAlt.length > 0) {
        const sev = imagesWithoutAlt.length >= 5 ? "critical" : "warning";
        issues.push({ check: "Image Alt Text", severity: sev, detail: `${imagesWithoutAlt.length} of ${allImages.length} images are missing alt text. Hurts accessibility and image SEO.`, passed: false });
        score -= Math.min(imagesWithoutAlt.length * 2, 10);
      } else if (allImages.length > 0) {
        issues.push({ check: "Image Alt Text", severity: "info", detail: `All ${allImages.length} images have alt text.`, passed: true });
      }

      // --- Canonical tag ---
      const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html);
      if (!hasCanonical) {
        issues.push({ check: "Canonical Tag", severity: "warning", detail: "No canonical tag. Add <link rel='canonical'> to prevent duplicate content issues.", passed: false });
        score -= 5;
      } else {
        issues.push({ check: "Canonical Tag", severity: "info", detail: "Canonical tag present. Good for preventing duplicate content.", passed: true });
      }

      // --- Word count ---
      const bodyTextMatch = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const wordCount = bodyTextMatch.split(/\s+/).filter(w => w.length > 2).length;
      if (wordCount < 300) {
        issues.push({ check: "Content Length", severity: "warning", detail: `Page has only ~${wordCount} words. Thin content can hurt rankings (aim for 600+).`, passed: false });
        score -= 8;
      } else if (wordCount < 600) {
        issues.push({ check: "Content Length", severity: "info", detail: `Page has ~${wordCount} words. Consider expanding to 800+ for better topical authority.`, passed: true });
      } else {
        issues.push({ check: "Content Length", severity: "info", detail: `Page has ~${wordCount} words. Good content depth.`, passed: true });
      }

      // --- Viewport meta ---
      const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
      if (!hasViewport) {
        issues.push({ check: "Mobile Viewport", severity: "warning", detail: "No viewport meta tag. Required for mobile-friendly rendering.", passed: false });
        score -= 5;
      } else {
        issues.push({ check: "Mobile Viewport", severity: "info", detail: "Viewport meta tag present. Good for mobile SEO.", passed: true });
      }

      // --- Open Graph ---
      const hasOg = /<meta[^>]+property=["']og:/i.test(html);
      if (!hasOg) {
        issues.push({ check: "Open Graph Tags", severity: "warning", detail: "No Open Graph tags. Add og:title, og:description, og:image for better social sharing.", passed: false });
        score -= 4;
      } else {
        issues.push({ check: "Open Graph Tags", severity: "info", detail: "Open Graph tags found. Good for social media visibility.", passed: true });
      }
    }

    // --- robots.txt ---
    const origin = new URL(targetUrl).origin;
    try {
      const robotsRes = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000) });
      if (robotsRes.ok) {
        issues.push({ check: "robots.txt", severity: "info", detail: "robots.txt is accessible and properly configured.", passed: true });
      } else {
        issues.push({ check: "robots.txt", severity: "warning", detail: "robots.txt not found or inaccessible. Create one to guide search engine crawlers.", passed: false });
        score -= 4;
      }
    } catch {
      issues.push({ check: "robots.txt", severity: "warning", detail: "Could not verify robots.txt. Ensure it exists at /robots.txt.", passed: false });
      score -= 3;
    }

    // --- sitemap.xml ---
    try {
      const sitemapRes = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(5000) });
      if (sitemapRes.ok) {
        issues.push({ check: "XML Sitemap", severity: "info", detail: "Sitemap found at /sitemap.xml. Good for search engine indexing.", passed: true });
      } else {
        issues.push({ check: "XML Sitemap", severity: "warning", detail: "No sitemap.xml found. Create one and submit to Google Search Console.", passed: false });
        score -= 5;
      }
    } catch {
      issues.push({ check: "XML Sitemap", severity: "warning", detail: "Could not verify sitemap.xml. Ensure it exists at /sitemap.xml.", passed: false });
      score -= 4;
    }

    // Clamp score
    score = Math.max(0, Math.min(100, score));

    // --- AI Recommendations via Blink AI ---
    const failedIssues = issues.filter(i => !i.passed);
    let recommendations: string[] = [];

    try {
      const issuesSummary = failedIssues.map(i => `[${i.severity.toUpperCase()}] ${i.check}: ${i.detail}`).join("\n");
      const { text } = await blink.ai.generateText({
        model: "google/gemini-3-flash",
        prompt: `You are an SEO expert. A website audit for "${targetUrl}" produced these issues:\n\n${issuesSummary}\n\nThe overall SEO score is ${score}/100.\n\nProvide EXACTLY 4 specific, actionable recommendations to improve this site's SEO. Return ONLY a valid JSON array of strings, no markdown, no extra text:\n["recommendation 1", "recommendation 2", "recommendation 3", "recommendation 4"]`,
      });

      // Extract JSON array from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        recommendations = JSON.parse(jsonMatch[0]);
      } else {
        recommendations = [
          "Fix all critical issues first — title, meta description, and H1 have the highest ranking impact.",
          "Enable HTTPS if not already active to secure your site and improve rankings.",
          "Add alt text to all images to improve accessibility and image search visibility.",
          "Create and submit an XML sitemap to Google Search Console for faster indexing.",
        ];
      }
    } catch (e) {
      console.error("AI recommendation error:", e);
      recommendations = [
        "Fix all critical issues first — they have the highest SEO impact.",
        "Ensure your title and meta description are within optimal character limits.",
        "Add alt text to all images for accessibility and image SEO.",
        "Submit an XML sitemap to Google Search Console.",
      ];
    }

    // Save to DB
    const wordCountFinal = html
      ? html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().split(/\s+/).filter(w => w.length > 2).length
      : 0;

    try {
      await blink.db.table("audits").create({
        url: targetUrl,
        score,
        issues: JSON.stringify(issues),
        recommendations: JSON.stringify(recommendations),
      });
    } catch (dbErr) {
      console.error("DB save error:", dbErr);
    }

    return new Response(
      JSON.stringify({ score, issues, recommendations, responseTime, wordCount: wordCountFinal }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Audit error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Audit failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
