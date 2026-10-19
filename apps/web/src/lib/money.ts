import { useCallback, useMemo } from 'react';
import { currencySymbol, formatMoney } from '@sv/shared';
import { useSession } from '../api/hooks';

/** Formats amounts in the current workspace's currency. */
export function useMoney() {
  const { workspace } = useSession();
  const fmt = useCallback((n: number | null | undefined) => (n === null || n === undefined ? '—' : formatMoney(n, workspace.currency)), [workspace.currency]);
  const symbol = useMemo(() => currencySymbol(workspace.currency), [workspace.currency]);
  return { fmt, symbol, currency: workspace.currency };
}
