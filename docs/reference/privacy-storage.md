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

## Web demo

The hosted demo uses browser-local canvas storage and browser-direct model connections where supported. It does not provide the full set of desktop-local capabilities.
