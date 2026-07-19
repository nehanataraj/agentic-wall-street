export type {
  EmailAddress,
  EmailClientConfig,
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from "./types.js";
export type {
  ContactAgentConfig,
  ContactTriageAction,
  ContactTriageCategory,
  ContactTriageResult,
} from "./agent/types.js";
export type { EmailAgentAction, EmailAgentSource } from "./graph/state.js";
export { createEmailClient, sendEmail } from "./client.js";
export { ConsoleEmailProvider } from "./providers/console.js";
export { ResendEmailProvider } from "./providers/resend.js";
export {
  renderContactAck,
  renderContactAutoReply,
  renderContactNotification,
  type ContactMessageInput,
} from "./templates/contact.js";
export { triageContactMessage, contactAgentConfigFromEnv } from "./agent/triage.js";
export {
  handleContactSubmission,
  type HandleContactInput,
  type HandleContactResult,
} from "./agent/handleContact.js";
export { buildEmailAgentGraph } from "./graph/workflow.js";
export { runEmailAgent, type RunEmailAgentInput, type RunEmailAgentResult } from "./graph/run.js";
export { handleInboundEmailWebhook } from "./inbound.js";
export { loadProductKnowledgeBase, KB_VERSION } from "./kb/load.js";
export { evaluateHardRules } from "./graph/nodes.js";
