# Privacy Policy — XClipper with dukou

Last updated: October 10, 2026 (local integration).

XClipper's original export workflow processes X content in your browser and writes local files, clipboard content, print previews or Obsidian links. This local version also contains dukou article collection and distribution. No analytics, advertising or telemetry is added.

## Article library

When you request an import or capture, article text, source links, image data and a library index are saved in browser local extension storage. They remain until you delete the article. The current X content button uses the existing extractor and downloads available images from allowed X media hosts. Missing images are reported. Local file import only reads files selected or dropped by you.

## Optional website access

New website access is requested by the relevant feature's button. The manifest declares optional HTTPS host access so users can authorize particular remote image domains; it does not request every website at installation or automatically grant all optional hosts. The dynamically registered content scripts operate only on authorized WeChat, X/Twitter, Bilibili and Huasheng editor pages. Optional `scripting` is used to register these scripts; optional `unlimitedStorage` is granted only through the library's storage button. You can revoke these grants in browser extension settings.

Capture requests load WeChat pages or call Feishu's API. Remote Markdown images are downloaded from domains you authorize (or those allowing ordinary cross-origin access). Website requests necessarily disclose ordinary connection information to those websites. Collected text/images are not sent to an unrelated service.

## Distribution and Feishu

X/Bilibili/Huasheng actions paste content into the editor on the selected platform. The platform may upload pasted images and autosave drafts. This is an external transfer you initiate; publishing remains manual.

Feishu read/write buttons use the app ID and app secret you configure. They obtain an app tenant access token from `open.feishu.cn`, read authorized documents or create a document, upload images and, when an open ID is supplied, grant that identity edit permission. The app secret and open ID are stored locally in extension storage, not encrypted and not synchronized by this implementation. Do not use privileged credentials in a shared browser profile. Clear and save the fields to remove the configuration. Tokens are not persisted in project files or logs. Feishu receives credentials and requested document data as required for these operations; its own policies apply.

Partial write failures include the created document link so you can inspect it. Retrying creates a new document.

## Optional local bridge

The bridge is off by default. Explicitly enabling it requests access to `http://127.0.0.1/*`; the extension polls `http://127.0.0.1:8787` approximately every 30 seconds and when the article page is opened. CLI tasks can import articles, request a WeChat capture or export a selected/latest article. Requested article data is returned to this local process, which can save it to the directory supplied in the CLI task. The bridge does not receive Feishu credentials or original X session tokens.

The service binds to loopback, rejects ordinary website origins and unexpected Host headers, and accepts results only for pending tasks. It trusts local terminal processes and installed extensions; it has no separate user authentication. Disable the switch and stop the bridge process after use when appropriate. Do not run another extension consuming the same bridge queue.

## Original export permissions

`activeTab`, `storage`, `downloads`, `contextMenus` and `alarms` retain their original roles. Background export requests validate their sender, media URLs and filenames. X Fast Batch remains optional: `webRequest` and X host access capture your existing X request templates/authentication headers to fetch data from X. No password or paid X API key is requested. Neither the article library nor bridge exports those headers.

Downloads fetch permitted X media; PDF export uses the browser's print engine; Obsidian handoff uses a local URI. Batch state and export preferences remain local. There is no remote XClipper backend.

## Verification and questions

This local version is not a published store update. See `docs/dukou.md` for usage and tested limitations. Feishu, X, Bilibili, WeChat and Huasheng apply their own policies when you use their services.


## Follower Lens integration (2026-10-10)

On https://x.com only, the integrated lens passively observes already-requested GraphQL responses in the page's MAIN world and parses account follower/following counts, relationship flags, creation date, and loaded tweet statistics. It does not initiate follower collection requests, capture authentication headers, or upload lens data. Response bodies are transient, bounded at 4 MiB, and not persisted. Page-provided data is untrusted and used only for auxiliary display.

Local follower history is off by default. When enabled, it stores only handles, sampling timestamps and follower counts in chrome.storage.local (at most 3000 handles, 40 points per handle, and one point per six hours). Turning the main switch off stops display and sampling. Clearing history invalidates queued samples from before the clear; future browsing can collect new samples when tracking stays enabled. Clearing does not delete the article library or export settings. Rule-based labels reflect loaded samples, not an assessment of account authenticity.

No additional required host permission is added for the lens. Legacy twitter.com URLs must be opened on x.com. This module preserves the upstream MIT attribution in src/lens/LICENSE and NOTICE.md.
