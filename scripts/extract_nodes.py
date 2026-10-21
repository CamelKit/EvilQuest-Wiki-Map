#!/usr/bin/env python3
"""
extract_nodes.py
Extracts gathering nodes, NPCs, POIs, and map metadata from official world-map data
and enriches them with object, harvest, and item definitions from the Wiki repository.
Outputs:
  - Wiki-Map/static/data/nodes.json
  - Wiki-Map/static/data/map-meta.json
"""

import os
import sys
import json
import argparse
import urllib.request

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
WIKI_DATA_DIR = os.path.join(REPO_ROOT, "Wiki", "data")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "data")

MAP_API_URL = "https://memoriesofmagic.com/api/world-map"

CATEGORY_METADATA = {
    "tea": {
        "name": "Tea Bushes",
        "icon": "🍵",
        "color": "#4ade80",
        "skill": "foraging",
    },
    "mining": {
        "name": "Mining Rocks",
        "icon": "⛏️",
        "color": "#f59e0b",
        "skill": "mining",
    },
    "woodcutting": {
        "name": "Trees",
        "icon": "🪓",
        "color": "#ca8a04",
        "skill": "woodcutting",
    },
    "fishing": {
        "name": "Fishing Spots",
        "icon": "🐟",
        "color": "#38bdf8",
        "skill": "fishing",
    },
    "farming": {
        "name": "Farming & Foraging",
        "icon": "🌾",
        "color": "#84cc16",
        "skill": "farming",
    },
    "station": {
        "name": "Crafting Stations",
        "icon": "🔥",
        "color": "#fb923c",
        "skill": "crafting",
    },
    "bank": {
        "name": "Banks",
        "icon": "🏦",
        "color": "#eab308",
        "skill": None,
    },
    "water": {
        "name": "Water Sources",
        "icon": "💧",
        "color": "#60a5fa",
        "skill": None,
    },
    "chest": {
        "name": "Chests",
        "icon": "📦",
        "color": "#fbbf24",
        "skill": "thieving",
    },
    "entrance": {
        "name": "Dungeons & Entrances",
        "icon": "🚪",
        "color": "#c084fc",
        "skill": None,
    }
}


def load_json_file(path):
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def fetch_official_map_data(cache_path=None):
    if cache_path and os.path.exists(cache_path):
        print(f"Loading cached map data from {cache_path}...")
        return load_json_file(cache_path)

    print(f"Fetching live map data from {MAP_API_URL}...")
    req = urllib.request.Request(
        MAP_API_URL,
        headers={"User-Agent": "Mozilla/5.0 (EvilQuestWiki MapExtractor/1.0)"}
    )
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    if cache_path:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        print(f"Saved cache to {cache_path}")

    return data


def format_subcat_label(subcat, category):
    words = subcat.replace("-", " ").replace("_", " ").split()
    capitalized = " ".join(w.capitalize() for w in words)
    if category == "tea" and not capitalized.endswith("Tea Bush"):
        return f"{capitalized} Tea Bush"
    if category == "mining" and not capitalized.endswith("Rock"):
        return f"{capitalized} Rock"
    if category == "woodcutting" and not (capitalized.endswith("Tree") or capitalized == "Tree"):
        return f"{capitalized} Tree"
    return capitalized


