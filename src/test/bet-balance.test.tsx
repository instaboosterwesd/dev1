import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { debitBet } from "@/lib/bet-balance";
import { BetPanel } from "@/routes/index";

afterEach(cleanup);

describe("Bet balance rules", () => {
  it("rejects a 10000 stake with a 4000 balance", () => {
    expect(debitBet(4000, 10000)).toBeNull();
  });

  it("reserves accepted stakes so two panels cannot overspend", () => {
    const remaining = debitBet(4000, 3000);
    expect(remaining).toBe(1000);
    expect(debitBet(remaining ?? 0, 2000)).toBeNull();
  });

  it.each(["button", "switch"])("rejects an unaffordable queued bet via %s during flight", (trigger) => {
    const reserve = vi.fn((stake: number) => debitBet(4000, stake) !== null);
    render(<BetPanel initial={10000} phase="flying" multiplier={1.5} round={1}
      onCashOut={vi.fn()} onReserveBet={reserve} onRefundBet={vi.fn()} />);
    if (trigger === "switch") {
      fireEvent.click(screen.getByRole("button", { name: /^Auto$/ }));
      fireEvent.click(screen.getByRole("button", { name: /^Auto cash out$/ }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: /BET 10,000/ }));
    }
    expect(reserve).toHaveBeenCalledWith(10000);
    expect(screen.getByRole("alert")).toHaveTextContent("Insufficient balance");
    expect(screen.queryByText("WAITING FOR NEXT ROUND")).toBeNull();
  });

  it.each([false, true])("settles once and releases the bet immediately after cashout (auto=%s)", (auto) => {
    const cashOut = vi.fn();
    const props = { initial: 90, round: 1, onCashOut: cashOut,
      onReserveBet: vi.fn(() => true), onRefundBet: vi.fn() };
    const view = render(<BetPanel {...props} phase="intro" multiplier={1} />);
    if (auto) {
      fireEvent.click(screen.getByRole("button", { name: /^Auto$/ }));
      fireEvent.change(screen.getByLabelText("Auto cash out multiplier"), { target: { value: "2" } });
      fireEvent.blur(screen.getByLabelText("Auto cash out multiplier"));
      fireEvent.click(screen.getByRole("button", { name: /^Auto cash out$/ }));
    } else {
      fireEvent.click(screen.getByRole("button", { name: /BET 90/ }));
    }
    view.rerender(<BetPanel {...props} phase="flying" multiplier={2} />);
    if (!auto) fireEvent.click(screen.getByRole("button", { name: /CASH OUT/ }));
    expect(cashOut).toHaveBeenCalledExactlyOnceWith({ amount: 180, multiplier: 2 });
    expect(screen.getByRole("button", { name: /BET 90/ })).toBeEnabled();
    view.rerender(<BetPanel {...props} phase="flying" multiplier={2.1} />);
    expect(cashOut).toHaveBeenCalledTimes(1);
  });
});