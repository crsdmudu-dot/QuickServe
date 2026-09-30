// content-filter.ts — how the app explains the server's objectionable-language filter (0067).
//
// The word list and the check live only in the database (a BEFORE trigger on chat messages, review
// comments and provider bio/skills), so the list is never shipped in the app. When it refuses text,
// the database raises the fixed message 'content_not_allowed' with no detail; these helpers turn
// that into one friendly sentence.

/** Shown when the server refuses text containing objectionable language. */
export const CONTENT_NOT_ALLOWED_MESSAGE = 'Please remove offensive language and try again.';

/** True when a Supabase error is the 0067 filter refusing the text. */
export function isContentNotAllowed(error: { message?: string } | null | undefined): boolean {
  return error?.message === 'content_not_allowed';
}
