"""Збирає public/data/catalog.json із сирого знімка каталогу happylight.in.ua.

Вхід: scrape.json ({шлях_сторінки: {title, prods: [...]}}) + папка з фото (img/<ключ>.webp)
і imgmap.json ({url_оригіналу: ім'я_файлу}). Вихід: catalog.json і фото в public/assets/img/p/.

Запуск: python3 -I tools/build_catalog.py <папка_знімка> <корінь_public>
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from datetime import date
from pathlib import Path
from typing import Any

# категорії: шлях на старому сайті → id, назва, коротка назва, родина конфігуратора
CATS: list[tuple[str, str, str, str]] = [
    ("/lampynakalivaniya", "r25", "Ретро · лампи розжарювання 25 Вт", "Розжарювання 25 Вт"),
    ("/filamentnaya4vat", "f4", "Ретро · філаментні LED 4 Вт", "Філамент LED 4 Вт"),
    ("/filamentnye8vat", "f8", "Ретро · філаментні LED 8 Вт", "Філамент LED 8 Вт"),
    ("/matovye4vat", "m4", "Ретро · матові LED 4 Вт", "Матові LED 4 Вт"),
    ("/matovye1vat", "m1", "Ретро · економні LED 1 Вт", "LED 1 Вт"),
    ("/beltlight", "belt", "Belt Light на плоскому дроті", "Belt Light"),
    ("/loppylight", "loppy", "Loppy Light зі звисаючими лампами", "Loppy Light"),
    ("/profi-light", "profi", "Світлодіодні Profi-light", "Profi-light"),
    ("/bezlamp", "bez", "Гірлянди без ламп", "Без ламп"),
    ("/vnutrishni", "home", "Гірлянди для дому", "Для дому"),
    ("/page30939089.html", "lamps", "Лампочки", "Лампочки"),
    ("/accessories", "acc", "Аксесуари для монтажу", "Аксесуари"),
    ("/lihtari", "lights", "Ліхтарі та powerbank", "Ліхтарі"),
    ("/figury", "fig", "Новорічні фігури", "Новорічні фігури"),
]
CFG_FAMILIES = {"r25", "f4", "f8", "m4", "m1"}


FIX_TITLES = {
    "запас провода к розетке": "Запас дроту до розетки",
    "запасные лампочки": "Запасні лампочки",
    "цвет провода": "Колір дроту",
    "запас дроту розетки": "Запас дроту до розетки",
    "запас дроту да розетки": "Запас дроту до розетки",
    "регулиювання яскравості": "Регулювання яскравості",
    "регулятор яскравості(для ламп розжарювання)": "Регулятор яскравості (для ламп розжарювання)",
    "регулятор яскравості( для ламп розжарювання)": "Регулятор яскравості (для ламп розжарювання)",
}
FIX_LABELS = {"Черный": "Чорний", "Белый": "Білий", "2м": "2 м", "З меререхтінням": "З мерехтінням", "Без меререхтіння": "Без мерехтіння"}


def fix_addon(title: str, opts: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    t = FIX_TITLES.get(title.strip().lower(), title.strip())
    for o in opts:
        o["l"] = FIX_LABELS.get(o["l"], o["l"])
    # на старому сайті «Колір дроту» інколи містить колір світіння
    if re.match(r"^колір дроту$", t, re.I) and any(re.search(r"холодн|тепл", o["l"], re.I) for o in opts):
        t = "Колір світіння"
    # для кольору та мерехтіння «Обрати» не має сенсу: типовим стає перший реальний варіант
    if re.match(r"^(колір|мерехтіння)", t, re.I):
        opts = [o for o in opts if o["l"] != "Не потрібно"] or opts
    return t, opts


def plural(n: int, one: str, few: str, many: str) -> str:
    """Українська множина: 1 лампа, 2 лампи, 5 ламп."""
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def norm_variant(label: str) -> tuple[str, int | None, int | None]:
    """'5 метрів 11 ламп' → ('5 м · 11 ламп', 5, 11)."""
    m = re.match(r"^\s*(\d+(?:[.,]\d+)?)\s*(?:м|метр\w*|метров)\s*[/·,]?\s*(\d+)\s*(ламп\w*|патрон\w*)", label, re.I)
    if not m:
        return label.strip(), None, None
    metres = int(float(m.group(1).replace(",", ".")))
    count = int(m.group(2))
    word = plural(count, "лампа", "лампи", "ламп") if m.group(3).lower().startswith("ламп") else plural(count, "патрон", "патрони", "патронів")
    return f"{metres} м · {count} {word}", metres, count


def norm_addon_option(text: str) -> dict[str, Any]:
    """'диммер до 1.5 кВт - 400 грн' → {'l': 'Диммер до 1,5 кВт', 'p': 400}."""
    t = text.strip()
    if t.lower() in {"обрати", "выбрать", "оберіть"}:
        return {"l": "Не потрібно", "p": 0}
    m = re.match(r"^(.*?)\s*[-–—]\s*(\d[\d\s]*)\s*(?:грн\.?)?\s*$", t) or re.match(r"^(.*?)\s+(\d[\d\s]*)\s*грн\.?\s*$", t)
    label, price = (m.group(1), int(re.sub(r"\s", "", m.group(2)))) if m else (t, 0)
    label = re.sub(r"(\d)\.(\d)", r"\1,\2", label).strip()
    label = label[:1].upper() + label[1:]
    return {"l": label, "p": price}


def slug_cfg(name: str) -> tuple[str | None, int | None]:
    place = "out" if re.search(r"вулич", name, re.I) else "in" if re.search(r"внутр", name, re.I) else None
    st = re.search(r"(\d+)\s*см", name)
    return place, int(st.group(1)) if st else None


def build(snap: Path, public: Path) -> dict[str, Any]:
    raw: dict[str, Any] = json.loads((snap / "scrape.json").read_text(encoding="utf-8"))
    imgmap: dict[str, str] = json.loads((snap / "imgmap.json").read_text(encoding="utf-8"))
    out_img = public / "assets" / "img" / "p"
    out_img.mkdir(parents=True, exist_ok=True)

    cats: list[dict[str, str]] = []
    products: list[dict[str, Any]] = []
    by_key: dict[str, dict[str, Any]] = {}
    for path, cid, title, short in CATS:
        page = raw.get(path)
        if not page or not page.get("prods"):
            print(f"! порожньо: {path}", file=sys.stderr)
            continue
        cats.append({"id": cid, "title": title, "short": short})
        for i, p in enumerate(page["prods"]):
            name = re.sub(r"\s+", " ", p.get("name") or "").strip()
            if not name:
                continue
            variants = []
            for v in p.get("variants") or []:
                label, metres, count = norm_variant(v["label"])
                variants.append({"l": label, "p": v.get("price"), "o": v.get("old"), "m": metres, "n": count})
            price = min([v["p"] for v in variants if v["p"]] or [p.get("price") or 0])
            # одна позиція може бути в кількох категоріях (наприклад, «без ламп»)
            # товари без ціни в картці (аксесуари) розрізняємо ще й за описом
            key = f"{name}|{price}|{p.get('img') or ''}" + ("" if price else f"|{(p.get('descr') or '')[:60]}")
            if key in by_key:
                by_key[key]["cats"].append(cid)
                continue
            pid = f"{cid}-{i + 1:02d}"
            img_src = p.get("img") or ""
            img_file = imgmap.get(img_src)
            img_rel = ""
            if img_file and (snap / "img" / img_file).exists():
                shutil.copyfile(snap / "img" / img_file, out_img / f"{pid}.webp")
                img_rel = f"assets/img/p/{pid}.webp"
            # аксесуари: ціна й одиниця лише в тексті картки («Ціна - 20 грн за 1 метр»)
            unit = ""
            if not variants and not p.get("price"):
                m = re.search(r"Ціна\s*[-–—:]\s*(\d[\d\s]*)\s*грн\s*(?:за\s*([^.]+))?", p.get("text") or p.get("descr") or "")
                if m:
                    price = int(re.sub(r"\s", "", m.group(1)))
                    unit = (m.group(2) or "").strip()
            addons = []
            for a in p.get("addons") or []:
                # «Кількість» на старому сайті дублює лічильник кошика й має інші ціни: не переносимо
                if re.match(r"^\s*(кількість|количество)", a.get("title") or "", re.I):
                    continue
                opts = [norm_addon_option(o) for o in a.get("options") or []]
                if not opts:
                    continue
                title, opts = fix_addon(a.get("title") or "Опція", opts)
                # «Довжина гірлянди» в Profi-light: це повна ціна за довжину, а не доплата → робимо варіантами
                if re.match(r"^довжина", title, re.I) and not variants:
                    for o in opts:
                        mm = re.match(r"^(\d+)\s*м", o["l"])
                        if o["p"] and mm:
                            variants.append({"l": f"{mm.group(1)} м", "p": o["p"], "o": None, "m": int(mm.group(1)), "n": None})
                    if variants:
                        price = min(v["p"] for v in variants)
                        p["editionTitle"] = "Довжина"
                    continue
                addons.append({"t": title, "o": opts})
            if not price:
                print(f"! без ціни, пропущено: {name}", file=sys.stderr)
                continue
            item: dict[str, Any] = {
                "id": pid, "cats": [cid], "name": name,
                "descr": re.sub(r"\s*Ціна\s*[-–—:].*$", "", re.sub(r"\s+", " ", p.get("descr") or "")).strip(),
                "unit": unit,
                "img": img_rel, "price": price or None,
                "old": (variants[0]["o"] if variants else p.get("old")) or None,
                "vt": (p.get("editionTitle") or "Варіант").strip() if variants else "",
                "variants": variants, "addons": addons,
            }
            if cid in CFG_FAMILIES:
                place, step = slug_cfg(name)
                if place and step:
                    item["cfg"] = {"fam": cid, "place": place, "step": step}
            by_key[key] = item
            products.append(item)
    return {"v": 1, "updated": date.today().isoformat(), "cats": cats, "products": products}


if __name__ == "__main__":
    snap_dir, public_dir = Path(sys.argv[1]), Path(sys.argv[2])
    data = build(snap_dir, public_dir)
    (public_dir / "data").mkdir(parents=True, exist_ok=True)
    (public_dir / "data" / "catalog.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"категорій: {len(data['cats'])}, товарів: {len(data['products'])}, з фото: {sum(1 for p in data['products'] if p['img'])}")
