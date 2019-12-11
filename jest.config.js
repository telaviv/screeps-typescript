module.exports = {
  collectCoverageFrom: [
    "src/**/*.{js,ts}"
  ],
  coveragePathIgnorePatterns: [
    "\.d\.ts$",
    "src/utils/ErrorMapper.ts"
  ],
  moduleDirectories: [
    "node_modules",
    "src"
  ],
  preset: "ts-jest",
  testEnvironment: "node"
};
