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

- Original platform HTML lives in public/plataforma.html, embedded via iframe; its window.storage shim proxies saves to the parent page, which persists per-user data in app_data.
- Account access requires profiles.approved (set by admin); first registered user becomes admin via signup trigger.
- Platform section menus toggle existing DOM panels without changing calculation keys or storage format, preserving existing user data and event handlers.
