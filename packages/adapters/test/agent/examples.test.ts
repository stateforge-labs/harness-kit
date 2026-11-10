import { expect, test } from "bun:test";
import { scriptedAnswer } from "../../examples/agent/test-with-fakes.ts";

test("the fake-engine example returns the scripted answer", async () => {
  expect(await scriptedAnswer()).toBe("four");
});
