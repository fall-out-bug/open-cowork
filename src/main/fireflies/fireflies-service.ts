/**
 * @module main/fireflies/fireflies-service
 *
 * Fireflies.ai integration service.
 *
 * Responsibilities:
 * - Fetch transcripts from Fireflies GraphQL API
 * - Store transcripts in SQLite
 * - Import transcripts as sessions
 */
import type { DatabaseInstance } from '../db/database';
import type { FirefliesConfig, FirefliesTranscript, ServerEvent } from '../../renderer/types';
import { log, logError } from '../utils/logger';

const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql';

const TRANSCRIPTS_QUERY = `
  query Transcripts($limit: Int, $skip: Int) {
    transcripts(limit: $limit, skip: $skip) {
      id
      title
      date
      duration
      participants
      summary {
        keywords
        action_items
        outline
        shorthand_bullet
        overview
        bullet_gist
        gist
        short_summary
        short_overview
        meeting_type
        topics_discussed
        transcript_chapters
      }
      sentences {
        speaker_name
        text
      }
    }
  }
`;

export class FirefliesService {
  private db: DatabaseInstance;
  private sendToRenderer: (event: ServerEvent) => void;

  constructor(db: DatabaseInstance, sendToRenderer: (event: ServerEvent) => void) {
    this.db = db;
    this.sendToRenderer = sendToRenderer;
    log('[FirefliesService] Initialized');
  }

  private async firefliesRequest<T>(apiKey: string, query: string, variables?: Record<string, unknown>): Promise<T | null> {
    try {
      const response = await fetch(FIREFLIES_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        logError('[FirefliesService] API error:', response.status, response.statusText);
        return null;
      }

      const data = await response.json() as { data?: T; errors?: unknown[] };
      if (data.errors) {
        logError('[FirefliesService] GraphQL errors:', data.errors);
        return null;
      }

      return data.data ?? null;
    } catch (error) {
      logError('[FirefliesService] Request failed:', error);
      return null;
    }
  }

  async testConnection(apiKey: string): Promise<boolean> {
    const data = await this.firefliesRequest<{ transcripts: unknown[] }>(apiKey, TRANSCRIPTS_QUERY, { limit: 1, skip: 0 });
    return data !== null && Array.isArray(data.transcripts);
  }

  saveConfig(apiKey: string, connected: boolean): void {
    this.db.firefliesConfig.save({
      id: 1,
      api_key: apiKey,
      connected: connected ? 1 : 0,
      last_synced_at: connected ? Date.now() : null,
    });

    this.sendToRenderer({
      type: 'fireflies.config',
      payload: { apiKey, connected, lastSyncedAt: connected ? Date.now() : null },
    });
  }

  getConfig(): FirefliesConfig | null {
    const row = this.db.firefliesConfig.get();
    if (!row) return null;

    return {
      apiKey: row.api_key,
      connected: row.connected === 1,
      lastSyncedAt: row.last_synced_at,
    };
  }

  deleteConfig(): void {
    this.db.firefliesConfig.delete();
    this.sendToRenderer({
      type: 'fireflies.config',
      payload: null,
    });
  }

  async fetchTranscripts(apiKey: string, limit = 50, skip = 0): Promise<FirefliesTranscript[]> {
    const data = await this.firefliesRequest<{
      transcripts: Array<{
        id: string;
        title: string;
        date: string;
        duration: number;
        participants: string[];
        summary?: {
          short_summary?: string;
          action_items?: string[];
          outline?: string[];
        };
        sentences?: Array<{ speaker_name: string; text: string }>;
      }>;
    }>(apiKey, TRANSCRIPTS_QUERY, { limit, skip });

    if (!data?.transcripts) {
      return [];
    }

    const transcripts: FirefliesTranscript[] = data.transcripts.map((t) => {
      const transcriptText = t.sentences
        ?.map((s) => `${s.speaker_name}: ${s.text}`)
        .join('\n') ?? '';

      return {
        id: t.id,
        title: t.title,
        date: t.date,
        duration: t.duration,
        participants: t.participants ?? [],
        summary: t.summary?.short_summary,
        actionItems: t.summary?.action_items,
        questions: t.summary?.outline,
        transcriptText,
        sourceUrl: `https://app.fireflies.ai/meetings/${t.id}`,
        importedAt: Date.now(),
      };
    });

    // Save to database
    for (const transcript of transcripts) {
      this.db.firefliesTranscripts.create({
        id: transcript.id,
        title: transcript.title,
        date: transcript.date,
        duration: transcript.duration,
        participants: JSON.stringify(transcript.participants),
        summary: transcript.summary ?? null,
        action_items: transcript.actionItems ? JSON.stringify(transcript.actionItems) : null,
        questions: transcript.questions ? JSON.stringify(transcript.questions) : null,
        transcript_text: transcript.transcriptText ?? null,
        source_url: transcript.sourceUrl ?? null,
        imported_at: transcript.importedAt,
      });
    }

    // Update last synced
    this.saveConfig(apiKey, true);

    this.sendToRenderer({
      type: 'fireflies.transcripts',
      payload: { transcripts },
    });

    log('[FirefliesService] Fetched', transcripts.length, 'transcripts');
    return transcripts;
  }

  loadTranscripts(): FirefliesTranscript[] {
    const rows = this.db.firefliesTranscripts.getAll();
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      date: row.date,
      duration: row.duration,
      participants: JSON.parse(row.participants) as string[],
      summary: row.summary ?? undefined,
      actionItems: row.action_items ? (JSON.parse(row.action_items) as string[]) : undefined,
      questions: row.questions ? (JSON.parse(row.questions) as string[]) : undefined,
      transcriptText: row.transcript_text ?? undefined,
      sourceUrl: row.source_url ?? undefined,
      importedAt: row.imported_at,
    }));
  }

  deleteTranscript(transcriptId: string): void {
    this.db.firefliesTranscripts.delete(transcriptId);
    this.sendToRenderer({
      type: 'fireflies.transcriptDeleted',
      payload: { transcriptId },
    });
  }

  clearTranscripts(): void {
    this.db.firefliesTranscripts.deleteAll();
    this.sendToRenderer({
      type: 'fireflies.transcriptsCleared',
      payload: {},
    });
  }
}
