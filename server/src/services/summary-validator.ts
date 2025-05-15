import { openaiClient } from '../server';
import { OPENAI_MODEL } from './env';
import { getAllUserMessage } from './firebase-messages';
import { fetchImagesForSession } from './firebase-storage';
import { updateValidation } from './firebase-validation';

async function reviewUserIntent(sessionId: string) {
  const allUserMessages = await getAllUserMessage(sessionId) || [];
  console.log("allUserMessages", allUserMessages)
  if (allUserMessages.length === 0) {
    console.warn("No user messages found for this session. Skipping summary generation.");
    return;
  }

  const contents = allUserMessages.map(message => message.content as string)

  console.log("constnet", contents)

  const formattedSteps = contents
    .map((msg: string, index: number) => `${index + 1}. ${msg.trim()}`)
    .join('\n');

    const inputPrompt = `
    You are an assistant reviewing a sequence of user interactions or instructions.
  
    Your task is to extract a **step-by-step list of meaningful platform actions** the user performed or is instructed to perform, in order.
  
    Instructions:
    1. Write each step as a short, specific sentence, starting with a verb.
    2. Include only **explicit UI actions** (e.g. "clicked a button") and **critical resulting states** (e.g. "language changed", "study created").
    3. Do **not add inferred or assumed steps** — extract only what is clearly written.
    4. Ignore casual messages, greetings, or repeated confirmations.
    5. Break down compound instructions into **individual steps**, and **preserve the order**.
    6. Do **not summarize** — extract one step per line, and **preserve order**.
    7. Number each step clearly. Your output will be used to validate against screenshots.
  
    ⚠️ Example (what NOT to do):
    Input: "1. go to https://youtube.com"
    ❌ Wrong: 
    1. Open a web browser.
    2. Navigate to https://youtube.com.
    ✅ Correct: 
    1. Navigate to https://youtube.com.
  
    Here are the original user messages/instructions:
    ${formattedSteps}
  
    Return the result as a clean numbered list of platform actions, with no added steps or assumptions.
  `.trim();


  try {
    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "user", content: inputPrompt }
      ],
      temperature: 0.5
    });

    console.log("Summary of User Intent:\n");

    console.log(completion.choices[0].message.content);
    return completion.choices[0].message.content
  } catch (error) {
    console.error("Error generating summary:", error);
  }
}


function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}

