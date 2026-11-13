// A rejected stake must not change the available balance.
export function debitBet(balance: number, stake: number): number | null {
  if (!Number.isFinite(stake) || stake <= 0 || stake > balance) return null;
  return Math.round((balance - stake) * 100) / 100;
}