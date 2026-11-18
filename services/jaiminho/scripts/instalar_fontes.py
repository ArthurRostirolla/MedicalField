"""Usado só no build da imagem: extrai os WOFF dos pacotes do IBM Plex e regrava como TTF.

python instalar_fontes.py <pasta com os .tgz> <pasta de destino>
"""

import io
import sys
import tarfile
from pathlib import Path

from fontTools.ttLib import TTFont

origem, destino = Path(sys.argv[1]), Path(sys.argv[2])
destino.mkdir(parents=True, exist_ok=True)
total = 0
for pacote in sorted(origem.glob("*.tgz")):
    with tarfile.open(pacote) as tar:
        for membro in tar.getmembers():
            nome = Path(membro.name)
            if nome.name == "LICENSE.txt":
                (destino / f"LICENSE-{pacote.stem}.txt").write_bytes(tar.extractfile(membro).read())
            if nome.suffix != ".woff" or nome.parent.name != "woff" or "complete" not in nome.parts:
                continue
            fonte = TTFont(io.BytesIO(tar.extractfile(membro).read()))
            fonte.flavor = None
            fonte.save(destino / f"{nome.stem}.ttf")
            total += 1
print(f"{total} fontes instaladas em {destino}")
if total == 0:
    sys.exit("nenhuma fonte encontrada nos pacotes")
