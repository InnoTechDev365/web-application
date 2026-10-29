import { type InsightFocus } from '../../services/ai';

export interface AiActionDefinition {
  id: InsightFocus;
  label: string;
  description: string;
}

export const AI_ACTIONS: readonly AiActionDefinition[] = [
  { id: 'audit', label: 'Expense Audit', description: 'Find the most important spending signals.' },
  { id: 'savings', label: 'Savings Plan', description: 'Turn your cash flow into a realistic next step.' },
  { id: 'forecast', label: 'Monthly Forecast', description: 'Project the current spending pace.' },
  { id: 'categories', label: 'Category Mix', description: 'Explain where your spending is concentrated.' },
  { id: 'subscriptions', label: 'Subscription Scan', description: 'Surface repeated charge descriptions.' },
  { id: 'anomalies', label: 'Outlier Check', description: 'Flag expenses that are unusual for your history.' },
  { id: 'weekly-review', label: 'Weekly Review', description: 'Summarize your latest seven days.' },
  { id: 'rate-brief', label: 'Rate Brief', description: 'Explain the verified USD, EUR, and ILS snapshot.' },
];
