import { describe, expect, it, vi } from "vitest";
import type { AccountManager } from "./account-manager";
import { formatUsageSummary, registerCommands } from "./commands";
import type { createUsageStatusController } from "./status";

function createStatusControllerMock() {
	return {
		refreshFor: vi.fn().mockResolvedValue(undefined),
		openPreferencesPanel: vi.fn().mockResolvedValue(undefined),
		loadPreferences: vi.fn().mockResolvedValue(undefined),
		getPreferences: vi.fn(() => ({
			usageMode: "left",
			resetWindow: "7d",
			showAccount: true,
			showReset: true,
			order: "account-first",
		})),
	} as unknown as ReturnType<typeof createUsageStatusController>;
}

function createAccountManagerMock(emails: string[] = []) {
	return {
		getAccounts: () => emails.map((email) => ({ email })),
	} as unknown as AccountManager;
}

describe("formatUsageSummary", () => {
	function createUsageManager(usedPercent: number) {
		return {
			getCachedUsage: () => ({
				primary: { usedPercent, resetAt: Date.now() + 60_000 },
				secondary: { usedPercent, resetAt: Date.now() + 3600_000 },
			}),
		} as unknown as AccountManager;
	}

	it("formats usage as quota left when footer mode is left", () => {
		const summary = formatUsageSummary(
			createUsageManager(1),
			{ email: "two@example.com" } as never,
			"left",
		);

		expect(summary).toContain("5h 99% left");
		expect(summary).toContain("weekly 99% left");
	});

	it("formats usage as consumed quota when footer mode is used", () => {
		const summary = formatUsageSummary(
			createUsageManager(1),
			{ email: "two@example.com" } as never,
			"used",
		);

		expect(summary).toContain("5h 1% used");
		expect(summary).toContain("weekly 1% used");
	});
});

describe("registerCommands", () => {
	it("registers only the multicodex command", () => {
		const registerCommand = vi.fn();
		registerCommands(
			{ registerCommand } as never,
			createAccountManagerMock(),
			createStatusControllerMock(),
		);

		expect(registerCommand).toHaveBeenCalledTimes(1);
		expect(registerCommand).toHaveBeenCalledWith(
			"multicodex",
			expect.objectContaining({
				description: expect.any(String),
				handler: expect.any(Function),
				getArgumentCompletions: expect.any(Function),
			}),
		);
	});

	it("returns dynamic autocomplete for subcommands and managed account identifiers", () => {
		const registerCommand = vi.fn();
		registerCommands(
			{ registerCommand } as never,
			createAccountManagerMock(["alpha@example.com", "beta@example.com"]),
			createStatusControllerMock(),
		);

		const commandOptions = registerCommand.mock.calls[0]?.[1] as {
			getArgumentCompletions: (
				prefix: string,
			) => Array<{ value: string; label: string }> | null;
		};

		const subcommands = commandOptions.getArgumentCompletions("");
		expect(subcommands?.map((item) => item.value)).toContain("accounts");
		expect(subcommands?.map((item) => item.value)).toContain("show");
		expect(subcommands?.map((item) => item.value)).toContain("use");
		expect(subcommands?.map((item) => item.value)).toContain("refresh");
		expect(subcommands?.map((item) => item.value)).toContain("reauth");

		const useAccounts = commandOptions.getArgumentCompletions("use a");
		expect(useAccounts).toEqual([
			{ value: "use alpha@example.com", label: "alpha@example.com" },
		]);

		const refreshAccounts = commandOptions.getArgumentCompletions("refresh a");
		expect(refreshAccounts).toContainEqual({
			value: "refresh alpha@example.com",
			label: "alpha@example.com",
		});
	});

	it("shows a non-interactive warning when no subcommand is provided", async () => {
		const registerCommand = vi.fn();
		registerCommands(
			{ registerCommand } as never,
			createAccountManagerMock(),
			createStatusControllerMock(),
		);

		const commandOptions = registerCommand.mock.calls[0]?.[1] as {
			handler: (args: string, ctx: unknown) => Promise<void>;
		};
		const notify = vi.fn();
		await commandOptions.handler("", {
			hasUI: false,
			ui: { notify },
		});

		expect(notify).toHaveBeenCalledWith(
			"/multicodex requires a subcommand in non-interactive mode. Use /multicodex help.",
			"warning",
		);
	});
});
