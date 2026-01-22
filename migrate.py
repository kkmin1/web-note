import os
import json
import shutil
import uuid
import re
from datetime import datetime

SOURCE_DIR = r"C:\keep-md"
TARGET_DIR = r"c:\Users\kkmin\.gemini\antigravity\scratch\keep-notes"
MEDIA_DIR = os.path.join(TARGET_DIR, "media")

if not os.path.exists(MEDIA_DIR):
    os.makedirs(MEDIA_DIR)

notes = []
labels = []
label_map = {}

# Regex for metadata
meta_re = re.compile(r"^- (\w+): (.*)$")

def read_file_content(file_path):
    """Read file with proper encoding detection"""
    # First try to read as binary to detect encoding
    with open(file_path, 'rb') as f:
        raw_data = f.read()
    
    if not raw_data:
        return ""
    
    # Try encodings in order
    encodings_to_try = [
        'utf-8-sig',  # UTF-8 with BOM
        'utf-8',      # UTF-8
        'utf-16',     # UTF-16
        'cp949',      # Korean Windows
        'euc-kr',     # Korean
    ]
    
    for encoding in encodings_to_try:
        try:
            content = raw_data.decode(encoding)
            # Successfully decoded
            return content
        except (UnicodeDecodeError, LookupError):
            continue
    
    # Last resort: decode with errors='replace' to avoid crashes
    print(f"Warning: Could not properly decode {file_path}, using replacement characters")
    return raw_data.decode('utf-8', errors='replace')

print(f"Starting migration from {SOURCE_DIR}...")

for label_name in os.listdir(SOURCE_DIR):
    folder_path = os.path.join(SOURCE_DIR, label_name)
    if not os.path.isdir(folder_path):
        continue
    
    print(f"Processing label: {label_name}")
    label_id = str(uuid.uuid4())
    labels.append({"id": label_id, "name": label_name})
    label_map[label_name] = label_id
    
    note_count = 0
    for filename in os.listdir(folder_path):
        if filename.endswith(".md"):
            file_path = os.path.join(folder_path, filename)
            
            # Read file content with proper encoding
            full_content = read_file_content(file_path)
            if not full_content:
                continue
            
            lines = full_content.splitlines()
            
            title = filename[:-3]
            content_lines = []
            
            # Default timestamps
            now_iso = datetime.now().isoformat()
            meta = {
                "created": now_iso,
                "updated": now_iso,
                "archived": False,
                "trashed": False
            }
            
            is_meta_section = True
            for line in lines:
                stripped = line.strip()
                if is_meta_section:
                    if stripped == "" or line.startswith("# "):
                        continue
                    match = meta_re.match(stripped)
                    if match:
                        key, val = match.groups()
                        if key == "created" or key == "updated":
                            try:
                                dt_str = val.split(" +")[0]
                                dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
                                meta[key] = dt.isoformat()
                            except:
                                pass
                        elif key == "archived":
                            meta[key] = "true" in val.lower()
                        elif key == "trashed":
                            meta[key] = "true" in val.lower()
                    else:
                        is_meta_section = False
                        content_lines.append(line)
                else:
                    content_lines.append(line)
            
            content = "\n".join(content_lines).strip()
            
            notes.append({
                "id": str(uuid.uuid4()),
                "title": title,
                "content": content,
                "color": "default",
                "labels": [label_id],
                "pinned": False,
                "archived": meta["archived"],
                "inTrash": meta["trashed"],
                "reminder": None,
                "createdAt": meta["created"],
                "updatedAt": meta["updated"]
            })
            note_count += 1
    
    print(f"  Added {note_count} notes.")
    
    # Copy media files
    media_source = os.path.join(folder_path, "media")
    if os.path.exists(media_source) and os.path.isdir(media_source):
        for media_file in os.listdir(media_source):
            src_media = os.path.join(media_source, media_file)
            dst_media = os.path.join(MEDIA_DIR, media_file)
            if not os.path.exists(dst_media):
                try:
                    shutil.copy2(src_media, dst_media)
                except:
                    pass

# Save to JSON with ensure_ascii=False to preserve Unicode
backup_path = os.path.join(TARGET_DIR, "keep-backup.json")
with open(backup_path, "w", encoding="utf-8") as f:
    json.dump({"notes": notes, "labels": labels}, f, ensure_ascii=False, indent=2)

print("\nMigration finished!")
print(f"Total Labels: {len(labels)}")
print(f"Total Notes: {len(notes)}")
print(f"Backup file created: {backup_path}")
print("\nPlease import the keep-backup.json file in the app.")
