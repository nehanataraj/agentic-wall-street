export type {
  EmailAddress,
  EmailClientConfig,
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from "./types.js";
export { createEmailClient, sendEmail } from "./client.js";
export { ConsoleEmailProvider } from "./providers/console.js";
export { ResendEmailProvider } from "./providers/resend.js";
export {
  renderContactNotification,
  type ContactMessageInput,
} from "./templates/contact.js";
