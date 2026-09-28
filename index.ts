import { unlink } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CLEAR_ENTRY = "pi-clear-confirmation";
const CLEAR_MESSAGE = "Session deleted. New session started.";

export default function (pi: ExtensionAPI) {
  pi.registerEntryRenderer(CLEAR_ENTRY, (_entry, _options, theme) => ({
    render: () => ["", ` ${theme.fg("accent", `✓ ${CLEAR_MESSAGE}`)}`, ""],
    invalidate() {},
  }));

  pi.registerCommand("clear", {
    description: "Delete this session and start a fresh one",
    handler: async (_args, ctx) => {
      const previousSessionFile = ctx.sessionManager.getSessionFile();
      let deletionError: Error | undefined;

      await ctx.newSession({
        setup: async (sessionManager) => {
          const freshSessionFile = sessionManager.getSessionFile();
          if (previousSessionFile && previousSessionFile === freshSessionFile) {
            deletionError = new Error("Refusing to delete the active session file.");
            return;
          }

          if (previousSessionFile) {
            try {
              await unlink(previousSessionFile);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                deletionError = error instanceof Error ? error : new Error(String(error));
                return;
              }
            }
          }

          sessionManager.appendCustomEntry(CLEAR_ENTRY);
        },
        withSession: async (freshCtx) => {
          if (deletionError) {
            freshCtx.ui.notify(
              `New session started, but the previous session could not be deleted: ${deletionError.message}`,
              "error",
            );
          }
        },
      });
    },
  });
}
