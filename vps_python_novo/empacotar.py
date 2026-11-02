"""Gera um ZIP unico da pasta, sem .env, dados, .venv e caches."""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
EXCLUIR_PASTAS = {".venv", "dados", "__pycache__", ".pytest_cache", "dist"}
EXCLUIR_ARQ = {".env"}


def empacotar(destino: Path) -> list[str]:
    destino.parent.mkdir(parents=True, exist_ok=True)
    nomes = []
    with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(RAIZ.rglob("*")):
            rel = f.relative_to(RAIZ)
            if f.is_dir() or set(rel.parts) & EXCLUIR_PASTAS or f.name in EXCLUIR_ARQ or f.suffix == ".pyc":
                continue
            nome = f"WinOrWin_VPS_Novo/{rel.as_posix()}"
            z.write(f, nome)
            nomes.append(nome)
    return nomes


if __name__ == "__main__":
    alvo = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "dist" / "WinOrWin_VPS_Novo.zip"
    for n in empacotar(alvo):
        print(n)
    print("ZIP:", alvo)
