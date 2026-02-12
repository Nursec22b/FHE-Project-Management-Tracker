import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { config } from '../config';
import { query } from '../db/pool';
import { v4 as uuidv4 } from 'uuid';

interface EmailMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  body: { content: string; contentType: string };
  from: { emailAddress: { address: string; name: string } };
  toRecipients: Array<{ emailAddress: { address: string; name: string } }>;
  ccRecipients: Array<{ emailAddress: { address: string; name: string } }>;
  receivedDateTime: string;
  hasAttachments: boolean;
  internetMessageId: string;
}

interface EmailRule {
  id: string;
  name: string;
  target_board_id: string;
  target_list_id: string;
  from_addresses: string[] | null;
  from_domains: string[] | null;
  to_addresses: string[] | null;
  subject_contains: string[] | null;
  subject_not_contains: string[] | null;
  assign_to_user_ids: string[] | null;
  auto_labels: string[] | null;
}

let graphClient: Client | null = null;
let pollingInterval: NodeJS.Timeout | null = null;

function getGraphClient(): Client {
  if (graphClient) return graphClient;

  const credential = new ClientSecretCredential(
    config.azure.tenantId,
    config.azure.clientId,
    config.azure.clientSecret
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default'],
  });

  graphClient = Client.initWithMiddleware({ authProvider });
  return graphClient;
}

async function fetchUnreadEmails(mailbox: string): Promise<EmailMessage[]> {
  const client = getGraphClient();

  try {
    const response = await client
      .api(`/users/${mailbox}/messages`)
      .filter('isRead eq false')
      .select('id,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,internetMessageId')
      .orderby('receivedDateTime desc')
      .top(50)
      .get();

    return response.value || [];
  } catch (error) {
    console.error('Failed to fetch emails from Graph API:', error);
    return [];
  }
}

async function markEmailAsRead(mailbox: string, messageId: string): Promise<void> {
  const client = getGraphClient();

  try {
    await client
      .api(`/users/${mailbox}/messages/${messageId}`)
      .update({ isRead: true });
  } catch (error) {
    console.error(`Failed to mark email ${messageId} as read:`, error);
  }
}

async function getActiveRules(): Promise<EmailRule[]> {
  const result = await query(
    'SELECT * FROM email_rules WHERE is_active = true'
  );
  return result.rows;
}

function emailMatchesRule(email: EmailMessage, rule: EmailRule): boolean {
  const senderAddress = email.from.emailAddress.address.toLowerCase();
  const senderDomain = '@' + senderAddress.split('@')[1];
  const subject = email.subject?.toLowerCase() || '';
  const toAddresses = [
    ...email.toRecipients.map((r) => r.emailAddress.address.toLowerCase()),
    ...email.ccRecipients.map((r) => r.emailAddress.address.toLowerCase()),
  ];

  // Check from_addresses filter
  if (rule.from_addresses && rule.from_addresses.length > 0) {
    const match = rule.from_addresses.some(
      (addr) => senderAddress === addr.toLowerCase()
    );
    if (!match) return false;
  }

  // Check from_domains filter
  if (rule.from_domains && rule.from_domains.length > 0) {
    const match = rule.from_domains.some(
      (domain) => senderDomain === domain.toLowerCase()
    );
    if (!match) return false;
  }

  // Check to_addresses filter
  if (rule.to_addresses && rule.to_addresses.length > 0) {
    const match = rule.to_addresses.some((addr) =>
      toAddresses.includes(addr.toLowerCase())
    );
    if (!match) return false;
  }

  // Check subject_contains filter (any keyword match)
  if (rule.subject_contains && rule.subject_contains.length > 0) {
    const match = rule.subject_contains.some((keyword) =>
      subject.includes(keyword.toLowerCase())
    );
    if (!match) return false;
  }

  // Check subject_not_contains filter (none should match)
  if (rule.subject_not_contains && rule.subject_not_contains.length > 0) {
    const excluded = rule.subject_not_contains.some((keyword) =>
      subject.includes(keyword.toLowerCase())
    );
    if (excluded) return false;
  }

  return true;
}

