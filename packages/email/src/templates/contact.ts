export interface ContactMessageInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

/** HTML + text bodies for the internal "new contact form submission" notice. */
export function renderContactNotification(input: ContactMessageInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `[Contact] ${input.subject}`;
  const text = [
    "New contact form submission",
    "",
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Subject: ${input.subject}`,
    "",
    input.message,
  ].join("\n");

  const html = `
    <div style="font-family: Georgia, serif; line-height: 1.5; color: #111;">
      <h2 style="margin: 0 0 1rem;">New contact form submission</h2>
      <p><strong>Name:</strong> ${escapeHtml(input.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
      <hr style="border: none; border-top: 1px solid #ccc; margin: 1.25rem 0;" />
      <p style="white-space: pre-wrap;">${escapeHtml(input.message)}</p>
    </div>
  `.trim();

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
