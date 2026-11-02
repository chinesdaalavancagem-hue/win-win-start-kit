# Diagnóstico (somente leitura): "Par v4 recente e ordenado: NÃO CONFIRMADO"

Nada foi editado, publicado, migrado ou habilitado. Só leitura de código e banco.

## Evidências verificadas agora

1. **Usuário da chave = usuário da extensão (hipótese principal descartada no banco).**
   - Últimas 3 h: todas as observações (2.774) pertencem a **um único usuário**.
   - Esse mesmo usuário tem **uma única chave VPS** no banco, ativa, criada hoje às **15:29 UTC**. Não existe chave de outro usuário.
   - Logo, uma chave VPS válida só pode ler os eventos desse usuário. Mas: qualquer chave **gerada antes das 15:29** foi substituída e hoje recebe **401**, não lista vazia.

2. **Os dados no banco passam no `evaluate()` exatamente como você transcreveu.**
   - Os 30 registros mais recentes (ids 14858–14887) alternam `card` → `position`, `client_seq` crescente (2745→2774), mesma sessão/banca/conta/`MGC`, `relay_version: 4` (número), `card_confirmed: true` (booleano). Atraso do envio até o servidor: ~0,7 s.
   - Com isso, o script daria `matched` = 15. Se ele mostra `matched = 0`, **a resposta que chegou à VPS não continha esses eventos**.

3. **O envio da extensão tem pausas e parou.**
   - Pausas de 15–65 s entre envios às 16:13–16:39.
   - Último registro às **16:42:09 UTC**; nada depois disso até esta leitura.
   - O GET só devolve registros dos **últimos 120 s**. Se o diagnóstico rodar mais de 2 min depois do último envio, ele recebe `events: []`, `ok: true`, e mostra exatamente "identidade/sequência encontrados: 0".

4. **Endereço publicado ativo:** `GET .../observacoes/?after=0` sem chave responde 401 em JSON (a rota existe no site publicado). Não consigo provar sem a chave que a versão publicada é idêntica à `main`. A última mudança nessa rota (v4) é de 01/11 16:47.

## Causas que sobraram, por ordem

- **A — Sem eventos na janela de 120 s quando a VPS consultou** (mais provável): a aba da TopstepX/plataforma ficou em segundo plano, o Chrome freou os envios, a extensão parou ou o POST foi recusado como "atrasado" (idade > 15 s). O `matched` já é 0 antes de qualquer conta de relógio, por isso o relógio não explica esse caso.
- **B — Chave antiga na VPS** (`WOW_VPS_TOKEN` gravado antes de 15:29): daria 401. Isso só vale se o script mostrar "HTTPS OK" sem verificar o código HTTP. Confirmar no teste.
- **C — Pacote diferente na VPS:** o `diagnostico_v4.py` que roda não é o que você leu (outra pasta, cópia antiga). Confirmar pelo hash do arquivo.
- **Descartadas pelas evidências:** chave de outro usuário, cursor > 0, campo fora do `payload`, tipo de `relay_version`/`card_confirmed`, ordem dos ids.

## Próximo passo único

Com a TopstepX e a plataforma **abertas e visíveis** no PC local, rodar no CMD da VPS o teste só de leitura abaixo e, **no mesmo minuto**, eu leio o banco para comparar. Ele não faz ordem, não mostra a chave e não altera nada.

```python
# sonda_leitura_v4.py — SOMENTE GET, nao exibe a chave
import os, json, time, hashlib, getpass, urllib.request, email.utils
URL="https://win-or-win.lovable.app/api/public/topstep-vps/observacoes/?after=0"
tok=os.environ.get("WOW_VPS_TOKEN") or getpass.getpass("chave: ")
print("prefixo_ok:", tok.startswith("wowvps_"), "| hash_fim:", hashlib.sha256(tok.encode()).hexdigest()[-8:])
print("hash_diagnostico_v4.py:", hashlib.sha256(open("diagnostico_v4.py","rb").read()).hexdigest()[-12:] if os.path.exists("diagnostico_v4.py") else "arquivo nao esta nesta pasta")
req=urllib.request.Request(URL,headers={"Authorization":"Bearer "+tok,"Accept":"application/json"})
try:
    r=urllib.request.urlopen(req,timeout=8); st=r.status; hd=r.headers; body=r.read()
except urllib.error.HTTPError as e:
    st=e.code; hd=e.headers; body=e.read()
now=int(time.time()*1000)
srv=email.utils.parsedate_to_datetime(hd.get("Date")).timestamp()*1000 if hd.get("Date") else None
print("http:", st, "| tipo:", hd.get("Content-Type"), "| utc_vps:", time.strftime("%H:%M:%S", time.gmtime()), "| desvio_ms:", None if srv is None else int(now-srv))
try: d=json.loads(body)
except Exception: print("resposta nao e JSON"); raise SystemExit
print("ok:", d.get("ok"), "| mode:", d.get("mode"), "| relay_version:", d.get("relay_version"), "| erro:", d.get("error"))
ev=d.get("events") or []
print("eventos:", len(ev), "| next_cursor:", d.get("next_cursor"))
for e in ev[-4:]:
    p=e.get("payload") or {}
    print(e.get("id"), e.get("kind"), e.get("client_seq"), p.get("symbol"), p.get("card_confirmed"), "idade_ms:", now-int(e.get("observed_at_ms") or 0))
```

Me envie a saída (ela não contém a chave) e a hora em que rodou. Leitura do resultado:
- `http 401` → causa B (chave antiga): gerar nova chave e trocar `WOW_VPS_TOKEN`.
- `http 200`, `eventos: 0` → causa A: problema no envio da extensão, não na VPS.
- `eventos > 0` e o diagnóstico ainda reprova → causa C: comparar o hash do arquivo.

## Preservado em qualquer correção futura

Lote do card, leitores originais e 3 confirmações, antirreentrada, parciais, fechamento do hedge após troca de banca, isolamento por conta/ativo, somente DEMO. Nenhuma trava será afrouxada. Só proponho alteração depois de confirmar a causa.
