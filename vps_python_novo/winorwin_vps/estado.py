"""Estado persistente com gravacao atomica (arquivo temporario + os.replace)."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

VERSAO = 1
MAX_EVENTOS = 5000


def estado_vazio() -> dict[str, Any]:
    return {"versao": VERSAO, "cursor": 0, "origens": {}, "eventos_processados": []}


def chave_origem(conta: str, simbolo: str) -> str:
    return f"{conta}|{simbolo}"


class Estado:
    def __init__(self, caminho: str):
        self.caminho = Path(caminho)
        self.dados = estado_vazio()
        self._vistos: set[str] = set()

    def carregar(self) -> "Estado":
        if self.caminho.exists():
            d = json.loads(self.caminho.read_text(encoding="utf-8"))
            if not isinstance(d, dict) or d.get("versao") != VERSAO:
                raise ValueError("estado.json com versao desconhecida")
            self.dados = {**estado_vazio(), **d}
        self._vistos = set(self.dados["eventos_processados"])
        return self

    def salvar(self) -> None:
        self.caminho.parent.mkdir(parents=True, exist_ok=True)
        self.dados["eventos_processados"] = self.dados["eventos_processados"][-MAX_EVENTOS:]
        fd, tmp = tempfile.mkstemp(dir=str(self.caminho.parent), prefix=".estado-", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(self.dados, f, ensure_ascii=False, indent=1)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, self.caminho)
        except Exception:
            if os.path.exists(tmp):
                os.remove(tmp)
            raise

    # --- idempotencia ---
    def ja_processado(self, event_id: str) -> bool:
        return event_id in self._vistos

    def marcar(self, event_id: str) -> None:
        if event_id not in self._vistos:
            self._vistos.add(event_id)
            self.dados["eventos_processados"].append(event_id)

    # --- origens (conta TopstepX + ativo) ---
    def origem(self, conta: str, simbolo: str) -> dict[str, Any] | None:
        return self.dados["origens"].get(chave_origem(conta, simbolo))

    def gravar_origem(self, conta: str, simbolo: str, o: dict[str, Any]) -> None:
        self.dados["origens"][chave_origem(conta, simbolo)] = o

    def origens_ativas(self) -> dict[str, dict]:
        return {k: v for k, v in self.dados["origens"].items() if v.get("volume_mt5", 0) > 0}
