import os
import json
import shutil
import uuid
from datetime import datetime

# Paths
SOURCE_DIR = r"C:\Users\kkmin\Downloads\takeout\Takeout\Keep"
TARGET_DIR = r"c:\Users\kkmin\.gemini\antigravity\scratch\keep-notes"
MEDIA_DIR = os.path.join(TARGET_DIR, "media")

if not os.path.exists(MEDIA_DIR):
    os.makedirs(MEDIA_DIR)

notes = []
labels_list = []
label_map = {} # name -> id

def get_label_id(name):
    if name not in label_map:
        label_id = str(uuid.uuid4())
        label_map[name] = label_id
        labels_list.append({"id": label_id, "name": name})
    return label_map[name]

def usec_to_iso(usec):
    if not usec:
        return datetime.now().isoformat()
    return datetime.fromtimestamp(usec / 1000000).isoformat()

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    title = data.get('title', '')
    
    # Handle content
    content = data.get('textContent', '')
    if 'listContent' in data:
        lines = []
        for item in data['listContent']:
            prefix = "[x]" if item.get('isChecked') else "[ ]"
            text = item.get('text', '')
            lines.append(f"{prefix} {text}")
        content = "\n".join(lines)
    
    # Handle attachments
    images_md = []
    if 'attachments' in data:
        for att in data['attachments']:
            filename = att.get('filePath')
            if filename:
                src_path = os.path.join(SOURCE_DIR, filename)
                if os.path.exists(src_path):
                    dst_path = os.path.join(MEDIA_DIR, filename)
                    if not os.path.exists(dst_path):
                        try:
                            shutil.copy2(src_path, dst_path)
                        except Exception as e:
                            print(f"Error copying {filename}: {e}")
                    
                    # Add image to content if not already there (Google Takeout usually puts images at top/bottom)
                    # The app.js expects markdown images
                    images_md.append(f"![image](media/{filename})")
    
    if images_md:
        content = "\n".join(images_md) + "\n\n" + content

    # Handle labels
    note_label_ids = []
    if 'labels' in data:
        for l in data['labels']:
            note_label_ids.append(get_label_id(l['name']))
    
    # Map color names (Google uses uppercase like DEFAULT, RED, etc.)
    color_map = {
        'DEFAULT': 'default',
        'RED': 'red',
        'ORANGE': 'orange',
        'YELLOW': 'yellow',
        'GREEN': 'green',
        'TEAL': 'teal',
        'BLUE': 'blue',
        'CERULEAN': 'cerulean',
        'PURPLE': 'purple',
        'PINK': 'pink',
        'BROWN': 'brown',
        'GRAY': 'gray'
    }
    color = color_map.get(data.get('color', 'DEFAULT'), 'default')

    notes.append({
        "id": str(uuid.uuid4()),
        "title": title,
        "content": content.strip(),
        "color": color,
        "labels": note_label_ids,
        "pinned": data.get('isPinned', False),
        "archived": data.get('isArchived', False),
        "inTrash": data.get('isTrashed', False),
        "reminder": None,
        "createdAt": usec_to_iso(data.get('createdTimestampUsec')),
        "updatedAt": usec_to_iso(data.get('userEditedTimestampUsec'))
    })

print(f"Starting migration from {SOURCE_DIR}...")

files = [f for f in os.listdir(SOURCE_DIR) if f.endswith('.json')]
for idx, filename in enumerate(files):
    if idx % 100 == 0:
        print(f"Processed {idx}/{len(files)} files...")
    
    filepath = os.path.join(SOURCE_DIR, filename)
    try:
        process_file(filepath)
    except Exception as e:
        print(f"Error processing {filename}: {e}")

# Save to JSON
backup_path = os.path.join(TARGET_DIR, "keep-takeout-backup.json")
with open(backup_path, "w", encoding="utf-8") as f:
    json.dump({"notes": notes, "labels": labels_list}, f, ensure_ascii=False, indent=2)

print(f"\nMigration finished!")
print(f"Total Labels: {len(labels_list)}")
print(f"Total Notes: {len(notes)}")
print(f"Output saved to: {backup_path}")
