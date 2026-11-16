export type Role = 'me' | 'other';
export interface Hypothesis { id: string; text: string }
export interface Thought { id: string; text: string; hypotheses: Hypothesis[] }
export interface Message { id: string; role: Role; text: string; eventDate: string; createdAt: string; thoughts: Thought[] }
export interface Category { id: string; name: string; color?: string }
export interface Chat { id: string; name: string; categoryId: string; createdAt: string; isDemo?: boolean; messages: Message[] }
export interface TrashItem { id: string; type: 'chats' | 'messages' | 'thought' | 'hypothesis'; label: string; summary: string; deletedAt: string; payload: unknown }
export interface Database { version: 1; categories: Category[]; chats: Chat[]; trash: TrashItem[]; seededAt?: string; _cloud?: {revision: number; dirty: boolean} }
export interface ViewState { active?: string | null; category: string; date: string; query: string; inQuery: string; showSearch: boolean; page: 'chats' | 'trash'; mobileChat: boolean; chatBatch: boolean; msgBatch: boolean; selectedChats: Set<string>; selectedMessages: Set<string>; edit: {type: 'message' | 'thought' | 'hypothesis'; id: string} | null; role: Role | 'thought'; thoughtFor: string | null; insertAfter: string | null; inlineCreate: {kind: 'message' | 'thought'; messageId: string; text: string; role: Role} | null }
export interface CloudState { user: {uid: string; email: string} | null; base: unknown; ready: boolean; busy: boolean; status: string; error: string; epoch: number; loading: boolean; pending: Database | null; saving: boolean; paused: boolean }
export interface AgentAccess { enabled: boolean; write: boolean; chatIds: Set<string> }
export interface RuntimeSnapshot { db: Database; state: ViewState; cloudState: CloudState; cloudGate: boolean; storageIssue: string; agentAccess: AgentAccess; draft: string }
export interface Runtime { start(): void; dispose(): void; getSnapshot(): RuntimeSnapshot; icons: Record<string, string>; categoryName(id: string): string; chatTitle(chat: Chat): string; categoryColor(id: string): string; avatarStyle(id: string): string; current(): Chat | undefined; filteredChats(): Chat[]; ym(date: string): string; month(date: string): string; cloudLabel(): string }
