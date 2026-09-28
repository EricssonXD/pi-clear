import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import register from "./index.ts";

test("/clear deletes the old session and renders a /new-style confirmation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-clear-"));
  const oldFile = join(directory, "old.jsonl");
  const newFile = join(directory, "new.jsonl");
  await writeFile(oldFile, "old session");
  await writeFile(newFile, "new session");

  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  let renderEntry: ((entry: any, options: any, theme: any) => any) | undefined;
  const registeredCommands: string[] = [];
  const entries: string[] = [];
  const notifications: { message: string; type: string }[] = [];
  register({
    registerEntryRenderer(type, renderer) {
      assert.equal(type, "pi-clear-confirmation");
      renderEntry = renderer;
    },
    registerCommand(name, command) {
      registeredCommands.push(name);
      handler = command.handler;
    },
  } as any);

  try {
    assert.deepEqual(registeredCommands, ["clear"]);
    assert.ok(handler);
    assert.ok(renderEntry);

    await handler("", {
      sessionManager: { getSessionFile: () => oldFile },
      newSession: async () => ({ cancelled: true }),
    } as any);
    assert.equal(await readFile(oldFile, "utf8"), "old session");

    const runAfterSwitch = async (previousSessionFile: string) =>
      handler!("", {
        sessionManager: { getSessionFile: () => previousSessionFile },
        newSession: async ({ setup, withSession }: any) => {
          await setup({
            getSessionFile: () => newFile,
            appendCustomEntry: (type: string) => entries.push(type),
          });
          await withSession({
            ui: {
              notify: (message: string, type: string) => notifications.push({ message, type }),
            },
          });
          return { cancelled: false };
        },
      } as any);

    await runAfterSwitch(oldFile);
    await assert.rejects(readFile(oldFile), { code: "ENOENT" });
    assert.deepEqual(entries, ["pi-clear-confirmation"]);
    assert.deepEqual(notifications, []);

    await runAfterSwitch(join(directory, "already-deleted.jsonl"));
    assert.equal(entries.length, 2);
    assert.deepEqual(notifications, []);

    await runAfterSwitch(directory);
    assert.equal(entries.length, 2);
    assert.equal(notifications[0]?.type, "error");
    assert.match(notifications[0]?.message ?? "", /could not be deleted/);

    const component = renderEntry(
      { customType: "pi-clear-confirmation" },
      { expanded: false },
      { fg: (color: string, text: string) => `${color}:${text}` },
    );
    assert.deepEqual(component.render(80), ["", " accent:✓ Session deleted. New session started.", ""]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
