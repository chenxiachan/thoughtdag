# Privacy and storage

## What stays local

In the desktop app, canvases, model credentials, imported documents, and local session mirrors are stored on your machine. Canvas state uses IndexedDB; optional folder backup writes explicit `.thoughtdag.json` files.

## What can leave the device

Content leaves the device only through a feature that requires transfer:

- a model request to a remote endpoint;
- a search or external tool call;
- a share URL you create and send;
- a backup folder managed by a third-party sync service;
- an exported file you distribute.

PDF files remain local during ordinary reading. Extracted text or selected material may be sent when it is included in a remote model request.

## Credentials

Keys configured in the interface are kept in local browser storage and proxy memory. They are not included in normal canvas backups. Always review the policy of the model or tool endpoint you connect.

## Local why index

The CLI and MCP keep rebuildable indexes and caches in `~/.thoughtdag`, separate from source logs. These may contain historical questions, answers, file paths, and material excerpts—not just filenames.

```bash
thoughtdag purge --cache  # Remove rebuildable caches only
thoughtdag purge          # Remove derived data, not source sessions
```

Later indexing or queries can read source logs again while those logs still exist. Purging the index does not erase source history.

## Harness plugin

The embedded canvas uses browser storage under the Harness web origin. Harness manages its model configuration, credentials, and session logs. The plugin accesses supported logs on the machine running Harness, which need not be the browser client's machine.

Matching history returned by query tools may enter an agent's next model request and be sent to the selected remote provider. New turns through **DeepSeek Harness · Agent** are recorded in Harness logs; editing the canvas does not delete those logs.

## Web demo

The hosted demo uses browser-local canvas storage and browser-direct model connections where supported. It does not provide the full set of desktop-local capabilities.
