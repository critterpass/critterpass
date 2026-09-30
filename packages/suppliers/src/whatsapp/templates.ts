/**
 * The desk's WhatsApp Business message templates. Outside WhatsApp's 24-hour service window a
 * business may only start a conversation with a template Meta approved; inside it the approved text
 * goes as a plain message. The template wraps the traveller's approved text verbatim as its one
 * variable and says who is writing, so a vendor never mistakes the desk for the traveller.
 *
 * Registered in Meta's WhatsApp Manager (category UTILITY, language en):
 *   name: traveller_request
 *   body: "Hello from the CritterPass travel desk, writing for one of our travellers: {{1}}
 *          You can reply here."
 */
export const VENDOR_REQUEST_TEMPLATE = {
  name: 'traveller_request',
  language: 'en',
} as const;

/** WhatsApp caps a template variable at 1024 characters; our drafts stop at 1000. */
export const TEMPLATE_PARAM_MAX = 1024;
