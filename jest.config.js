module.exports = {
    preset: "ts-jest",
    testEnvironment: "jsdom",

    testMatch: [
        "**/tests/**/*.spec.ts"
    ],

    globals: {
        "ts-jest": {
            tsConfig: "tests/tsconfig.json"
        }
    }
};