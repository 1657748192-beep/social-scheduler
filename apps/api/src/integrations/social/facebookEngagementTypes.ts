export type FacebookCapability = 'readComments' | 'replyComments' | 'readMessages' | 'replyMessages' | 'subscription';
export type CapabilityState = { status: 'available' | 'missing' | 'unknown'; reason?: string };
export type FacebookCapabilities = Record<FacebookCapability, CapabilityState>;
export type FacebookPage<T> = { items: T[]; nextCursor: string | null };
export type FacebookComment = { id: string; postId: string; text: string; senderId?: string; senderName?: string; timestamp: string; deleted?: boolean };
export type FacebookConversation = { id: string; counterpartyId: string; counterpartyName?: string; updatedAt: string };
export type FacebookMessage = { id: string; conversationId: string; senderId: string; recipientId: string; text: string; timestamp: string; inbound: boolean };
export type FacebookSendResult = { status: 'sent'; providerId: string } | { status: 'unknown'; diagnosticId: string };
