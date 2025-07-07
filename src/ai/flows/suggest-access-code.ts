'use server';

/**
 * @fileOverview A flow that suggests memorable access codes using an LLM.
 *
 * - suggestAccessCode - A function that suggests access codes.
 * - SuggestAccessCodeInput - The input type for the suggestAccessCode function.
 * - SuggestAccessCodeOutput - The return type for the suggestAccessCode function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestAccessCodeInputSchema = z.object({
  topic: z.string().describe('The topic for which the access code will be used.'),
});

export type SuggestAccessCodeInput = z.infer<typeof SuggestAccessCodeInputSchema>;

const SuggestAccessCodeOutputSchema = z.object({
  accessCode: z.string().describe('A suggested memorable access code.'),
});

export type SuggestAccessCodeOutput = z.infer<typeof SuggestAccessCodeOutputSchema>;

export async function suggestAccessCode(input: SuggestAccessCodeInput): Promise<SuggestAccessCodeOutput> {
  return suggestAccessCodeFlow(input);
}

const suggestAccessCodePrompt = ai.definePrompt({
  name: 'suggestAccessCodePrompt',
  input: {schema: SuggestAccessCodeInputSchema},
  output: {schema: SuggestAccessCodeOutputSchema},
  prompt: `Suggest a memorable access code related to the topic: {{{topic}}}. The access code should be a single word or a short phrase that is easy to remember and share.`,
});

const suggestAccessCodeFlow = ai.defineFlow(
  {
    name: 'suggestAccessCodeFlow',
    inputSchema: SuggestAccessCodeInputSchema,
    outputSchema: SuggestAccessCodeOutputSchema,
  },
  async input => {
    const {output} = await suggestAccessCodePrompt(input);
    return output!;
  }
);
