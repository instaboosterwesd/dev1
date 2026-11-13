import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BetPanel, CashoutNotification } from "@/routes/index";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("keeps both simultaneous panel cashouts and dismisses each independently", () => {
  vi.useFakeTimers();
  const settle = vi.fn();
  function Harness({ flying }: { flying: boolean }) {
    const [notices, setNotices] = useState<{ id: number; amount: number; multiplier: number }[]>([]);
    const onCashOut = (notice: { amount: number; multiplier: number }) => {
      settle(notice);
      setNotices((current) => [...current, { ...notice, id: current.length + 1 }]);
    };
    return <>
      {[10, 20].map((initial) => <BetPanel key={initial} initial={initial} phase={flying ? "flying" : "intro"} multiplier={2} round={1} onReserveBet={() => true} onRefundBet={() => {}} onCashOut={onCashOut} />)}
      {notices.map((notice) => <CashoutNotification key={notice.id} notice={notice} onDismiss={(id) => setNotices((current) => current.filter((entry) => entry.id !== id))} />)}
    </>;
  }
  const view = render(<Harness flying={false} />);
  screen.getAllByRole("button", { name: /^BET/ }).forEach((button) => fireEvent.click(button));
  view.rerender(<Harness flying />);
  act(() => screen.getAllByRole("button", { name: /^CASH OUT/ }).forEach((button) => button.click()));
  expect(settle.mock.calls.map(([notice]) => notice.amount)).toEqual([20, 40]);
  expect(screen.getAllByRole("status")).toHaveLength(2);
  const dismissButton = screen.getAllByRole("button", { name: "Dismiss cash out notification" }).at(0);
  if (!dismissButton) throw new Error("Cashout dismissal button missing");
  fireEvent.click(dismissButton);
  expect(screen.getAllByRole("status")).toHaveLength(1);
  act(() => vi.advanceTimersByTime(2700));
  expect(screen.queryAllByRole("status")).toHaveLength(0);
});