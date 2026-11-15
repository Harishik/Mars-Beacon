"""Print the References and Space Agency Data page text from sources_registry.json.
Usage: python references.py > page_text.md"""
import json
from pathlib import Path

rows = json.loads((Path(__file__).parent / "sources_registry.json").read_text())["sources"]
print("## References\n")
for r in rows:
    lic = r.get("licence") or "licence: VERIFY at source"
    print(f"- {r['product']} ({r['mission']}). {r['link']} . {lic} . Credit: {r['credit']} . Used for: {r['used_in']}.")
print("\n## Space Agency Data (NASA and partner data)\n")
for r in rows:
    if r.get("space_agency_data"):
        tie = f" Resources tab item: {r['resource_item']}." if r.get("resource_item") else ""
        print(f"- {r['product']} [{r['mission']}]. Used for: {r['used_in']}.{tie}")
print("\n## Resources tab items used (global awards need at least one)\n")
for r in rows:
    if r.get("resource_item"):
        print(f"- {r['resource_item']}: {r['used_in']}")
todo = [r["product"] for r in rows if str(r["status"]).startswith("VERIFY") or (not r.get("licence") and r["type"] == "library")]
print("\n<!-- STILL TO VERIFY before submitting: " + "; ".join(todo) + " -->")
