import { openaiClient } from '../server';
import { VALIDATOR_MODEL } from './env';
import { getAllUserMessage } from './firebase-messages';
import { fetchImagesForSession } from './firebase-storage';
import { updateValidation } from './firebase-validation';

async function reviewUserIntentAgent(sessionId: string) {
  const allUserMessages = await getAllUserMessage(sessionId) || [];
  console.log("allUserMessages", allUserMessages)
  if (allUserMessages.length === 0) {
    console.warn("No user messages found for this session. Skipping summary generation.");
    return;
  }

  const contents = allUserMessages.map(message => message.content as string)

  console.log("constnet", contents)
  console.log("VALIDATOR_MODEL", VALIDATOR_MODEL)

  const formattedSteps = contents
    .map((msg: string, index: number) => `${index + 1}. ${msg.trim()}`)
    .join('\n');

  const inputPrompt = `
    You are an assistant reviewing a sequence of user interactions or instructions.
  
    Your task is to extract a **step-by-step list of meaningful platform actions** the user performed or is instructed to perform, in order.
  
    # Instructions:
    1. Write each step as a short, specific sentence, starting with a verb.
    2. Mask credentials/sensitive information or remove them.
    3. Include only **explicit UI actions** (e.g. "clicked a button") and **critical resulting states** (e.g. "language changed", "something created/updated/deleted").
    4. Break down every instruction with multiple UI actions into separate steps, even if they are in the same sentence.
    5. The only exception is if the actions are part of a single atomic flow (e.g., "create user and save" or "fill out form and submit"), in which case do not break.
    6. Do not infer, expand, or assume any context. Only include actions literally stated in the input.
    7. Ignore casual messages, greetings, or repeated confirmations.
    8. Preserve the original order of the instructions.
    9. Do **not summarize** — extract one step per line, and **preserve order**.
    10. Number each step clearly. Your output will be used to validate against screenshots.
    11. Do not summarize.
  
    # ⚠️ Example (what NOT to do):
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
      model: VALIDATOR_MODEL,
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

type StepResult = {
  status: 'passed' | 'failed' | 'invisible';
  reason: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );
}

const formatContextAsText = (context: Record<string, StepResult>): string => {
  return Object.entries(context)
    .filter(([_, r]) => r.status !== 'passed')
    .map(([step, r]) => `- ${step}: ${r.status} – ${r.reason}`)
    .join('\n');
};

export async function runValidationAgent(sessionId: string): Promise<any> {
  try {
    await updateValidation(sessionId, { agent: 'qa-validator' });
    const screenshotsBuffers = await fetchImagesForSession(sessionId);
    console.log("screenshotsBuffers", screenshotsBuffers);
    const batches = chunk(screenshotsBuffers, 3);
    const results: string[] = [];
    const runningContext: Record<string, StepResult> = {};
    const userSummary = await reviewUserIntentAgent(sessionId);
    if (!userSummary) {
      return {
        "steps": [
          { "step": "Failed to get user steps, Try again", "status": "failed", "explanation": "unable to get from AI" }
        ],
        "finalResult": "Fail"
      };
    }

    const systemPrompt = `

You are a QA validator responsible for evaluating a user's claim of completing a multi-step task using partial screenshots as evidence. Your task is to assess only the steps provided by the user without adding, inventing, or assuming any additional steps.

# ✅ Evaluation Rules:
- For each task step, assign one of the following statuses based solely on the visual evidence in the screenshots:
  - **passed**: The screenshot clearly shows the step's result, or the result could not have occurred without completing that step.
  - **failed**: The step was clearly attempted, but the result is incorrect, broken, or visibly incomplete.
  - **invisible**: The step is not shown, and there is no visible result to confirm it occurred.

# 📌 Strict Rules and Clarifications:
- **No step invention**: Only evaluate steps explicitly listed by the user. Do not evaluate or invent unlisted steps.
- **Running Context (Earlier screenshots showed)**: 
  - If a step was previously marked as **passed**, you may skip re-evaluating it unless contradictory evidence appears.
- **Visible results count**: 
  - You do not need to see the user typing, clicking, or navigating. If the result (e.g., a specific page, interface, modal, or a login screen) clearly implies that action occurred, that is enough to mark it as passed.
  - If a subsequent step is shown in provided screenshots, it indicates the previous step was completed successfully, and you can mark it as passed.
  - Saving or Creating or Updating or Chaning actions does not always trigger a popup or notification. Please check the subsequent screens (e.g., details pages or status labels) to confirm that the changes have been applied.
  - Immediate visual feedback (such as popups or modals) may not always appear after an action. To confirm the outcome, please refer to subsequent screens or indicators (e.g., labels, details pages, or status changes) that reflect the updated state.
  - Not all actions result in immediate visual confirmations like modals or popups. When assessing success or failure, please also consider subsequent screenshots that may reflect the outcome through updated UI elements such as labels, status indicators, or detail views. Avoid marking a failure solely based on the absence of an instant confirmation.
- **Do not require the address bar**: 
  - If a known page, app, or interface is clearly shown, assume the navigation occurred correctly. You do not need to see the browser's address bar.
  - ✅ If a known, specific webpage or interface is visible (e.g., sign-in page, landing page, login page, or logo is visible, etc.), you may assume the navigation to the correct URL occurred.
  - 🔴 Do NOT penalize steps for lack of address bar or explicit URL visibility.
  - 🔒 If a screen is unique to a domain, it is sufficient proof that the correct URL was visited.
- **Do not require visible user actions**: If a result appears that could only come from a specific user action (e.g., clicking a button, submitting a form, typing a URL), that is sufficient evidence. You do not need to see the action itself.
- **No guessing or speculation**: Only evaluate what is visible. Do not infer intent or missing steps. Do not assume a step was done just because a later one appears.
- **Only mark failed if clearly attempted and wrong**: A step is failed only if it is visibly attempted and the outcome is wrong or broken. If there is no visible evidence of a step being tried, mark it as invisible.

# ✅ Output Requirements (IMPORTANT — FOLLOW EXACTLY):
  Return ONLY a valid JSON object in the following strict format:

  {
    "steps": {
      "Step 1 description": { "status": "passed" | "failed" | "invisible", "reason": "brief reasoning here" },
      "Step 2 description": { "status": "passed" | "failed" | "invisible", "reason": "..." },
      ...
    }
  }
✅ Do NOT return explanations outside the JSON.
✅ Do NOT include extra commentary.
✅ Each step must be a key under "steps", with a nested object including both "status" and "reason".
✅ Do NOT return keys like "Step 1": "passed" — this is INVALID.
✅ Always return valid JSON — parseable, with all keys quoted properly.
- Do not assume failure for steps with no screenshots — just mark them invisible.
  `.trim();
    for (const batch of batches) {
      const images = batch.map((buf) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:image/jpeg;base64,${buf.toString('base64')}`,
        },
      }));
      const contextText = formatContextAsText(runningContext);

      const messages = [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: `The user claimed to perform the following steps: \n\n${userSummary} ` },
            ...(contextText ? [{ type: 'text' as const, text: `Earlier screenshots showed: \n\n${contextText} ` }] : []),
            ...images,
          ],
        },
      ];

      const response = await openaiClient.chat.completions.create({
        model: VALIDATOR_MODEL,
        messages: messages as any,
        max_tokens: 10000,
      });
      const batchResult = response.choices[0].message.content || '{}';
      let parsedBatchResult;
      try {
        parsedBatchResult = JSON.parse(batchResult);
      } catch (err) {
        console.log("batchResult", batchResult)
        const cleanContent = batchResult.replace(/```json\n ?|\n ? ```/g, '').trim();
        parsedBatchResult = JSON.parse(cleanContent);
      }
      // Merge results: only update for failed/invisible or first time
      for (const [step, result] of Object.entries<StepResult>(parsedBatchResult.steps)) {
        if (!runningContext[step] || runningContext[step].status !== 'passed') {
          runningContext[step] = result;
        }
      }

      results.push(batchResult);
    }

    console.log("finalresults", JSON.stringify(runningContext, null, 2));


    const finalSteps = Object.entries(runningContext).map(([step, { status, reason }]) => ({
      step,
      status,
      explanation: reason,
    }))

    const overallStatus = finalSteps.every(s => s.status === 'passed') ? 'Pass' : 'Fail';

    return {
      steps: finalSteps,
      finalResult: overallStatus
    }


    //   await updateValidation(sessionId, { agent: 'qa-reviewer' });

    //   // Merge all batch results into one final judgment
    //   const finalResponse = await openaiClient.chat.completions.create({
    //     model: VALIDATOR_MODEL, // vision-capable
    //     messages: [
    //       {
    //         role: "system",
    //         content: `
    //       You are a QA reviewer. You're given multiple partial validation results from different batches.

    //       # Your task is to:
    //       1. Combine all batches.
    //       2. For each step, apply these rules IN ORDER:
    //          a. If ANY batch shows "passed" → mark the step as "passed"
    //          b. If NO batch shows "passed" AND ALL remaining batches show "failed" → mark as "failed"
    //          c. Otherwise (when no pass and mix of failed/invisible) → mark as "invisible"

    //       3. For the finalResult, if any of the following are true, mark the finalResult as the corresponding value and return the finalResult:
    //          - Mark as "Pass" if ALL required steps provided by user are "passed"
    //          - Mark as "Fail" if ANY required steps provide by user is "failed"
    //          - Mark as "Incomplete" if NO steps are "failed" but some are "invisible"

    //       IMPORTANT: Return ONLY the raw JSON object. DO NOT wrap it in markdown code blocks (no \`\`\`json or \`\`\`).
    //       The response must start with { and end with } with no other characters before or after.

    //       #Response format:
    //       {
    //         "steps": [
    //           { "step": "Step description", "status": "passed|failed|invisible", "explanation": "why" },
    //           ...
    //         ],
    //         "finalResult": "Pass|Fail|Incomplete"
    //       }

    //       # Important rules:
    //       - A single "passed" status in any batch overrides all other statuses
    //       - Only mark as "failed" if ALL non-passed results are "failed" (no invisible)
    //       - When in doubt between "failed" and "invisible", choose "invisible"
    //       - Combine explanations from successful batches for "passed" steps
    //       - For "failed" steps, explain what went wrong
    //       - For "invisible" steps, explain what evidence was missing

    //       Remember: Return ONLY the raw JSON with no markdown formatting or additional text.
    // `.trim()
    //       },
    //       {
    //         role: "user",
    //         content: results.join("\n\n---\n\n")
    //       }
    //     ],
    //     max_tokens: 10000
    //   });

    //   const content = finalResponse.choices[0].message.content || '{}';

    //   console.log("finalResponse.choices[0].message.content", content);

    //   let data;
    //   try {
    //     // First try parsing the content directly
    //     try {
    //       data = JSON.parse(content!);
    //     } catch (err) {
    //       // If direct parsing fails, try cleaning markdown formatting
    //       const cleanContent = content!.replace(/```json\n?|\n?```/g, '').trim();
    //       data = JSON.parse(cleanContent);
    //     }

    //     console.log("Steps:", data);
    //     return data;
    //   } catch (err) {
    //     console.error("❌ Failed to parse GPT JSON output:", content);
    //     throw err;
    //   }
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
