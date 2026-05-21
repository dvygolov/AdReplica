export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const deepClone = (value) => JSON.parse(JSON.stringify(value));
