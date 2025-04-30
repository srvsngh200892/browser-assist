import OpenAI from 'openai';
import { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_TIMEOUT } from '../config/env';

// Initialize OpenAI with a fallback key for testing if needed
export const openaiClient = new OpenAI({
    apiKey: OPENAI_API_KEY || "sk-dummy-key-for-testing-purposes-only",
    baseURL: OPENAI_BASE_URL,
    timeout: OPENAI_TIMEOUT
}); 