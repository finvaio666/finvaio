/**
 * lib/emailService.ts
 * Provider-agnostic email layer. Dispatches to Gmail or Outlook based on the
 * advisor's active email provider. All API routes should use THIS, not the
 * provider libs directly.
 */

import * as gmail from './gmail';
import * as outlook from './outlook';
import type { AdvisorConfig } from './getAdvisorConfig';
import type { EmailSummary, EmailThread, SendOptions, FollowUp } from './gmail';

export interface ActiveProvider {
  provider:  'gmail' | 'outlook';
  token:     string;
  address:   string;
  connected: boolean;
}

export function getActive(config: AdvisorConfig): ActiveProvider {
  const useOutlook = config.emailProvider === 'outlook' && !!config.outlookRefreshToken;
  return {
    provider:  useOutlook ? 'outlook' : 'gmail',
    token:     useOutlook ? config.outlookRefreshToken : config.gmailRefreshToken,
    address:   useOutlook ? config.outlookAddress      : config.gmailAddress,
    connected: useOutlook ? !!config.outlookRefreshToken : !!config.gmailRefreshToken,
  };
}

export function listEmails(config: AdvisorConfig, domains: string[], maxResults?: number): Promise<EmailSummary[]> {
  const a = getActive(config);
  return a.provider === 'outlook'
    ? outlook.listEmails(a.token, domains, a.address, maxResults ?? 50)
    : gmail.listEmails(a.token, domains, a.address, maxResults ?? 50);
}

export function getThread(config: AdvisorConfig, threadId: string): Promise<EmailThread> {
  const a = getActive(config);
  return a.provider === 'outlook'
    ? outlook.getThread(a.token, threadId, a.address)
    : gmail.getThread(a.token, threadId, a.address);
}

export function sendEmail(config: AdvisorConfig, opts: SendOptions): Promise<string> {
  const a = getActive(config);
  return a.provider === 'outlook'
    ? outlook.sendEmail(a.token, opts)
    : gmail.sendEmail(a.token, { ...opts, from: opts.from ?? a.address ?? undefined });
}

export function searchClientEmails(config: AdvisorConfig, domains: string[], clientName: string): Promise<EmailSummary[]> {
  const a = getActive(config);
  return a.provider === 'outlook'
    ? outlook.searchClientEmails(a.token, domains, a.address, clientName)
    : gmail.searchClientEmails(a.token, domains, a.address, clientName);
}

export function getRecentInbound(config: AdvisorConfig, domains: string[], days = 14, maxResults = 40): Promise<EmailSummary[]> {
  const a = getActive(config);
  return a.provider === 'outlook'
    ? outlook.getRecentInbound(a.token, domains, days, maxResults)
    : gmail.getRecentInbound(a.token, domains, days, maxResults);
}

export function getFollowUps(config: AdvisorConfig, domains: string[], overdueDays = 3): Promise<FollowUp[]> {
  const a = getActive(config);
  return a.provider === 'outlook'
    ? outlook.getFollowUps(a.token, domains, a.address, overdueDays)
    : gmail.getFollowUps(a.token, domains, a.address, overdueDays);
}

export function markThreadSeen(config: AdvisorConfig, threadId: string): Promise<void> {
  const a = getActive(config);
  return a.provider === 'outlook'
    ? outlook.markThreadSeen(a.token, threadId)
    : gmail.markThreadSeen(a.token, threadId);
}

export function closeThread(config: AdvisorConfig, messageId: string): Promise<void> {
  const a = getActive(config);
  return a.provider === 'outlook'
    ? outlook.closeThread(a.token, messageId)
    : gmail.closeThread(a.token, messageId);
}