def main():
    parser = argparse.ArgumentParser(description="Extract world map gathering nodes & POIs")
    parser.add_argument("--fetch", action="store_true", help="Force fetch live map from API")
    parser.add_argument("--cache", default=None, help="Custom path to cached world_map.json")
    args = parser.parse_args()

    # Determine cache file location
    default_cache = os.path.join(
        os.path.expanduser("~"),
        ".gemini", "antigravity-ide", "brain",
        "3e9baaf5-fa0f-457f-9e77-b2e9593252ae", "scratch", "world_map.json"
    )
    cache_path = args.cache or (default_cache if os.path.exists(default_cache) else None)
    if args.fetch:
        cache_path = None

    raw_data = fetch_official_map_data(cache_path)
    map_obj = raw_data.get("map", {})
    if not map_obj:
        print("Error: Invalid map payload from API.")
        sys.exit(1)

    # Load Wiki reference datasets
    mapping_data = load_json_file(os.path.join(WIKI_DATA_DIR, "WorldObjectMappingData.json")) or {}
    object_list = load_json_file(os.path.join(WIKI_DATA_DIR, "ObjectData.json")) or []
    item_list = load_json_file(os.path.join(WIKI_DATA_DIR, "ItemData.json")) or []

    mesh_map = mapping_data.get("meshMappings", {})
    categorized = mapping_data.get("categorized", {})
    tea_bush_defs = {tb["key"]: tb for tb in mapping_data.get("teaBushes", [])}
    object_defs = {o["id"]: o for o in object_list}
    item_defs = {it["id"]: it for it in item_list}

    # Extract map metadata
    map_meta = {
        "id": map_obj.get("id", "world-map"),
        "name": map_obj.get("name", "World Map"),
        "width": map_obj.get("width", 768),
        "height": map_obj.get("height", 960),
        "originX": map_obj.get("originX", -192),
        "originZ": map_obj.get("originZ", -448),
        "chunkSize": map_obj.get("chunkSize", 32),
        "waterLevel": map_obj.get("waterLevel", -2.5),
        "spawnPoint": map_obj.get("spawnPoint", {"x": 384.5, "z": 576.5}),
        "generatedAt": raw_data.get("generatedAt"),
        "updatedAt": map_obj.get("updatedAt")
    }

    # Extract POIs (minimap markers)
    pois = []
    for m in map_obj.get("minimapMarkers", []):
        pois.append({
            "id": m.get("id"),
            "name": m.get("label") or m.get("icon", "").replace("_Icon_Small.png", "").replace("_Icon.png", "").replace(".png", "").replace("_", " "),
            "icon": m.get("icon"),
            "x": round(m.get("x", 0), 2),
            "z": round(m.get("z", 0), 2),
            "size": m.get("size", 16)
        })

    # Extract NPC spawns
    npcs = []
    for npc in map_obj.get("npcSpawns", []):
        npcs.append({
            "npcId": npc.get("npcId"),
            "name": npc.get("name"),
            "x": round(npc.get("x", 0), 2),
            "z": round(npc.get("z", 0), 2),
            "floor": npc.get("floor", 0),
            "wanderRange": npc.get("wanderRange", 0)
        })

    # Extract Gathering and Interactive Nodes
    raw_objects = map_obj.get("objects", [])
    extracted_nodes = []
    category_subcats = {}  # { cat: { subcat: { count, name, outputItem, ... } } }

    for idx, obj in enumerate(raw_objects):
        aid = obj.get("assetId")
        if not aid or aid not in mesh_map:
            continue

        def_id = mesh_map[aid]
        odef = object_defs.get(def_id, {})

        cat = None
        subcat = None

        if aid in categorized.get("miningRocks", {}):
            cat = "mining"
            name_clean = odef.get("name", aid).replace(" Rock", "").strip().lower()
            subcat = name_clean
        elif aid in categorized.get("trees", {}):
            cat = "woodcutting"
            name_clean = odef.get("name", aid).replace(" tree", "").replace("Tree", "").strip().lower()
            subcat = name_clean if name_clean else "tree"
        elif "tea-bush" in aid:
            cat = "tea"
            subcat = aid.replace("-tea-bush-full", "").lower()
        elif "FishingSpot" in aid:
            cat = "fishing"
            subcat = aid.replace("FishingSpotBubbles", "").lower()
        elif odef.get("category") == "craftingstation" or aid in [
            "forge", "cookingrange", "anvil", "Pottery wheel", "Kiln",
            "Spinning Wheel", "Spinning wheel", "SpinningWheel", "spinning wheel", "Altar"
        ]:
            cat = "station"
            subcat = odef.get("name", aid).lower()
        elif aid in ["BankBooth", "BankChest"]:
            cat = "bank"
            subcat = "bank"
        elif aid in ["Flax", "wheat", "wheat2", "PotatoPlant", "CauliflowerPlant", "rice"]:
            cat = "farming"
            subcat = odef.get("name", aid).lower()
        elif "chest" in aid.lower():
            cat = "chest"
            subcat = aid.lower()
        elif aid in ["well", "desert well", "desert fountain", "town fountain"]:
            cat = "water"
            subcat = "well"
        elif aid in [
            "cavedoor", "CavernEntrance1", "MineEntrance", "WallCrack",
            "CavernExit1", "TempleEntrance", "TempleEntranceInside", "Ladder",
            "sewer city entrance ladder down", "PyramidEntryClosed"
        ]:
            cat = "entrance"
            subcat = odef.get("name", aid).lower()

        if not cat:
            continue

        # Format node info
        node_name = odef.get("name") or aid
        harvest = odef.get("harvest")

        # Enrich harvest details if missing
        if not harvest and cat == "tea":
            # Lookup in tea_bush_defs
            tb = tea_bush_defs.get(subcat)
            if tb:
                harvest = {
                    "skill": "foraging",
                    "action": "Forage",
                    "outputItemId": tb.get("leafItemId"),
                    "outputItemName": tb.get("leafItemName")
                }

        output_item_name = harvest.get("outputItemName") if harvest else None
        output_item_id = harvest.get("outputItemId") if harvest else None

        node_item = {
            "id": f"n{idx}",
            "name": node_name,
            "category": cat,
            "subCategory": subcat,
            "assetId": aid,
            "defId": def_id,
            "x": round(obj["x"], 2),
            "z": round(obj["z"], 2),
            "y": round(obj.get("y", 0), 2),
            "floor": obj.get("floor", 0),
        }

        if harvest:
            node_item["harvest"] = {
                "skill": harvest.get("skill"),
                "action": harvest.get("action", "Gather"),
                "outputItem": output_item_name,
                "outputItemId": output_item_id,
                "tool": harvest.get("toolName"),
                "reqItem": harvest.get("requiredItemName")
            }

        extracted_nodes.append(node_item)

        # Track category and subcategory counts
        if cat not in category_subcats:
            category_subcats[cat] = {}
        if subcat not in category_subcats[cat]:
            category_subcats[cat][subcat] = {
                "id": subcat,
                "label": format_subcat_label(subcat, cat),
                "count": 0,
                "outputItem": output_item_name,
                "outputItemId": output_item_id
            }
        category_subcats[cat][subcat]["count"] += 1

    # Build structured category catalog for the UI filter sidebar
    categories_catalog = []
    for cat_id, meta in CATEGORY_METADATA.items():
        if cat_id not in category_subcats:
            continue
        subcat_dict = category_subcats[cat_id]
        sorted_subcats = sorted(subcat_dict.values(), key=lambda s: (-s["count"], s["label"]))
        total_count = sum(s["count"] for s in sorted_subcats)

        categories_catalog.append({
            "id": cat_id,
            "name": meta["name"],
            "icon": meta["icon"],
            "color": meta["color"],
            "skill": meta.get("skill"),
            "count": total_count,
            "subcategories": sorted_subcats
        })

    # Prepare final payload
    payload = {
        "meta": map_meta,
        "categories": categories_catalog,
        "nodes": extracted_nodes,
        "pois": pois,
        "npcs": npcs
    }

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_nodes_path = os.path.join(OUTPUT_DIR, "nodes.json")
    out_meta_path = os.path.join(OUTPUT_DIR, "map-meta.json")

    with open(out_nodes_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    with open(out_meta_path, "w", encoding="utf-8") as f:
        json.dump(map_meta, f, indent=2)

    print(f"✅ Extracted {len(extracted_nodes)} gathering nodes across {len(categories_catalog)} categories.")
    print(f"✅ Extracted {len(pois)} POIs and {len(npcs)} NPC spawns.")
    print(f"📦 Output saved to: {out_nodes_path} ({os.path.getsize(out_nodes_path) / 1024:.1f} KB)")
    print(f"📦 Map metadata saved to: {out_meta_path}")


if __name__ == "__main__":
    main()