async function isEmailAlreadyProcessed(internetMessageId: string): Promise<boolean> {
  const result = await query(
    'SELECT id FROM processed_emails WHERE email_message_id = $1',
    [internetMessageId]
  );
  return result.rows.length > 0;
}

async function createCardFromEmail(
  email: EmailMessage,
  rule: EmailRule
): Promise<string> {
  // Get the next card position in the target list
  const posResult = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM cards WHERE list_id = $1 AND is_archived = false',
    [rule.target_list_id]
  );
  const position = posResult.rows[0].next_pos;

  // Build card description from email
  const senderInfo = `**From:** ${email.from.emailAddress.name} <${email.from.emailAddress.address}>`;
  const dateInfo = `**Received:** ${new Date(email.receivedDateTime).toLocaleString()}`;
  const separator = '\n\n---\n\n';
  const description = `${senderInfo}\n${dateInfo}${separator}${email.bodyPreview}`;

  // Create the card
  const cardResult = await query(
    `INSERT INTO cards (list_id, title, description, position, source_email_id, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id`,
    [rule.target_list_id, email.subject || 'No Subject', description, position, email.internetMessageId]
  );
  const cardId = cardResult.rows[0].id;

  // Auto-assign users if configured
  if (rule.assign_to_user_ids && rule.assign_to_user_ids.length > 0) {
    for (const userId of rule.assign_to_user_ids) {
      await query(
        'INSERT INTO card_assignments (card_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [cardId, userId]
      );
    }
  }

  // Auto-apply labels if configured
  if (rule.auto_labels && rule.auto_labels.length > 0) {
    for (const labelId of rule.auto_labels) {
      await query(
        'INSERT INTO card_labels (card_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [cardId, labelId]
      );
    }
  }

  // Record processed email
  await query(
    'INSERT INTO processed_emails (email_message_id, rule_id, card_id) VALUES ($1, $2, $3)',
    [email.internetMessageId, rule.id, cardId]
  );

  // Log activity
  await query(
    `INSERT INTO activity_log (board_id, card_id, action, details)
     VALUES ($1, $2, $3, $4)`,
    [
      rule.target_board_id,
      cardId,
      'card_created_from_email',
      JSON.stringify({
        rule_name: rule.name,
        sender: email.from.emailAddress.address,
        subject: email.subject,
      }),
    ]
  );

  return cardId;
}

async function processEmails(): Promise<void> {
  const mailbox = config.email.monitoredMailbox;
  if (!mailbox) {
    return; // No mailbox configured, skip
  }

  try {
    const rules = await getActiveRules();
    if (rules.length === 0) return;

    const emails = await fetchUnreadEmails(mailbox);

    for (const email of emails) {
      // Skip if already processed
      if (await isEmailAlreadyProcessed(email.internetMessageId)) {
        continue;
      }

      // Check each rule
      for (const rule of rules) {
        if (emailMatchesRule(email, rule)) {
          try {
            const cardId = await createCardFromEmail(email, rule);
            console.log(
              `Created card ${cardId} from email "${email.subject}" via rule "${rule.name}"`
            );
            // Mark as read after successful processing
            await markEmailAsRead(mailbox, email.id);
            break; // Only match first rule per email
          } catch (err) {
            console.error(`Failed to create card from email "${email.subject}":`, err);
          }
        }
      }
    }
  } catch (error) {
    console.error('Email processing cycle failed:', error);
  }
}

export function startEmailPolling(): void {
  if (!config.azure.clientId || !config.azure.tenantId || !config.azure.clientSecret) {
    console.log('Azure credentials not configured. Email automation disabled.');
    return;
  }

  if (!config.email.monitoredMailbox) {
    console.log('No monitored mailbox configured. Email automation disabled.');
    return;
  }

  console.log(
    `Starting email automation. Polling ${config.email.monitoredMailbox} every ${config.email.pollIntervalMs / 1000}s`
  );

  // Initial run
  processEmails();

  // Set up polling interval
  pollingInterval = setInterval(processEmails, config.email.pollIntervalMs);
}

export function stopEmailPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('Email polling stopped.');
  }
}

// For manual trigger / testing
export { processEmails };
