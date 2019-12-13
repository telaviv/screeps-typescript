const NodeEnvironment = require("jest-environment-node");
const setupGlobals = require("./setupGlobals");

class TestEnvironment extends NodeEnvironment {
  async setup() {
    await super.setup();
    setupGlobals(this.global);
  }
}

module.exports = TestEnvironment;
