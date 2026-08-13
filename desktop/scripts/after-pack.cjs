// electron-builder unconditionally strips node_modules out of
// extraResources copies (hardcoded, filter patterns can't override it),
// which shipped v0.3.0 with a payload that couldn't import express.
// This hook runs after packing and BEFORE signing, so the modules it
// copies in are covered by the signature and the notarization seal.
const { cpSync } = require('node:fs');
const path = require('node:path');

module.exports = async function afterPack(context) {
  const resources =
    context.electronPlatformName === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources',
        )
      : path.join(context.appOutDir, 'resources');
  cpSync(
    path.join(__dirname, '..', 'payload', 'node_modules'),
    path.join(resources, 'payload', 'node_modules'),
    { recursive: true },
  );
  console.log('afterPack: payload node_modules restored into', resources);
};