export async function validateScreenshots(sessionId: string): Promise<any> {
  try {
    await updateValidation(sessionId, { agent: 'qa-validator' });
    const screenshotsBuffers = await fetchImagesForSession(sessionId);
    console.log("screenshotsBuffers", screenshotsBuffers);
    const batches = chunk(screenshotsBuffers, 3);
    const results: string[] = [];
    const userSummary = await reviewUserIntent(sessionId);
    if (!userSummary) {
      return {
        "steps": [
          { "step": "Failed to get user steps, Try again", "status": "failed", "explanation": "unable to get from AI" }
        ],
        "finalResult": "Fail"
      };
    }

    const systemPrompt = `

You are a QA validator. The user claims to have completed a multi-step task. You are provided with partial screenshots as evidence. Just focus on the step provided by user dont hallucinate or create your own steps, just stick to steps provided by user.

For each step in the task, assign one of the following statuses based strictly on what is visible in the screenshots:

- **passed**: There is clear evidence that the step was performed successfully, or the expected result of the step is shown and could not have occurred without completing that step.

- **failed**: The step appears to have been attempted, but the result is incorrect, broken, or visibly incomplete.

- **invisible**: The step is not shown, and there is no visual result from it that can reasonably confirm it was done.

**Rules and Guidelines:**

1. **Visible results count**:
   - If the result of a step is clearly visible (e.g., a specific website or interface is shown), and this result could not appear without completing the step (such as navigating to a URL or clicking a button), you may mark the step as passed even if the triggering action (like typing in a URL) is not shown.

2. **No need to see the address bar**:
   - Do not require the address bar to be visible. If the content of a known web page, interface, or tool is unmistakably loaded on screen, this is sufficient proof that the correct navigation occurred.

3. **Do not require the triggering action to be visible**:
   - If the result of an action is clearly visible — such as a specific page, modal, or interface that could only appear by completing a prior step (e.g., clicking a button, navigating to a URL, submitting a form) — you may mark the step as passed, even if the triggering action itself is not shown.

4. **Do not infer user intent**:
   - Do not guess what might have happened. Only evaluate what is visually evident.

4. **Do not mark as failed unless attempted and wrong**:
   - Only mark a step as failed if it was clearly attempted and the outcome is incorrect, broken, or visibly incomplete. If there is no visible attempt, use invisible.

6. **No step invention**:
   - Do not invent or evaluate steps that are not part of the original task. Only assess listed steps.

Only return per-step status with reasoning. Do not summarize, speculate, or assume failure for missing steps.
  `.trim();
    let messages: any[] = [];
    let runningContext = '';
    for (const batch of batches) {
      const images = batch.map((buf) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:image/jpeg;base64,${buf.toString('base64')}`,
        },
      }));

      messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `The user claimed to perform the following steps:\n\n${userSummary}` },
            ...(runningContext
              ? [{ type: 'text' as const, text: `Earlier screenshots showed:\n\n${runningContext}` }]
              : []),
            ...images,
          ],
        },
      ];

      const response = await openaiClient.chat.completions.create({
        model: OPENAI_MODEL,
        messages: messages as any,
        max_tokens: 1000,
      });
      const batchResult = response.choices[0].message.content || '';
      results.push(batchResult);
      runningContext += `\n\n--- Batch result ---\n${batchResult}`;
      console.log("messages", JSON.stringify(messages, null, 2));
    }

    console.log("results", results);

    await updateValidation(sessionId, { agent: 'qa-reviewer' });

    // Merge all batch results into one final judgment
    const finalResponse = await openaiClient.chat.completions.create({
      model: "gpt-4o", // vision-capable
      messages: [
        {
          role: "system",
          content: `
        You are a QA reviewer. You're given multiple partial validation results from different batches.

        Your task is to:
        1. Combine all batches.
        2. For each step, apply these rules IN ORDER:
           a. If ANY batch shows "passed" → mark the step as "passed"
           b. If NO batch shows "passed" AND ALL remaining batches show "failed" → mark as "failed"
           c. Otherwise (when no pass and mix of failed/invisible) → mark as "invisible"
        
        3. For the finalResult, if any of the following are true, mark the finalResult as the corresponding value and return the finalResult:
           - Mark as "Pass" if ALL required steps provided by user are "passed"
           - Mark as "Fail" if ANY required steps provide by user is "failed"
           - Mark as "Incomplete" if NO steps are "failed" but some are "invisible"

        IMPORTANT: Return ONLY the raw JSON object. DO NOT wrap it in markdown code blocks (no \`\`\`json or \`\`\`).
        The response must start with { and end with } with no other characters before or after.
        
        Response format:
        {
          "steps": [
            { "step": "Step description", "status": "passed|failed|invisible", "explanation": "why" },
            ...
          ],
          "finalResult": "Pass|Fail|Incomplete"
        }

        Important rules:
        - A single "passed" status in any batch overrides all other statuses
        - Only mark as "failed" if ALL non-passed results are "failed" (no invisible)
        - When in doubt between "failed" and "invisible", choose "invisible"
        - Combine explanations from successful batches for "passed" steps
        - For "failed" steps, explain what went wrong
        - For "invisible" steps, explain what evidence was missing

        Remember: Return ONLY the raw JSON with no markdown formatting or additional text.
  `.trim()
        },
        {
          role: "user",
          content: results.join("\n\n---\n\n")
        }
      ],
      max_tokens: 10000
    });

    const content = finalResponse.choices[0].message.content || '{}';

    console.log("finalResponse.choices[0].message.content", content);

    let data;
    try {
      // First try parsing the content directly
      try {
        data = JSON.parse(content!);
      } catch (err) {
        // If direct parsing fails, try cleaning markdown formatting
        const cleanContent = content!.replace(/```json\n?|\n?```/g, '').trim();
        data = JSON.parse(cleanContent);
      }

      console.log("Steps:", data);
      return data;
    } catch (err) {
      console.error("❌ Failed to parse GPT JSON output:", content);
      throw err;
    }
  } catch (error) {
    console.error("Error during screenshot validation:", error);
    return {
      "steps": [
        { "step": "Failed to validate screenshots, Try again", "status": "failed", "explanation": "An error occurred during processing" }
      ],
      "finalResult": "Fail"
    };
  }

}
