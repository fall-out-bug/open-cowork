import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '../../store';
import { useIPC } from '../../hooks/useIPC';
import {
  Mic,
  Link,
  Unlink,
  RefreshCw,
  Download,
  Trash2,
  Search,
  Calendar,
  Clock,
  Users,
  FileText,
  CheckSquare,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { FirefliesTranscript } from '../../types';

export function FirefliesPanel() {
  const { t } = useTranslation();
  const firefliesConfig = useAppStore((s) => s.firefliesConfig);
  const firefliesTranscripts = useAppStore((s) => s.firefliesTranscripts);
  const setFirefliesConfig = useAppStore((s) => s.setFirefliesConfig);
  const setFirefliesTranscripts = useAppStore((s) => s.setFirefliesTranscripts);
  const removeFirefliesTranscript = useAppStore((s) => s.removeFirefliesTranscript);
  const clearFirefliesTranscripts = useAppStore((s) => s.clearFirefliesTranscripts);
  const { invoke } = useIPC();

  const [apiKey, setApiKey] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  const connected = firefliesConfig?.connected ?? false;

  const handleConnect = useCallback(async () => {
    if (!apiKey.trim()) return;
    setIsConnecting(true);

    const result = await invoke<{ success: boolean }>({
      type: 'fireflies.connect',
      payload: { apiKey: apiKey.trim() },
    });

    if (result?.success) {
      setFirefliesConfig({
        apiKey: apiKey.trim(),
        connected: true,
        lastSyncedAt: null,
      });
      setApiKey('');
    }

    setIsConnecting(false);
  }, [apiKey, invoke, setFirefliesConfig]);

  const handleDisconnect = useCallback(async () => {
    await invoke({
      type: 'fireflies.disconnect',
      payload: {},
    });
    setFirefliesConfig(null);
    setFirefliesTranscripts([]);
  }, [invoke, setFirefliesConfig, setFirefliesTranscripts]);

  const handleFetch = useCallback(async () => {
    if (!firefliesConfig?.apiKey) return;
    setIsFetching(true);

    const transcripts = await invoke<FirefliesTranscript[]>({
      type: 'fireflies.fetchTranscripts',
      payload: { apiKey: firefliesConfig.apiKey, limit: 50 },
    });

    if (transcripts) {
      setFirefliesTranscripts(transcripts);
    }

    setIsFetching(false);
  }, [firefliesConfig, invoke, setFirefliesTranscripts]);

  const handleImport = useCallback(
    async (transcript: FirefliesTranscript) => {
      setImportingId(transcript.id);

      await invoke<{ id: string }>({
        type: 'fireflies.importTranscript',
        payload: { transcriptId: transcript.id },
      });

      setImportingId(null);
    },
    [invoke]
  );

  const handleDelete = useCallback(
    async (transcriptId: string) => {
      await invoke({
        type: 'fireflies.deleteTranscript',
        payload: { transcriptId },
      });
      removeFirefliesTranscript(transcriptId);
    },
    [invoke, removeFirefliesTranscript]
  );

  const handleClearAll = useCallback(async () => {
    await invoke({
      type: 'fireflies.clearTranscripts',
      payload: {},
    });
    clearFirefliesTranscripts();
  }, [invoke, clearFirefliesTranscripts]);

  const filteredTranscripts = firefliesTranscripts.filter((t) =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className="rounded-xl border border-border-subtle bg-background/60 p-4">
        <div className="flex items-center gap-3 mb-3">
          <Mic className="w-5 h-5 text-accent" />
          <h3 className="text-sm font-semibold text-text-primary">
            {t('fireflies.title')}
          </h3>
          {connected && (
            <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-success/10 text-success">
              {t('fireflies.connected')}
            </span>
          )}
        </div>

        <p className="text-[12px] text-text-muted mb-3">
          {t('fireflies.description')}
        </p>

        {!connected ? (
          <div className="space-y-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t('fireflies.enterApiKey')}
              className="w-full rounded-lg border border-transparent bg-surface px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border transition-colors"
            />
            <p className="text-[11px] text-text-muted">
              {t('fireflies.apiKeyHint')}
            </p>
            <button
              onClick={handleConnect}
              disabled={!apiKey.trim() || isConnecting}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
            >
              {isConnecting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Link className="w-3.5 h-3.5" />
              )}
              {t('fireflies.connect')}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleFetch}
              disabled={isFetching}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`}
              />
              {t('fireflies.fetchTranscripts')}
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3 py-2 rounded-lg text-[13px] font-medium text-error hover:bg-error/10 transition-colors"
            >
              <Unlink className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Transcripts list */}
      {connected && firefliesTranscripts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('fireflies.searchTranscripts')}
                className="w-full rounded-xl border border-transparent bg-background/50 pl-9 pr-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-border focus:bg-background transition-colors"
              />
            </div>
            <button
              onClick={handleClearAll}
              className="px-3 py-2 rounded-lg text-[12px] font-medium text-text-muted hover:text-error hover:bg-error/10 transition-colors"
            >
              {t('fireflies.clearAll')}
            </button>
          </div>

          <div className="space-y-1">
            {filteredTranscripts.map((transcript) => {
              const isExpanded = expandedId === transcript.id;
              const isImporting = importingId === transcript.id;

              return (
                <div
                  key={transcript.id}
                  className="rounded-xl border border-border-subtle bg-background/60 overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : transcript.id)
                    }
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover/40 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <Mic className="w-4 h-4 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-text-primary truncate">
                        {transcript.title}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-text-muted">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(transcript.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(transcript.duration)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {transcript.participants.length}
                        </span>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-text-muted" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-text-muted" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-3 border-t border-border-subtle pt-3">
                      {transcript.summary && (
                        <div>
                          <div className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary mb-1">
                            <FileText className="w-3 h-3" />
                            {t('fireflies.summary')}
                          </div>
                          <p className="text-[12px] text-text-primary leading-relaxed">
                            {transcript.summary}
                          </p>
                        </div>
                      )}

                      {transcript.actionItems &&
                        transcript.actionItems.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary mb-1">
                              <CheckSquare className="w-3 h-3" />
                              {t('fireflies.actionItems')}
                            </div>
                            <ul className="space-y-1">
                              {transcript.actionItems.map((item, i) => (
                                <li
                                  key={i}
                                  className="text-[12px] text-text-primary flex items-start gap-1.5"
                                >
                                  <span className="text-accent mt-0.5">•</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {transcript.questions &&
                        transcript.questions.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary mb-1">
                              <HelpCircle className="w-3 h-3" />
                              {t('fireflies.questions')}
                            </div>
                            <ul className="space-y-1">
                              {transcript.questions.map((q, i) => (
                                <li
                                  key={i}
                                  className="text-[12px] text-text-primary flex items-start gap-1.5"
                                >
                                  <span className="text-accent mt-0.5">?</span>
                                  {q}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                      {transcript.transcriptText && (
                        <div>
                          <div className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary mb-1">
                            <FileText className="w-3 h-3" />
                            {t('fireflies.transcriptContent')}
                          </div>
                          <div className="max-h-40 overflow-y-auto rounded-lg bg-surface/50 p-2">
                            <pre className="text-[11px] text-text-primary whitespace-pre-wrap font-mono leading-relaxed">
                              {transcript.transcriptText}
                            </pre>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={() => handleImport(transcript)}
                          disabled={isImporting}
                          className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40"
                        >
                          {isImporting ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          {t('fireflies.importTranscript')}
                        </button>
                        <button
                          onClick={() => handleDelete(transcript.id)}
                          className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-error hover:bg-error/10 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {connected && firefliesTranscripts.length === 0 && !isFetching && (
        <div className="text-center py-8">
          <Mic className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="text-[13px] text-text-muted">
            {t('fireflies.noTranscripts')}
          </p>
        </div>
      )}
    </div>
  );
}
