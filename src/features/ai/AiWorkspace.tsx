import { type FormEvent, type JSX, type KeyboardEvent, useEffect, useMemo, useState } from 'react';

import {
  createSpendingSummary,
  fetchFreeModels,
  getLocalFinancialAudit,
  getSpendingInsight,
  type AiInsight,
  type InsightFocus,
  type OpenRouterModel,
} from '../../services/ai';
import { type Currency, type Transaction } from '../../services/db';
import { AI_ACTIONS } from './aiActions';

interface AiWorkspaceProps {
  baseCurrency: Currency;
  rates: Record<Currency, number>;
  totalBalance: number;
  transactions: Transaction[];
}

export function AiWorkspace({ baseCurrency, rates, totalBalance, transactions }: AiWorkspaceProps): JSX.Element {
  const [apiKey, setApiKey] = useState('');
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [result, setResult] = useState<AiInsight | null>(null);
  const [question, setQuestion] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(
    () => createSpendingSummary(transactions, baseCurrency, rates, totalBalance),
    [baseCurrency, rates, totalBalance, transactions],
  );

  useEffect(() => {
    const key = apiKey.trim();
    setModels([]);
    setSelectedModel('');
    setResult(null);
    if (!key) {
      setStatus('idle');
      setError(null);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void fetchFreeModels(key, controller.signal)
        .then((freeModels) => {
          if (controller.signal.aborted) return;
          setModels(freeModels);
          setStatus('ready');
          if (!freeModels.length) setError('No free models are available for this key right now. Try again later.');
        })
        .catch((fetchError: unknown) => {
          if (controller.signal.aborted) return;
          setStatus('error');
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load OpenRouter models.');
        });
    }, 450);
    setStatus('loading');
    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [apiKey]);

  const runCloudAction = async (focus: InsightFocus): Promise<void> => {
    if (!selectedModel || !transactions.length) return;
    setIsWorking(true);
    setError(null);
    try {
      setResult(await getSpendingInsight(apiKey, summary, selectedModel, focus));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to generate an insight.');
    } finally {
      setIsWorking(false);
    }
  };

  const runLocalPreview = (): void => {
    if (!transactions.length) return;
    setError(null);
    setResult(getLocalFinancialAudit(transactions, baseCurrency, rates, 'audit'));
  };

  const askQuestion = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !selectedModel || !transactions.length) return;
    setIsWorking(true);
    setError(null);
    try {
      setResult(await getSpendingInsight(apiKey, `${summary}\n\nQuestion: ${trimmedQuestion}`, selectedModel, 'custom'));
      setQuestion('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to answer your question.');
    } finally {
      setIsWorking(false);
    }
  };

  const isCloudReady = Boolean(selectedModel && transactions.length && !isWorking);

  const closeConnectModal = (): void => {
    setIsConnectModalOpen(false);
  };

  const handleModalKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') closeConnectModal();
  };

  return (
    <article className="ledger-panel ai-panel">
      <div className="ai-panel-head">
        <div><p className="panel-label">OPENROUTER</p><h2>AI Finance Tools</h2></div>
        <button className="ai-connect-button" type="button" onClick={() => setIsConnectModalOpen(true)}>{selectedModel ? 'AI Connected' : 'Connect Free AI'}</button>
      </div>
      <p className="ai-copy">Choose a free OpenRouter model. AI receives a minimized summary, never direct access to IndexedDB.</p>
      <p className="ai-status">{selectedModel ? `Ready: ${selectedModel}` : 'Connect a free model to unlock cloud AI tools.'}</p>

      {!transactions.length && <p className="ai-warning">Add transaction data before generating an AI analysis.</p>}
      {error && <p className="ai-error" role="status">{error}</p>}

      <div className="ai-actions">
        {AI_ACTIONS.map((action) => <button key={action.id} className="ai-action" disabled={!isCloudReady} title={action.description} type="button" onClick={() => void runCloudAction(action.id)}><span>{action.label}</span><small>{action.description}</small></button>)}
        <button className="ai-action ai-action-local" disabled={!transactions.length} type="button" onClick={runLocalPreview}><span>Local Preview</span><small>Run immediate on-device analytics.</small></button>
      </div>

      <form className="ai-question" onSubmit={askQuestion}>
        <label>Ask About Your Finances<textarea autoComplete="off" className="input" disabled={!isCloudReady} maxLength={400} name="financialQuestion" placeholder="e.g. Which category should I review first?" value={question} onChange={(event) => setQuestion(event.target.value)} /></label>
        <button className="ledger-button primary-button" disabled={!isCloudReady || !question.trim()} type="submit">{isWorking ? 'Generating…' : 'Ask Free AI Model'}</button>
      </form>

      {result && <div className="ai-result"><p>{result.content}</p><span>{result.model}</span></div>}

      {isConnectModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeConnectModal}>
          <section className="connect-modal" aria-labelledby="connect-ai-title" aria-modal="true" role="dialog" tabIndex={-1} onKeyDown={handleModalKeyDown} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-head"><div><p className="panel-label">OPENROUTER</p><h3 id="connect-ai-title">Connect a Free AI Model</h3></div><button className="ledger-button" type="button" aria-label="Close AI connection modal" onClick={closeConnectModal}>Close</button></div>
            <p>Paste your OpenRouter API key to fetch current free models. The key stays in memory for this tab and is never written to IndexedDB.</p>
            <form className="modal-form" onSubmit={(event) => { event.preventDefault(); closeConnectModal(); }}>
              <label>OpenRouter API Key<input autoComplete="off" className="input" name="openrouterApiKey" placeholder="sk-or-v1-…" spellCheck={false} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /></label>
              <label>Free Model<select className="input" disabled={status !== 'ready' || !models.length} name="openrouterModel" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}><option value="">{status === 'loading' ? 'Loading free models…' : status === 'error' ? 'Model loading failed' : 'Select a free model'}</option>{models.map((model) => <option key={model.id} value={model.id}>{model.name} ({model.id})</option>)}</select></label>
              {error && <p className="ai-error" role="status">{error}</p>}
              <div className="modal-actions"><button className="ledger-button" type="button" onClick={closeConnectModal}>Cancel</button><button className="ledger-button primary-button" disabled={!selectedModel} type="submit">Use Selected Model</button></div>
            </form>
          </section>
        </div>
      )}
    </article>
  );
}
