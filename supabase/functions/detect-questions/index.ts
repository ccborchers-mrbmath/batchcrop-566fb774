// Detect mark-scheme question regions on a single page image using Gemini vision.
// Returns a list of { label, bbox (normalized 0..1), isContinuationFromPrev, continuesOnNext, confidence }.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_MARKSCHEME = `You analyze a single page image from a Cambridge exam mark scheme PDF.

The mark scheme is laid out as a table with columns: Question | Answer | Marks | Guidance.
Identify each "question region" — the rectangular slab of that table belonging to a single ROOT question number (1, 2, 3, …).

CRITICAL — group sub-parts together:
- All sub-parts of the same root number on the same page (e.g. 3(a) AND 3(b), or 4(a)(i) and 4(a)(ii)) MUST be returned as ONE region with label = the root number ("3", "4", …). Do NOT split sub-parts into separate boxes.
- A region therefore covers from the top border of the table row that begins root question N down to the bottom border of the last row before root question N+1 (or the bottom of the table if it's the last on the page).

CRITICAL — bounding box edges must lie ON the table's outer borders:
- TOP edge: exactly on the horizontal table rule above the question's first row (the dark line). Do NOT cut into the row above.
- BOTTOM edge: exactly on the horizontal table rule below the question's last row.
- LEFT edge: exactly on the leftmost vertical table rule (the outer left border of the "Question" column).
- RIGHT edge: exactly on the rightmost vertical table rule (the outer right border of the "Guidance" column).
- Do NOT pad — being slightly INSIDE the borders is better than slightly outside. The downstream code will snap to the nearest dark line.

Other rules:
- Skip page headers, footers, page numbers, column-header rows that just say "Question / Answer / Marks / Guidance", and any "BLANK PAGE" markers.
- Bounding boxes are NORMALIZED to 0..1 of the full page image (x, y from top-left).
- If the page begins mid-answer with no new root question number at the top, set isContinuationFromPrev=true and use the best-guess label of the question being continued (or "" if unknown).
- If the last region extends to the bottom of the table with no clear closing border before the footer, set continuesOnNext=true.
- Use confidence 0..1.
- Return regions in TOP-TO-BOTTOM order.`;

const SYSTEM_QUESTIONPAPER = `You analyze a single page image from a Cambridge exam QUESTION PAPER PDF.

Unlike a mark scheme, a question paper is NOT a table. It is prose: numbered questions (1, 2, 3, …) printed down the page, each starting with a bold question number at the left margin, and often containing sub-parts ((a), (b), (i), (ii)), diagrams, blank answer space, and mark allocations like "[3]" at the right.
Identify each "question region" — the full-width horizontal band belonging to a single ROOT question number.

CRITICAL — group sub-parts together:
- All sub-parts of the same root number (e.g. 3(a) AND 3(b)) MUST be returned as ONE region with label = the root number ("3", "4", …). Do NOT split sub-parts into separate boxes.
- A region covers from just ABOVE the root question number down to just above the NEXT root question number (or the bottom of the printed content on the page if it is the last question).
- INCLUDE everything that belongs to the question: its diagrams, the blank answer lines/space, and the "[marks]" annotations.

CRITICAL — bounding box edges land in the WHITESPACE, never through text or a diagram:
- TOP edge: in the blank gap just above the question number (do not clip the number or any text above wrongly).
- BOTTOM edge: in the blank gap just below the question's last content and just above the next question number.
- LEFT edge: at the very left of the printed text column (x ≈ the page's left text margin, typically a small value like 0.05). Do NOT crop into the question number.
- RIGHT edge: at the very right of the printed text column (typically x+w ≈ 0.95). Questions are full text-width.
- The downstream code snaps the top/bottom to the nearest blank (white) row, so it is fine to sit a little inside the gap.

Other rules:
- Skip page headers, footers, page numbers, exam-board boilerplate, and any "BLANK PAGE" markers.
- Bounding boxes are NORMALIZED to 0..1 of the full page image (x, y from top-left).
- If the page begins mid-question with no new root question number at the top, set isContinuationFromPrev=true and use the best-guess label of the question being continued (or "" if unknown).
- If the last region runs to the bottom of the page content and the question clearly continues on the next page, set continuesOnNext=true.
- Use confidence 0..1.
- Return regions in TOP-TO-BOTTOM order.`;

type DocType = "markscheme" | "questionpaper";

interface Body {
  imageBase64: string; // raw base64, no data: prefix
  mimeType?: string;   // default image/png
  pageIndex: number;
  totalPages: number;
  docType?: DocType;   // default "markscheme"
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

    const docType: DocType = body.docType === "questionpaper" ? "questionpaper" : "markscheme";
    const SYSTEM = docType === "questionpaper" ? SYSTEM_QUESTIONPAPER : SYSTEM_MARKSCHEME;
    const docLabel = docType === "questionpaper" ? "question paper" : "mark scheme";

    const userText = `This is page ${body.pageIndex + 1} of ${body.totalPages} of a Cambridge ${docLabel}. Detect every question region and return them via the detect_questions tool.`;

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
