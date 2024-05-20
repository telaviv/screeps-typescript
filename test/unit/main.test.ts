import { assert } from "chai";
import { unwrappedLoop as loop } from "../../src/main";
import { Game, Memory } from "./mock"

describe("main", () => {
  before(() => {
    // runs before all test in this block
  });

  beforeEach(() => {
    // runs before each test in this block
    // @ts-ignore : allow adding Game to global
    global.Game = { ...Game }
    // @ts-ignore : allow adding Memory to global
    global.Memory = { ...Memory }
  });

  it("should export a loop function", () => {
    assert.isTrue(typeof loop === "function");
  });

  it("should return void when called with no context", () => {
    assert.isUndefined(loop());
  });
});
