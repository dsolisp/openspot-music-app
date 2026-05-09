const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// undici is a Node-only package that shouldn't be bundled for mobile.
// It's being pulled in by a patch in youtube-sr.
config.resolver.blockList = [
  /node_modules\/undici\/.*/,
  /node_modules\/node-fetch\/.*/,
  /node_modules\/cross-fetch\/.*/,
];

module.exports = config;
