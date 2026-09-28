import { unlink } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("clear", {
    description: "Delete this session and start a fresh one",
    handler: async (_args, ctx) => {
      const previousSessionFile = ctx.sessionManager.getSessionFile();

      await ctx.newSession({
        withSession: async (freshCtx) => {
          const freshSessionFile = freshCtx.sessionManager.getSessionFile();
          if (previousSessionFile && previousSessionFile === freshSessionFile) {
            freshCtx.ui.notify("Refusing to delete the active session file.", "error");
            return;
          }

          if (previousSessionFile) {
            try {
              await unlink(previousSessionFile);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                const message = error instanceof Error ? error.message : String(error);
                freshCtx.ui.notify(`New session started, but the previous session could not be deleted: ${message}`, "error");
                return;
              }
            }
          }

          freshCtx.ui.notify("Started a fresh session.", "info");
        },
      });
    },
  });
}
