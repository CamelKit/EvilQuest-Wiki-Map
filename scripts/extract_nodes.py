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
import re
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
    if subcat == "glasswort":
        return "Glasswort Bush"
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
    def clean_poi_name(label, icon):
        if label:
            return label
        clean = re.sub(r'\.(?:png|webp)$', '', icon, flags=re.I)
        clean = re.sub(r'(?:_Icon)?_Small(?:-2)?$', '', clean, flags=re.I)
        clean = re.sub(r'_Icon(?:_[A-Za-z0-9]+)?$', '', clean, flags=re.I)
        clean = re.sub(r'[_-]+', ' ', clean).strip()
        low = clean.lower()
        if 'woodcutting' in low: return 'Woodcutting'
        if 'mining' in low: return 'Mining'
        if 'fish' in low: return 'Fishing'
        if 'bank' in low: return 'Bank'
        if 'cooking' in low or 'range' in low: return 'Cooking Range'
        if 'anvil' in low: return 'Anvil'
        if 'furnace' in low: return 'Furnace'
        if 'good magic' in low: return 'Good Magic Altar'
        if 'evil magic' in low: return 'Evil Magic Altar'
        if 'water' in low: return 'Water'
        if 'dungeon' in low: return 'Dungeon'
        if 'quest' in low: return 'Quest'
        if 'pub' in low: return 'Pub'
        if 'armour' in low: return 'Armour Store'
        if 'weapon' in low: return 'Weapon Store'
        if 'agility' in low: return 'Agility Course'
        return clean

    pois = []
    for m in map_obj.get("minimapMarkers", []):
        mx = round(m.get("x", 0), 2)
        mz = round(m.get("z", 0), 2)
        # Check for Desert North mine entrance marker (458.99, 658.38) -> Place The Sultan's Mine with mining icon
        if abs(mx - 459.0) < 2 and abs(mz - 658.4) < 2:
            pois.append({
                "id": "poi_sultans_mine",
                "name": "The Sultan's Mine",
                "icon": "Mining_Icon_Small.png",
                "x": mx,
                "z": mz,
                "size": m.get("size", 16),
                "map": "surface",
                "targetMap": "underground",
                "targetX": 114.5,
                "targetZ": 163.5,
                "targetLabel": "The Sultan's Mine"
            })
            continue

        pois.append({
            "id": m.get("id"),
            "name": clean_poi_name(m.get("label"), m.get("icon", "")),
            "icon": m.get("icon"),
            "x": mx,
            "z": mz,
            "size": m.get("size", 16),
            "map": "surface"
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
            "wanderRange": npc.get("wanderRange", 0),
            "map": "surface"
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
        elif "tea-bush" in aid or "glasswort-bush" in aid:
            cat = "tea"
            subcat = aid.replace("-tea-bush-full", "").replace("-bush-full", "").lower()
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
            "map": "surface"
        }

        # Link known surface entrances to underground destinations
        if cat == "entrance":
            nx, nz = node_item["x"], node_item["z"]
            if abs(nx - 625.5) < 3 and abs(nz - 327.5) < 3:
                node_item["name"] = "Sewer Entrance (Wibergis)"
                node_item["targetMap"] = "underground"
                node_item["targetX"] = 625.5
                node_item["targetZ"] = 327.5
                node_item["targetLabel"] = "Wibergis Sewers"
            elif abs(nx - 492.0) < 3 and abs(nz - 424.5) < 3:
                node_item["name"] = "Cavern Entrance (Gloomweb North)"
                node_item["targetMap"] = "underground"
                node_item["targetX"] = 492.0
                node_item["targetZ"] = 424.5
                node_item["targetLabel"] = "Gloomweb Swamp Caves (North)"
            elif abs(nx - 471.5) < 3 and abs(nz - 443.0) < 3:
                node_item["name"] = "Cavern Entrance (Gloomweb West)"
                node_item["targetMap"] = "underground"
                node_item["targetX"] = 471.5
                node_item["targetZ"] = 443.0
                node_item["targetLabel"] = "Gloomweb Swamp Caves (West)"
            elif abs(nx - 247.0) < 3 and abs(nz - 544.0) < 3:
                node_item["name"] = "Cave Entrance (Mountain Cavern)"
                node_item["targetMap"] = "underground"
                node_item["targetX"] = 247.0
                node_item["targetZ"] = 544.0
                node_item["targetLabel"] = "Mountain Cavern"
            elif (abs(nx - 504.0) < 3 and abs(nz - 605.5) < 3) or (abs(nx - 513.0) < 5 and abs(nz - 580.0) < 5):
                node_item["name"] = "Dungeon Entrance (Crypt / Prison)"
                node_item["targetMap"] = "underground"
                node_item["targetX"] = 513.0
                node_item["targetZ"] = 580.0
                node_item["targetLabel"] = "Graveyard Crypts & Prison"
            elif abs(nx - 459.0) < 3 and abs(nz - 658.8) < 3:
                # Handled as unified The Sultan's Mine POI with mining icon; skip entrance node to prevent overlapping icons
                continue
            elif abs(nx - 469.5) < 3 and abs(nz - 804.5) < 3:
                node_item["name"] = "Mine Entrance (Desert Rail Depths)"
                node_item["targetMap"] = "underground"
                node_item["targetX"] = 469.5
                node_item["targetZ"] = 804.5
                node_item["targetLabel"] = "Desert Rail Network"
            elif abs(nx - 341.0) < 3 and abs(nz - 709.0) < 3:
                node_item["name"] = "Tomb Entrance (Catacombs)"
                node_item["targetMap"] = "underground"
                node_item["targetX"] = 341.0
                node_item["targetZ"] = 709.0
                node_item["targetLabel"] = "Ancient Desert Tomb / Catacombs"

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

    # --- INJECT SULTAN'S MINE AND SUBTERRANEAN POIS, NPCS, AND NODES ---
    # 1. Sultan's Mine POIs
    underground_pois = [
        {"id": "ug_poi_sultan_exit", "name": "Surface Exit", "icon": "Dungeon_Icon.png", "x": 115.06, "z": 165.49, "size": 16, "map": "underground", "targetMap": "surface", "targetX": 459.0, "targetZ": 658.38, "targetLabel": "Desert Surface (267, 211)"},
        {"id": "ug_poi_sultan_anvil", "name": "Mine Anvil", "icon": "Anvil_Icon_Small.png", "x": 144.0, "z": 125.5, "size": 16, "map": "underground"},
        {"id": "ug_poi_sultan_vault", "name": "Sultan's Vault", "icon": "Chest_Icon_Small.png", "x": 147.0, "z": 133.5, "size": 16, "map": "underground"},
        {"id": "ug_poi_mithril_vein", "name": "Deep Mithril Vein", "icon": "Mining_Icon_Small.png", "x": 140.0, "z": 104.0, "size": 16, "map": "underground"}
    ]
    pois.extend(underground_pois)

    # 3. Sultan's Mine authentic NPCs (from models.json & server definitions)
    underground_npcs = [
        {"npcId": 108, "name": "Sultan's Royal Guard", "x": 118.0, "z": 155.0, "floor": 0, "wanderRange": 3, "map": "underground"},
        {"npcId": 105, "name": "Skeleton Warrior", "x": 138.0, "z": 108.0, "floor": 0, "wanderRange": 3, "map": "underground"},
        {"npcId": 106, "name": "Skeleton Warrior", "x": 142.0, "z": 114.0, "floor": 0, "wanderRange": 3, "map": "underground"},
        {"npcId": 107, "name": "Skeleton Warrior", "x": 145.0, "z": 128.0, "floor": 0, "wanderRange": 2, "map": "underground"},
        {"npcId": 180, "name": "Giant", "x": 105.0, "z": 120.0, "floor": 0, "wanderRange": 4, "map": "underground"},
        {"npcId": 18, "name": "Rat", "x": 122.0, "z": 140.0, "floor": 0, "wanderRange": 3, "map": "underground"},
        {"npcId": 2, "name": "Sewer Rat", "x": 130.0, "z": 150.0, "floor": 0, "wanderRange": 3, "map": "underground"}
    ]
    npcs.extend(underground_npcs)

    # 4. Extract authentic Sultan's Mine objects from extracted chunk files
    sultan_objs_dir = os.path.join(OUTPUT_DIR, "maps", "the_sultans_mine", "objects")
    sultan_nodes = []
    if os.path.exists(sultan_objs_dir):
        import glob
        for fpath in sorted(glob.glob(os.path.join(sultan_objs_dir, "*.json"))):
            chunk_data = load_json_file(fpath)
            if not chunk_data:
                continue
            items = chunk_data.values() if isinstance(chunk_data, dict) else chunk_data
            for obj in items:
                aid = obj.get("assetId")
                if not aid:
                    continue

                def_id = mesh_map.get(aid)
                odef = object_defs.get(def_id, {})

                cat = None
                subcat = None
                if aid in categorized.get("miningRocks", {}):
                    cat = "mining"
                    name_clean = odef.get("name", aid).replace(" Rock", "").strip().lower()
                    subcat = name_clean
                elif aid in ["anvil"]:
                    cat = "station"
                    subcat = "anvil"
                elif "chest" in aid.lower():
                    cat = "chest"
                    subcat = aid.lower()
                elif aid in ["CavernExit1"]:
                    cat = "entrance"
                    subcat = "cave exit"

                if not cat:
                    continue

                pos = obj.get("position", {})
                x = round(obj.get("x", pos.get("x", 0)), 2)
                y = round(obj.get("y", pos.get("y", 0)), 2)
                z = round(obj.get("z", pos.get("z", 0)), 2)

                node_name = odef.get("name", aid)
                node_item = {
                    "id": f"ug_sm_{len(sultan_nodes)}",
                    "name": "Surface Exit" if aid == "CavernExit1" else node_name,
                    "category": cat,
                    "subCategory": subcat,
                    "assetId": aid,
                    "defId": def_id,
                    "x": x,
                    "z": z,
                    "y": y,
                    "floor": 0,
                    "map": "underground"
                }

                if aid == "CavernExit1":
                    node_item["targetMap"] = "surface"
                    node_item["targetX"] = 459.0
                    node_item["targetZ"] = 658.38
                    node_item["targetLabel"] = "Desert Surface (267, 211)"

                harvest = odef.get("harvest")
                if harvest:
                    node_item["harvest"] = {
                        "skill": harvest.get("skill"),
                        "action": harvest.get("action", "Gather"),
                        "outputItem": harvest.get("outputItemName"),
                        "outputItemId": harvest.get("outputItemId"),
                        "tool": harvest.get("toolName"),
                        "reqItem": harvest.get("requiredItemName")
                    }

                sultan_nodes.append(node_item)
                extracted_nodes.append(node_item)

                # Track category and subcategory counts
                if cat not in category_subcats:
                    category_subcats[cat] = {}
                if subcat not in category_subcats[cat]:
                    category_subcats[cat][subcat] = {
                        "id": subcat,
                        "label": format_subcat_label(subcat, cat),
                        "count": 0,
                        "outputItem": harvest.get("outputItemName") if harvest else None,
                        "outputItemId": harvest.get("outputItemId") if harvest else None
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
