import json
import os
import subprocess

GIT_PATH = r"C:\Program Files\Git\bin\git.exe"
BACKUP_FILE = "keep-takeout-backup.json"
DATA_DIR = "data"
NOTES_DIR = os.path.join(DATA_DIR, "notes")

def run_git(args):
    try:
        cmd = [GIT_PATH] + args
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout
    except subprocess.CalledProcessError as e:
        print(f"Error running git {' '.join(args)}: {e.stderr}")
        return None

def main():
    if not os.path.exists(BACKUP_FILE):
        print(f"Backup file {BACKUP_FILE} not found.")
        return

    # Create directories
    if not os.path.exists(NOTES_DIR):
        os.makedirs(NOTES_DIR)

    print(f"Reading {BACKUP_FILE}...")
    with open(BACKUP_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    notes = data.get('notes', [])
    labels = data.get('labels', [])

    print(f"Found {len(notes)} notes and {len(labels)} labels.")

    # Save labels
    labels_file = os.path.join(DATA_DIR, "labels.json")
    with open(labels_file, 'w', encoding='utf-8') as f:
        json.dump(labels, f, indent=2, ensure_ascii=False)
    print(f"Saved {labels_file}")

    # Save individual notes
    print("Splitting notes into individual files...")
    for i, note in enumerate(notes):
        note_id = note.get('id')
        if not note_id:
            continue
        
        note_file = os.path.join(NOTES_DIR, f"{note_id}.json")
        with open(note_file, 'w', encoding='utf-8') as f:
            json.dump(note, f, indent=2, ensure_ascii=False)
        
        if (i + 1) % 500 == 0:
            print(f"Processed {i + 1} notes...")

    # Create a bundle file for fast sync
    bundle_file = os.path.join(DATA_DIR, "bundle.json")
    with open(bundle_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False) # No indent for smaller size
    print(f"Created bundle: {bundle_file}")

    print("All note files created locally.")

    # Git Add, Commit, Push
    print("Adding files to Git...")
    run_git(["add", DATA_DIR])
    
    print("Committing...")
    run_git(["commit", "-m", "Update notes and create bundle for fast sync"])
    
    print("Pushing to GitHub...")
    success = run_git(["push", "origin", "main"])
    
    if success is not None:
        print("Successfully pushed all notes and labels to GitHub!")
    else:
        print("Push failed. You might need to push in smaller batches.")

if __name__ == "__main__":
    main()
