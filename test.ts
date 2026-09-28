import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import register from "./index.ts";

test("/clear deletes the old session only after a successful switch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-clear-"));
  const oldFile = join(directory, "old.jsonl");
  const newFile = join(directory, "new.jsonl");
  await writeFile(oldFile, "old session");
  await writeFile(newFile, "new session");

  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  let clearWidgetOnInput: ((event: any, ctx: any) => void) | undefined;
  let registeredCommands = 0;
  register({
    on(event, callback) {
      assert.equal(event, "input");
      clearWidgetOnInput = callback;
    },
    registerCommand(name, command) {
      assert.equal(name, "clear");
      registeredCommands++;
      handler = command.handler;
    },
  } as any);

  try {
    assert.equal(registeredCommands, 1);
    assert.ok(handler);
    assert.ok(clearWidgetOnInput);
    await handler("", {
      sessionManager: { getSessionFile: () => oldFile },
      newSession: async () => ({ cancelled: true }),
    } as any);
    assert.equal(await readFile(oldFile, "utf8"), "old session");

    await handler("", {
      sessionManager: { getSessionFile: () => oldFile },
      newSession: async ({ withSession }: any) => {
        await withSession({
          sessionManager: { getSessionFile: () => newFile },
          ui: { setWidget() {}, notify() {} },
        });
        return { cancelled: false };
      },
    } as any);
    await assert.rejects(readFile(oldFile), { code: "ENOENT" });
    assert.equal(await readFile(newFile, "utf8"), "new session");

    let widgetLines: string[] = [];
    let widgetCleared = false;
    await handler("", {
      sessionManager: { getSessionFile: () => oldFile },
      newSession: async ({ withSession }: any) => {
        await withSession({
          sessionManager: { getSessionFile: () => newFile },
          ui: {
            setWidget: (key: string, factory: any, options: any) => {
              assert.equal(key, "pi-clear-confirmation");
              assert.deepEqual(options, { placement: "aboveEditor" });
              widgetLines = factory({}, { fg: (color: string, message: string) => `${color}:${message}` }).render(80);
            },
          },
        });
        return { cancelled: false };
      },
    } as any);
    assert.deepEqual(widgetLines, ["success:Session deleted. New session started."]);

    clearWidgetOnInput({}, {
      ui: {
        setWidget: (key: string, content: undefined) => {
          assert.equal(key, "pi-clear-confirmation");
          assert.equal(content, undefined);
          widgetCleared = true;
        },
      },
    });
    assert.equal(widgetCleared, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
