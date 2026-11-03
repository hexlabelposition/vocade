"""Убирает из графа модели Vosk языковую модель для свободной речи (graph/Gr.fst, ~32 МБ).

Vocade всегда распознаёт по своей грамматике (числа), граф для неё vosk строит сам,
так что Gr.fst не нужен. Но vosk-browser без него модель не загружает, и словарь
(words.txt) берёт из таблицы символов внутри Gr.fst. Поэтому:
  1. достаём таблицу слов из Gr.fst в graph/words.txt;
  2. заменяем Gr.fst минимальным валидным VectorFst (одно финальное состояние).

Использование: python3 strip-lm.py <путь к graph/>
"""
import struct
import sys
from pathlib import Path

FST_MAGIC = 2125659606
SYMTAB_MAGIC = 2125658996
HAS_OSYMBOLS = 0x2


class Reader:
    def __init__(self, f):
        self.f = f

    def unpack(self, fmt):
        size = struct.calcsize(fmt)
        return struct.unpack(fmt, self.f.read(size))

    def string(self):
        (n,) = self.unpack('<i')
        return self.f.read(n).decode()


def read_symtab(r: Reader) -> list[tuple[str, int]]:
    (magic,) = r.unpack('<i')
    assert magic == SYMTAB_MAGIC, 'неожиданный формат таблицы символов'
    r.string()  # имя таблицы
    r.unpack('<q')  # available_key
    (size,) = r.unpack('<q')
    return [(r.string(), r.unpack('<q')[0]) for _ in range(size)]


def extract_words(gr: Path) -> list[tuple[str, int]]:
    with gr.open('rb') as f:
        r = Reader(f)
        (magic,) = r.unpack('<i')
        assert magic == FST_MAGIC, f'{gr} не похож на OpenFst'
        r.string()  # тип fst
        r.string()  # тип дуг
        _version, flags = r.unpack('<ii')
        r.unpack('<Qqqq')  # properties, start, numstates, numarcs
        assert flags & HAS_OSYMBOLS, f'в {gr} нет таблицы слов'
        isyms = read_symtab(r) if flags & 0x1 else None
        return read_symtab(r) if isyms is None or flags & HAS_OSYMBOLS else isyms


def s(text: str) -> bytes:
    b = text.encode()
    return struct.pack('<i', len(b)) + b


# свойства пустого ацикличного акцептора без весов (fst/properties.h)
STUB_PROPS = (
    0x1 | 0x10000 | 0x40000 | 0x100000 | 0x800000 | 0x2000000 | 0x8000000 | 0x10000000
    | 0x40000000 | 0x200000000 | 0x800000000 | 0x2000000000 | 0x4000000000
    | 0x10000000000 | 0x40000000000 | 0x100000000000 | 0x800000000000
)
STUB_FST = (
    struct.pack('<i', FST_MAGIC)
    + s('vector')
    + s('standard')
    + struct.pack('<ii', 2, 0)  # version, flags (без таблиц символов)
    + struct.pack('<Qqqq', STUB_PROPS, 0, 1, 0)  # properties, start, numstates, numarcs
    + struct.pack('<fq', 0.0, 0)  # состояние 0: финальный вес, число дуг
)

graph = Path(sys.argv[1])
gr = graph / 'Gr.fst'
words = extract_words(gr)
(graph / 'words.txt').write_text(''.join(f'{w} {k}\n' for w, k in words))
gr.write_bytes(STUB_FST)
print(f'words.txt: {len(words)} слов, Gr.fst заменён заглушкой')
