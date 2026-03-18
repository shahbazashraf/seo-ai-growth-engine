import { createClient } from "npm:@blinkdotnew/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const blink = createClient({
      projectId: Deno.env.get("BLINK_PROJECT_ID")!,
      secretKey: Deno.env.get("BLINK_SECRET_KEY")!,
    });

    console.log("Autonomous SEO Engine: Starting check...");

    // 1. Fetch active automation settings that are due for a run
    const now = new Date().toISOString();
    const activeSettings = await blink.db.table("automation_settings").list({
      where: {
        AND: [
          { isEnabled: "1" },
          { 
            OR: [
              { nextRunAt: null },
              { nextRunAt: { lte: now } }
            ]
          }
        ]
      }
    });

    console.log(`Found ${activeSettings.length} projects due for automation.`);

    const results = [];

    for (const settings of activeSettings) {
      try {
        const { projectId } = settings;
        console.log(`Processing project: ${projectId}`);

        // 2. Fetch project details
        const project = await blink.db.table("projects").get(projectId);
        if (!project) continue;

        // 3. Find or generate a keyword
        const keywords = await blink.db.table("keywords").list({
          where: { projectId },
          limit: 10
        });

        let targetKeyword = "";
        if (keywords.length > 0) {
          // Pick a random keyword for now (Phase 3 logic)
          targetKeyword = keywords[Math.floor(Math.random() * keywords.length)].keyword;
        } else {
          // Fallback to project niche if no keywords
          targetKeyword = `${project.name} growth strategies`;
        }

        console.log(`Target keyword: ${targetKeyword}`);

        // 4. Generate Outline
        const { text: outline } = await blink.ai.generateText({
          model: "google/gemini-3-flash",
          prompt: `Create a detailed SEO-optimized blog post outline for "${targetKeyword}" targeting ${project.targetAudience || 'general audience'}. Goal: ${project.growthGoal || 'organic growth'}.`
        });

        // 5. Generate Full Article
        const { text: content } = await blink.ai.generateText({
          model: "google/gemini-3-flash",
          prompt: `Write a 1500+ word SEO-optimized blog post for "${targetKeyword}" using this outline: ${outline}. Return in clean Markdown.`
        });

        // 6. Save Article
        const title = `Autonomous Post: ${targetKeyword}`;
        await blink.db.table("articles").create({
          projectId,
          title,
          outline,
          content,
          status: "draft", // Starts as draft for user review in Phase 3
        });

        // 7. Update automation state
        const nextRunAt = calculateNextRun(settings.frequency || 'weekly');
        await blink.db.table("automation_settings").update(settings.id, {
          lastRunAt: now,
          nextRunAt: nextRunAt.toISOString()
        });

        results.push({ projectId, status: "success", keyword: targetKeyword });
      } catch (err) {
        console.error(`Error processing project ${settings.projectId}:`, err);
        results.push({ projectId: settings.projectId, status: "error", error: err.message });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Critical Engine Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

function calculateNextRun(frequency: string): Date {
  const next = new Date();
  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (frequency === 'biweekly') {
    next.setDate(next.getDate() + 14);
  } else {
    // default weekly
    next.setDate(next.getDate() + 7);
  }
  return next;
}
