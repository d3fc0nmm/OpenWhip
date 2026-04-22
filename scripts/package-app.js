#!/usr/bin/env node
const { packager } = require('@electron/packager');
const path = require('path');

const root = path.resolve(__dirname, '..');

packager({
  dir: root,
  name: 'OpenWhip',
  platform: 'darwin',
  arch: process.env.OPENWHIP_ARCH || 'arm64',
  icon: path.join(root, 'icon', 'AppIcon'),
  out: path.join(root, 'out'),
  overwrite: true,
  appBundleId: 'com.openwhip.app',
  appCategoryType: 'public.app-category.utilities',
  extendInfo: {
    LSUIElement: true,
    NSAppleEventsUsageDescription:
      'OpenWhip sends keystrokes to your focused terminal when you crack the whip.',
  },
  ignore: [
    /^\/out($|\/)/,
    /^\/\.git($|\/)/,
    /^\/scripts($|\/)/,
    /\.DS_Store$/,
  ],
})
  .then(paths => {
    console.log('Packaged:');
    paths.forEach(p => console.log('  ' + p));
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
