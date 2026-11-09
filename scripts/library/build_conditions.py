"""
Writes content/library/{en,ar}/conditions/<id>.json for the conditions in
conditions_a.py and conditions_b.py, using the shared wording in
templates.py. Existing files are never overwritten unless --force is given,
so hand edits and clinical review changes are kept.

    python3 scripts/library/build_conditions.py [--force]
    npm run library:index

New entries are written with "reviewed": false until a genetic counsellor
signs them off.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from templates import AR, EN  # noqa: E402
import conditions_a  # noqa: E402
import conditions_b  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
LAST_CHECKED = "2026-11-09"
# English short names that read in lower case mid-sentence.
LOWER_IN_SENTENCE = {
    "galactosemia", "homocystinuria", "biotinidase_deficiency", "propionic_acidemia",
    "glutaric_acidemia_type_1", "haemophilia", "polycystic_kidney_disease", "fragile_x_syndrome",
}


def build(c: dict, locale: str) -> dict:
    t = (EN if locale == "en" else AR)[c["inheritance"]]
    d = c[locale]
    custom_gene = f"gene_{locale}" in c
    gene = c[f"gene_{locale}"] if custom_gene else (f"the {c['gene']} gene" if locale == "en" else f"جين {c['gene']}")
    name = d["short"]
    if locale == "en" and c["id"] in LOWER_IN_SENTENCE:
        name = name[0].lower() + name[1:]
    # "What does a test for ... involve?": the gene, or the condition when there are several genes.
    gene_q = gene if not custom_gene else (name if locale == "en" else d["short"])

    def fill(s: str) -> str:
        return s.format(gene=gene, name=name, short=d["short"])

    questions = [fill(q) for q in t["suggested_questions"]]
    questions[2] = t["suggested_questions"][2].format(gene=gene_q)

    entry = {
        "id": c["id"],
        "kind": "condition",
        "locale": locale,
        "inheritance": c["inheritance"],
        "gene": c["gene"],
        "area": c["area"],
        "title": d["title"],
        "aliases": d["aliases"],
        "synonyms": c["synonyms"],
        "everyday_terms": d["everyday"],
        "summary": d["summary"],
        "inheritance_plain": d.get("inheritance_plain") or fill(t["inheritance_plain"]),
        "carrier_meaning": d.get("carrier_meaning") or t["carrier_meaning"],
        "disease_meaning": d["disease_meaning"],
        "screening": d.get("screening") or fill(t["screening"]),
        "suggested_questions": questions,
        "card_summary": d["card"],
        "carrier_label": d.get("carrier_label") or fill(t["carrier_label"]),
        "disease_label": d.get("disease_label") or d["title"],
        "carrier_short": d.get("carrier_short") or t["carrier_short"],
        "disease_short": d["disease_short"],
        "care": d["care"],
        "counsellor_questions": t["counsellor_questions"],
        "sources": [
            {
                "title": c["src_title"],
                "publisher": "MedlinePlus Genetics (U.S. National Library of Medicine)",
                "url": f"https://medlineplus.gov/genetics/condition/{c['slug']}/",
            }
        ],
        "reviewed": False,
        "last_checked": LAST_CHECKED,
        "audio": f"/audio/{locale}/conditions/{c['id']}.mp3",
    }
    if c.get("always_escalate"):
        entry = {**{k: entry[k] for k in list(entry)[:6]}, "always_escalate": True, **{k: entry[k] for k in list(entry)[6:]}}
    return entry


def main() -> None:
    force = "--force" in sys.argv
    written = skipped = 0
    for c in conditions_a.CONDITIONS + conditions_b.CONDITIONS:
        for locale in ("en", "ar"):
            path = os.path.join(ROOT, "content", "library", locale, "conditions", f"{c['id']}.json")
            if os.path.exists(path) and not force:
                skipped += 1
                continue
            with open(path, "w", encoding="utf-8") as f:
                json.dump(build(c, locale), f, ensure_ascii=False, indent=2)
                f.write("\n")
            written += 1
    print(f"wrote {written} files, kept {skipped} existing")


if __name__ == "__main__":
    main()
