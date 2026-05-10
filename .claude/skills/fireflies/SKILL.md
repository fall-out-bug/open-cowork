---
name: fireflies
description: Fireflies.ai meeting transcript integration. Use when the user wants to connect to Fireflies.ai, fetch meeting transcripts, search through transcripts, import transcripts as chat sessions, or ask questions about meeting content. Triggers on: "fireflies", "meeting transcript", "connect fireflies", "fetch transcripts", "import meeting", "search transcripts", "meeting notes", "action items from meeting".
---

# Fireflies.ai Integration

This skill provides the agent with capabilities to interact with Fireflies.ai meeting transcripts.

## Capabilities

1. **Connect to Fireflies.ai** - Save API key and test connection
2. **Fetch transcripts** - Load meeting transcripts from Fireflies API
3. **Search transcripts** - Find specific meetings by title or content
4. **Import as session** - Convert a transcript into a chat session
5. **Answer questions** - Use transcript content to answer user questions about meetings

## When to Use This Skill

Use this skill when the user:
- Mentions "Fireflies" or "fireflies.ai"
- Talks about meeting transcripts, recordings, or notes
- Wants to import meeting content
- Asks about action items, summaries, or decisions from meetings
- Wants to search through past meetings

## Workflow

### 1. Check Connection Status

First, check if Fireflies is already connected by looking at the store state:
- `firefliesConfig` - contains `{ apiKey, connected, lastSyncedAt }` or `null`
- `firefliesTranscripts` - array of loaded transcripts

### 2. Connect (if not connected)

If not connected, ask the user for their Fireflies API key:
- Guide them to https://app.fireflies.ai/settings -> API key
- Use IPC event `fireflies.connect` with `{ apiKey }`
- On success, config is saved to SQLite and store is updated

### 3. Fetch Transcripts

Use IPC event `fireflies.fetchTranscripts` with `{ apiKey, limit, skip }`:
- Default limit: 50 transcripts
- Returns array of `FirefliesTranscript` objects
- Transcripts are saved to SQLite automatically

### 4. Search Transcripts

Search through loaded transcripts by:
- Title matching (case-insensitive)
- Content matching in summary, action items, or transcript text
- Date range filtering

### 5. Import as Session

To import a transcript as a chat session:
- Use IPC event `fireflies.importTranscript` with `{ transcriptId }`
- Creates a new session with title `[Fireflies] <meeting title>`
- Pre-populates with meeting content

### 6. Answer Questions About Meetings

When user asks about meeting content:
1. Search through `firefliesTranscripts` for relevant meetings
2. Read summary, action items, and transcript text
3. Provide accurate answers based on the data
4. Cite specific meetings by title and date

## Data Structure

```typescript
interface FirefliesTranscript {
  id: string;
  title: string;
  date: string;           // ISO date string
  duration: number;       // seconds
  participants: string[];
  summary?: string;       // Meeting summary
  actionItems?: string[]; // Action items list
  questions?: string[];   // Questions/discussion points
  transcriptText?: string; // Full transcript with speaker names
  sourceUrl?: string;     // Link to Fireflies app
  importedAt: number;     // Timestamp
}
```

## Error Handling

- **Invalid API key**: Inform user, ask them to verify at Fireflies settings
- **Network errors**: Retry once, then suggest checking connection
- **No transcripts**: Explain that no meetings were found in their account
- **Rate limiting**: Wait and retry with exponential backoff

## Best Practices

- Always check connection status before operations
- Cache transcripts locally (already handled by SQLite)
- When importing, include full context in the session prompt
- For questions about meetings, search all available data (summary + transcript)
- Respect user privacy - don't share transcript content outside the app
