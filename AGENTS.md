<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Platform is native React: pure logic in src/lib/platform/engine.ts, UI in src/components/platform/; whole state is one JSON blob in app_data (format inherited from the old HTML) so existing user data keeps loading.
- Account access requires profiles.approved (set by admin); first registered user becomes admin via signup trigger.
- Never change saved state keys/shape without a normalizeState migration; old backups must still import.
- Multiple bankrolls live in one app_data blob as {bancasVersion, activeId, bancas[]}; parseBancas wraps the legacy single-state blob so old data keeps loading.
- Order integration: external callers hit /api/public/ordens* with a per-user bearer key stored only as SHA-256 hash in integration_tokens; queue lives in order_queue, written only by service role.
