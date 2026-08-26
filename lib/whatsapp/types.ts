export type WhatsAppInboundText = {
  messageId: string;
  from: string;
  timestamp: string;
  text: string;
  contactName?: string;
  messageType?: string;
  phoneNumberId?: string;
};

export type WhatsAppChatRole = "user" | "assistant";

export type WhatsAppChatMessage = {
  role: WhatsAppChatRole;
  content: string;
  at: string;
  /** Present on admin replies sent from the dashboard. */
  source?: "ai" | "human";
};

export type WhatsAppLeadStatus =
  | "new"
  | "qualifying"
  | "hot"
  | "handed_off"
  | "closed";

export type WhatsAppLeadFields = {
  name: string;
  businessName: string;
  email: string;
  phone: string;
  industry: string;
  notes: string;
  interested: boolean | null;
};

export type WhatsAppLead = {
  waId: string;
  contactName: string;
  status: WhatsAppLeadStatus;
  fields: WhatsAppLeadFields;
  messages: WhatsAppChatMessage[];
  processedMessageIds: string[];
  notifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppSalesBotResult = {
  reply: string;
  fields: WhatsAppLeadFields;
  status: WhatsAppLeadStatus;
  readyForHandoff: boolean;
};

export type WhatsAppWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          profile?: { name?: string };
          wa_id?: string;
        }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string; payload?: string };
          interactive?: {
            type?: string;
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
        }>;
        statuses?: unknown[];
      };
    }>;
  }>;
};
