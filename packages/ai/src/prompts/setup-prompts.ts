// Trip setup prompts: the guide's private availability ask, its reply intent and the must-do fit note.
export {
  ASK_REPLY_QUESTIONS,
  ASK_REPLY_ROUTE,
  ASK_ROUTE,
  fillAskLine,
  readAskReply,
  templateAskLine,
  validateAskLine,
  writeAskLine,
  type AskLineInput,
  type AskLineResult,
  type AskReplyIntent,
} from './availability-ask/prompt';
export {
  FIT_NOTE_ROUTE,
  templateFitNote,
  validateFitNote,
  writeFitNote,
  type FitNoteInput,
  type FitNoteReason,
  type FitNoteResult,
} from './fit-note/prompt';
