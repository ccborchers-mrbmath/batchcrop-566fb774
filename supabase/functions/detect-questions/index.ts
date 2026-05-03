// Detect mark-scheme question regions on a single page image using Gemini vision.
// Returns a list of { label, bbox (normalized 0..1), isContinuationFromPrev, continuesOnNext, confidence }.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM = `You analyze a single page image from a Cambridge exam mark scheme PDF.

Identify each "question region" on the page. A question region is the rectangular area that contains the answer/marks for a single question (or sub-question if labels like 1(a), 2(b)(ii) appear separately on the page).

Rules:
- A region STARTS at the top of its question number (or at the page top if it's a continuation of a question from the previous page).
- A region ENDS just before the next question's number, OR at the bottom of the page content (ignore page footer/header bars).
- Skip page headers, footers, page numbers, and column dividers — only return content regions.
- Bounding boxes must be NORMALIZED to 0..1 of the full page image (x, y from top-left, w, h are widths/heights).
- Pad each box slightly (about 1% on each side) so no content gets clipped.
- If the page begins mid-answer with no question number at the very top, set isContinuationFromPrev=true on that first region and use the best-guess label (or "" if unknown).
- If the last region on the page extends all the way to the bottom of the page content (no clear "end" before the footer), set continuesOnNext=true on that region.
- Use confidence 0..1 to indicate how certain you are.
- Return regions in TOP-TO-BOTTOM order.`;

interface Body {
  imageBase64: string; // raw base64, no data: prefix
  mimeType?: string;   // default image/png
  pageIndex: number;
  totalPages: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const userText = `This is page ${body.pageIndex + 1} of ${body.totalPages} of a Cambridge mark scheme. Detect every question region and return them via the detect_questions tool.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              {
                type: "image_url",
                image_url: {
                  url: `data:${body.mimeType || "image/png"};base64,${body.imageBase64}`,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "detect_questions",
              description: "Return all detected question regions on this page.",
              parameters: {
                type: "object",
                properties: {
                  regions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        label: { type: "string", description: "Question label, e.g. '1', '2(a)', '3(b)(ii)'. Empty string if unknown." },
                        bbox: {
                          type: "object",
                          properties: {
                            x: { type: "number" },
                            y: { type: "number" },
                            w: { type: "number" },
                            h: { type: "number" },
                          },
                          required: ["x", "y", "w", "h"],
                          additionalProperties: false,
                        },
                        isContinuationFromPrev: { type: "boolean" },
                        continuesOnNext: { type: "boolean" },
                        confidence: { type: "number" },
                      },
                      required: ["label", "bbox", "isContinuationFromPrev", "continuesOnNext", "confidence"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["regions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "detect_questions" } },
      }),
    });

    if (resp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit reached. Please wait a moment and try again." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (resp.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      return new Response(JSON.stringify({ error: `AI gateway error ${resp.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    let parsed: any = { regions: [] };
    if (typeof argsRaw === "string") {
      try { parsed = JSON.parse(argsRaw); } catch { parsed = { regions: [] }; }
    } else if (argsRaw && typeof argsRaw === "object") {
      parsed = argsRaw;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("detect-questions error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
