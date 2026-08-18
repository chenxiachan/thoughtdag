# Contributing to ThoughtDAG

[中文](./CONTRIBUTING_ZH.md)

Thank you for helping improve ThoughtDAG. Contributions are welcome when they make context more visible, editable, reliable, or useful without taking control away from the user.

## Before you start

For a small bug fix, documentation correction, translation, or focused test, feel free to open a pull request directly.

Please open an issue before implementing a significant change, especially one that affects:

- how graph paths become model context;
- node, edge, backup, or migration formats;
- privacy, security, model connections, or network behavior;
- major interaction patterns or canvas semantics;
- licensing, collaboration, accounts, or paid-service boundaries.

Early discussion avoids duplicate work and confirms that the proposed behavior fits the product direction. An issue discussion is not a promise that a pull request will be merged.

## Development setup

```bash
npm install
npm run server   # LLM proxy on :3001
npm run dev      # Vite app on :5173
```

Before submitting, run the checks relevant to your change:

```bash
npm run lint
npm run build
npm run smoke
```

If a check cannot be run or has an unrelated pre-existing failure, explain that clearly in the pull request.

## Pull request guidelines

- Keep each pull request focused on one problem.
- Explain the user-visible behavior and why the change is needed.
- Include screenshots or a short recording for interaction or visual changes.
- Add or update tests when behavior changes.
- Preserve existing data and backup compatibility, or document the migration.
- Update both English and Chinese UI copy when applicable.
- Do not add promotional third-party brand names to generic UI copy.
- Do not include API keys, personal research material, private conversations, or generated build artifacts.

Maintainers may ask for a change to be split, revised, or discussed further before review.

## Licensing and contributor declaration

ThoughtDAG uses an **inbound = outbound** contribution policy: contributions accepted into this public repository are licensed under the same [MIT License](./LICENSE) as the repository.

By submitting a pull request, you certify that:

1. you wrote the contribution or otherwise have the right to submit it;
2. your employer or another rights holder does not prevent the submission, or you have obtained the required permission;
3. you agree that the contribution may be used, modified, distributed, sublicensed, and sold under the MIT License;
4. you have disclosed third-party code, assets, data, or other licensing restrictions associated with the contribution.

ThoughtDAG may offer official binaries, hosted services, support, or separately developed proprietary modules. Contributions accepted into this repository remain available to everyone under the MIT License.

## AI-assisted contributions

AI assistance does not transfer responsibility away from the contributor. If a substantial part of a contribution was generated or transformed by an AI system:

- disclose that use in the pull request;
- review and understand every submitted change;
- verify that it does not reproduce incompatible third-party material;
- do not submit private, confidential, or employer-owned material without permission;
- remain responsible for correctness, security, tests, and licensing.

Minor completion, formatting, or language assistance does not need a detailed tool log. The disclosure should be proportional to the contribution and useful to reviewers.

## Review principles

ThoughtDAG is a human-in-the-loop context workbench. Contributions should preserve these product principles:

- wires and explicit references must truthfully reflect model context;
- the user, not an autonomous process, controls branching, merging, and pruning;
- local-first behavior and clear privacy boundaries are defaults;
- visual structure must remain usable across semantic zoom levels;
- layouts must respect context-flow direction and keep conversation chains coherent.

Thank you for contributing thoughtfully.
