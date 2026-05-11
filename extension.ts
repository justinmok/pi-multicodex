import type {
	ExtensionAPI,
	ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { AccountManager } from "./account-manager";
import { registerCommands } from "./commands";
import { handleNewSessionSwitch, handleSessionStart } from "./hooks";
import { buildMulticodexProviderConfig, PROVIDER_ID } from "./provider";
import { createUsageStatusController } from "./status";

function isStaleExtensionContextError(error: unknown): boolean {
	return (
		error instanceof Error &&
		error.message.includes(
			"This extension ctx is stale after session replacement or reload",
		)
	);
}

export default function multicodexExtension(pi: ExtensionAPI) {
	const accountManager = new AccountManager();
	const statusController = createUsageStatusController(accountManager);
	let lastContext: ExtensionContext | undefined;

	function notifyWarning(ctx: ExtensionContext, message: string): void {
		try {
			ctx.ui.notify(message, "warning");
		} catch (error) {
			if (!isStaleExtensionContextError(error)) throw error;
			if (lastContext === ctx) lastContext = undefined;
		}
	}

	accountManager.setWarningHandler((message) => {
		if (lastContext) {
			notifyWarning(lastContext, message);
		}
	});

	pi.registerProvider(
		PROVIDER_ID,
		buildMulticodexProviderConfig(accountManager),
	);

	registerCommands(pi, accountManager, statusController);

	pi.on("session_start", (_event: unknown, ctx: ExtensionContext) => {
		lastContext = ctx;
		accountManager.resetSessionWarnings();
		handleSessionStart(accountManager, (msg) => notifyWarning(ctx, msg));
		statusController.startAutoRefresh();
		void (async () => {
			await statusController.loadPreferences(ctx);
			await statusController.refreshFor(ctx);
		})();
	});

	pi.on(
		"session_switch",
		(event: { reason?: string }, ctx: ExtensionContext) => {
			lastContext = ctx;
			if (event.reason === "new") {
				accountManager.resetSessionWarnings();
				handleNewSessionSwitch(accountManager, (msg) =>
					notifyWarning(ctx, msg),
				);
			}
			void statusController.refreshFor(ctx);
		},
	);

	pi.on("turn_end", (_event: unknown, ctx: ExtensionContext) => {
		lastContext = ctx;
		void statusController.refreshFor(ctx);
	});

	pi.on("model_select", (_event: unknown, ctx: ExtensionContext) => {
		lastContext = ctx;
		statusController.scheduleModelSelectRefresh(ctx);
	});

	pi.on("session_shutdown", (_event: unknown, ctx: ExtensionContext) => {
		statusController.stopAutoRefresh(ctx);
		if (lastContext === ctx) lastContext = undefined;
	});
}
